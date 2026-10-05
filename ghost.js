/* ============================================================
   crazyhouse: the ghost pass.

   Draws anything on GHOST_LAYER (ghoul1) on its own, blurs it,
   and lays it over the finished frame at some strength. That's
   what lets him smear out of focus and fade away, then sharpen
   back in, while the house stays crisp.

   How:
   1. Into an offscreen image: the house as invisible depth only
      (so walls and furniture still hide him), then him, on a
      clear background.
   2. Blur that image with a Gaussian blur, a horizontal pass then a
      vertical pass, repeated for bigger blurs.
   3. Lay it over the screen: his lit body covers whatever's behind
      him, scaled by strength.
      At full strength and no blur it looks exactly like drawing
      him normally.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';

export const GHOST_LAYER = 1;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 13-tap Gaussian along one direction (7 lookups, using linear filtering)
const BLUR = /* glsl */ `
  uniform sampler2D tex;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tex, vUv) * 0.1964825501511404;
    c += texture2D(tex, vUv + dir * 1.411764705882353) * 0.2969069646728344;
    c += texture2D(tex, vUv - dir * 1.411764705882353) * 0.2969069646728344;
    c += texture2D(tex, vUv + dir * 3.2941176470588234) * 0.09447039785044732;
    c += texture2D(tex, vUv - dir * 3.2941176470588234) * 0.09447039785044732;
    c += texture2D(tex, vUv + dir * 5.176470588235294) * 0.010381362401148057;
    c += texture2D(tex, vUv - dir * 5.176470588235294) * 0.010381362401148057;
    gl_FragColor = c;
  }
`;

// Lay the (premultiplied) ghost over the frame. The offscreen image
// holds raw light values, so it gets the same tone mapping and colour
// conversion the main view gets. gain thickens his blurred outline so
// a smear doesn't thin out to nothing.
const COMPOSITE = /* glsl */ `
  uniform sampler2D tex;
  uniform float strength;
  uniform float gain;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tex, vUv);
    float a = min(c.a * gain, 1.0) * strength;
    vec3 col = c.a > 0.0001 ? c.rgb / c.a : vec3(0.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor = vec4(gl_FragColor.rgb * a, a);
  }
`;

export function createGhostPass(renderer) {
  // half-float, so bright lamp-lit values survive until tone mapping
  const opts = { type: THREE.HalfFloatType };
  const sharp = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: 4 });   // antialiased, like the main view
  const pingA = new THREE.WebGLRenderTarget(1, 1, opts);
  const pingB = new THREE.WebGLRenderTarget(1, 1, opts);

  // one big triangle that covers the screen
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
    vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, strength: { value: 1 }, gain: { value: 1 } },
    vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor
  });
  const quad = new THREE.Mesh(tri, blurMat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // the house, drawn into depth only
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

  const keepColor = new THREE.Color();
  let w = 1, h = 1;

  function setSize(width, height) {
    w = width; h = height;
    for (const rt of [sharp, pingA, pingB]) rt.setSize(w, h);
  }

  function pass(from, to, dx, dy) {
    quad.material = blurMat;
    blurMat.uniforms.tex.value = from.texture;
    blurMat.uniforms.dir.value.set(dx / w, dy / h);
    renderer.setRenderTarget(to);
    renderer.render(quadScene, quadCam);
  }

  /* strength 0..1 (0 skips everything), blurPx = blur radius in
     drawing-buffer pixels. Call right after rendering the frame. */
  function render(scene, camera, strength, blurPx, target = null) {
    if (strength <= 0.002) return;

    const background = scene.background;
    const autoClear = renderer.autoClear;
    renderer.getClearColor(keepColor);
    const keepAlpha = renderer.getClearAlpha();

    // 1. the house as depth, then him, on a see-through background
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(sharp);
    renderer.clear();
    renderer.autoClear = false;
    const keepLayers = camera.layers.mask;
    camera.layers.set(0);                     // solid things only (not glass)
    scene.overrideMaterial = depthOnly;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(GHOST_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = keepLayers;

    // 2. blur: the 13-tap kernel is about 2.5 steps wide, so bigger
    //    blurs take a few rounds (each round stacks on the last)
    let result = sharp;
    const spread = blurPx / 2.5;
    if (spread > 0.15) {
      const rounds = Math.min(3, Math.ceil(spread / 2));
      const each = spread / Math.sqrt(rounds);
      let from = sharp;
      for (let i = 0; i < rounds; i++) {
        pass(from, pingA, each, 0);
        pass(pingA, pingB, 0, each);
        from = pingB;
      }
      result = pingB;
    }

    // 3. over the frame
    quad.material = compMat;
    compMat.uniforms.tex.value = result.texture;
    compMat.uniforms.strength.value = strength;
    compMat.uniforms.gain.value = 1 + Math.min(blurPx, 40) * 0.12;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);

    scene.background = background;
    renderer.setClearColor(keepColor, keepAlpha);
    renderer.autoClear = autoClear;
  }

  return { setSize, render };
}
