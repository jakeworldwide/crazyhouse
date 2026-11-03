/* ============================================================
   crazyhouse: build the house from its files.

   The level (house.json) says which model (models/*.glb) goes where,
   which room or kind of thing it belongs to, and where the lights hang.
   This loads them all, puts each one in its place, hangs the lights,
   puts back what the file format can't hold (said in each model's
   extras), wires up the behaviour (components.js), and finishes the
   house the same way it always has (world.js finishHouse: shadows,
   light switches, look-at text, fewer bigger draws).

   To change a model: edit its .glb (Blender: File > Import > glTF, then
   export it back over the same file). To move something: its line in
   house.json. To add something: a model in models/ and a line in
   house.json.
   ============================================================ */

import * as THREE from './vendor/three-r186/three.module.js';
import { GLTFLoader } from './vendor/three-r186/addons/loaders/GLTFLoader.js';
import { finishHouse, sky, shadowed } from './world.js?v=54';
import { applyComponents } from './components.js?v=3';

export async function loadHouse({ url = 'house.json', onProgress } = {}) {
  const level = await (await fetch(url)).json();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 110, 340);                       // the far yard fades into the night

  // the groups (rooms and kinds of thing), in order
  const groups = new Map();
  for (const g of level.groups) {
    const group = new THREE.Group();
    group.name = g.name;
    (g.parent ? groups.get(g.parent) : scene).add(group);
    groups.set(g.name, group);
  }

  // the models, all at once; then each into its place, in the level's order
  const loader = new GLTFLoader().register(pictureStraightFromFile);
  let done = 0;
  const loaded = await Promise.all(level.items.map(async it => {
    const gltf = await loader.loadAsync(it.model);
    onProgress?.(++done / level.items.length);
    return gltf;
  }));
  level.items.forEach((it, i) => {
    const gltf = loaded[i], place = new THREE.Group();
    place.position.fromArray(it.position);
    place.quaternion.fromArray(it.quaternion);
    place.scale.fromArray(it.scale);
    const model = gltf.scene.children[0];
    if (!model) return;
    fixUp(model);
    place.add(model);
    if (gltf.animations.length) model.userData.clips = gltf.animations;
    (it.parent ? groups.get(it.parent) : scene).add(place);
  });
  // the sky, moon and stars are code (world.js sky()), like an engine's skybox
  scene.add(sky());

  return finish(scene, level);
}

/* The pictures inside a .glb. The loader normally turns each one into a
   blob: URL and loads that, but the site's security rules (CSP) don't allow
   blob: URLs, so on the real site every picture quietly failed and things
   came out blank. This reads them straight out of the file's bytes instead. */
function pictureStraightFromFile(parser) {
  const usual = parser.loadImageSource.bind(parser);
  parser.loadImageSource = (i, loader) => {
    const src = parser.json.images[i];
    if (src.bufferView === undefined || typeof createImageBitmap === 'undefined') return usual(i, loader);
    if (parser.sourceCache[i]) return parser.sourceCache[i].then(t => t.clone());
    return parser.sourceCache[i] = parser.getDependency('bufferView', src.bufferView)
      .then(bytes => createImageBitmap(new Blob([bytes], { type: src.mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then(image => {
        const tex = new THREE.Texture(image);
        tex.needsUpdate = true;
        tex.userData.mimeType = src.mimeType;
        return tex;
      });
  };
  return { name: 'picture-straight-from-file' };
}

// what the files can't hold, put back (it's said in each thing's extras)
const standard = new WeakMap();
function fixUp(model) {
  model.traverse(o => {
    o.name = o.userData.name || '';                                      // (the loader names unnamed things; they weren't)
    delete o.userData.name;
    if (o.userData.hidden) { o.visible = false; delete o.userData.hidden; }
    if (o.userData.layer) o.layers.mask = o.userData.layer;
    if (!o.material) return;
    // a bumpy material comes in as the heavier "physical" kind; nothing here uses its extras, so back to standard
    const p = o.material;
    if (p.isMeshPhysicalMaterial && !p.transmission && !p.clearcoat && !p.sheen && !p.iridescence) {
      if (!standard.has(p)) standard.set(p, new THREE.MeshStandardMaterial().copy(p));
      o.material = standard.get(p);
    }
    for (const m of [].concat(o.material)) {
      if (m.userData.side === 'back') m.side = THREE.BackSide;
      if (m.userData.offset) { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; }
      if (m.userData.blend === 'add') { m.blending = THREE.AdditiveBlending; m.depthWrite = false; }
      if (m.map) m.map.anisotropy = 4;
    }
  });
}

/* Each file brings its own copy of a material, even the ones lots of things
   share (the glow in every lampshade, black wires, plain paint). Things that
   share a material can be drawn together, so identical untextured ones are
   made one again. (Textured ones stay their own.) */
function shareMaterials(scene) {
  const seen = new Map();
  const key = m => m.map || m.emissiveMap ? null : [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness,
    m.opacity, m.transparent, m.side, m.blending, m.vertexColors, m.polygonOffset, m.depthWrite, m.name, JSON.stringify(m.userData)].join('|');
  scene.traverse(o => {
    if (!o.material || Array.isArray(o.material) || o.userData.component) return;
    const k = key(o.material);
    if (!k) return;
    if (!seen.has(k)) seen.set(k, o.material);
    o.material = seen.get(k);
  });
}

function finish(scene, level) {
  // the lights, hung off what they belong to
  const lamps = [];
  for (const L of level.lights) {
    const anchor = scene.getObjectByName(L.parent) || scene;
    const color = new THREE.Color(L.color);
    const light = L.type === 'SpotLight' ? new THREE.SpotLight(color, L.intensity, L.distance, L.angle, L.penumbra, L.decay)
      : L.type === 'DirectionalLight' ? new THREE.DirectionalLight(color, L.intensity)
      : new THREE.PointLight(color, L.intensity, L.distance, L.decay);
    light.name = L.name;
    light.position.fromArray(L.position);
    light.visible = L.visible !== false;
    anchor.add(light);
    if (L.target && light.target) { light.target.position.fromArray(L.target); anchor.add(light.target); }
    if (L.shadow) {
      shadowed(light, L.shadow.size, L.shadow.far);
      Object.assign(light.shadow, { bias: L.shadow.bias, normalBias: L.shadow.normalBias, radius: L.shadow.radius, intensity: L.shadow.intensity });
      light.shadow.camera.near = L.shadow.near;
      lamps.push(light);
    }
  }
  scene.userData.lamps = lamps;

  shareMaterials(scene);
  applyComponents(scene);
  return finishHouse(scene);
}
