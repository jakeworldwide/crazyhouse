/* ============================================================
   crazyhouse: the kitchen TV.

   Same idea as Farlands Views: one video holds a grid of feeds (an
   8x8 atlas, tv/reel.mp4) and the TV just shows its own tile of it.
   The glow is prebaked: tv/glow.png has one pixel per tile per frame,
   the tile's average brightness, so the TV's light can follow what's
   on the screen without ever reading the video back. See
   tools/build-tv.sh for how both files are made.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { X, Z, FLOOR, MAT, EDGE } from './world.js?v=18';
import * as CRT from './crt.js?v=2';

const GRID = 8;                 // the atlas is GRID x GRID tiles
const FRAMES = 64;              // the reel's length in frames
const FPS = 8;
const TILE = 29;                // which feed this TV shows (0 .. 63); 29 changes a lot, so the glow does too
const GLOW = 60;                // light strength at full-white picture
const SPOT = [930, 684];        // blueprint pixel: on the south counter, beside the fridge
const COUNTER = FLOOR + 3;      // top of the counter, in feet

const YAW = Math.PI / 4;        // front (-z) turns toward the living room (-x)
const SIZE = 3;                 // the model is 0.6 wide; this makes it about 1.8'
const SCREEN_Y = 0.31 * SIZE;   // height of the screen's middle above the counter

// the picture: grey, with scanlines, a soft vignette and a slight flicker
const screenMat = (map) => new THREE.ShaderMaterial({
  uniforms: {
    map: { value: map },
    tile: { value: new THREE.Vector2(TILE % GRID, GRID - 1 - Math.floor(TILE / GRID)) },
    time: { value: 0 },
    gain: { value: 1.5 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D map;
    uniform vec2 tile;
    uniform float time, gain;
    varying vec2 vUv;
    void main() {
      vec2 inset = vec2(0.5) / vec2(160.0, 90.0);
      vec2 uv = clamp(vUv, inset, 1.0 - inset);
      float g = dot(texture2D(map, (tile + uv) / ${GRID}.0).rgb, vec3(0.299, 0.587, 0.114));
      g *= gain;
      gl_FragColor = vec4(vec3(g), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});

/* Builds the TV. Returns { object, light, update(dt), play(), pause() }.
   The light is a normal shadowed lamp, so add it to the world's lamps. */
export function createTv(makeShadowed) {
  const video = document.createElement('video');
  video.src = new URL('./tv/reel.mp4', import.meta.url).href;
  Object.assign(video, { loop: true, muted: true, playsInline: true, preload: 'auto' });
  const map = new THREE.VideoTexture(video);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = false;

  const x = X(SPOT[0]), z = Z(SPOT[1]);
  // the CRT, from the model's mesh (crt.js); it sits on the counter with its
  // front toward the room
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(CRT.POSITIONS, 3));
  body.setAttribute('normal', new THREE.Float32BufferAttribute(CRT.NORMALS, 3));
  body.setIndex(CRT.INDICES);
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(CRT.SCREEN_POSITIONS, 3));
  face.setAttribute('uv', new THREE.Float32BufferAttribute(CRT.SCREEN_UVS, 2));
  face.setIndex(CRT.SCREEN_INDICES);

  const root = new THREE.Group();            // the TV, and its light (which must not be scaled)
  root.name = 'tv';
  const tv = new THREE.Group();
  tv.position.set(x, COUNTER, z);
  tv.scale.setScalar(SIZE);
  tv.rotation.y = YAW;
  tv.add(new THREE.Mesh(body, MAT.dark), new THREE.LineSegments(new THREE.EdgesGeometry(body, 20), EDGE));
  const screen = new THREE.Mesh(face, screenMat(map));
  tv.add(screen);
  root.add(tv);
  const screenY = COUNTER + SCREEN_Y;

  // the glow: a lamp just in front of the screen
  const light = makeShadowed(new THREE.PointLight(0xffffff, GLOW * 0.2, 0, 2));
  light.name = 'tv-light';
  light.position.set(x - 0.75 * Math.sin(YAW), screenY, z - 0.75 * Math.cos(YAW));
  root.add(light);

  // the prebaked brightness table, read once from tv/glow.png
  let glow = null;                                    // glow[frame * 64 + tile] = 0..1 (linear)
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, img.width, img.height).data;
    glow = new Float32Array(FRAMES * GRID * GRID);
    for (let f = 0; f < FRAMES; f++) {
      for (let t = 0; t < GRID * GRID; t++) {
        const i = (((t / GRID | 0) * img.width) + f * GRID + (t % GRID)) * 4;
        glow[f * GRID * GRID + t] = Math.pow(px[i] / 255, 2.2);
      }
    }
  };
  img.src = new URL('./tv/glow.png', import.meta.url).href;

  const mat = screen.material;
  let level = 0.2;                                    // smoothed so the glow doesn't strobe
  const update = dt => {
    mat.uniforms.time.value = performance.now() / 1000;
    if (!glow) return;
    const f = Math.floor(video.currentTime * FPS) % FRAMES;
    const target = glow[f * GRID * GRID + TILE];
    level += (target - level) * Math.min(1, dt * 8);
    light.intensity = GLOW * (0.12 + 1.6 * level);
  };

  root.traverse(o => {
    if (o.isMesh) { o.castShadow = o !== screen; o.receiveShadow = o !== screen; }
  });
  return {
    object: root, light, update,
    play: () => { video.play().catch(() => {}); },
    pause: () => video.pause()
  };
}
