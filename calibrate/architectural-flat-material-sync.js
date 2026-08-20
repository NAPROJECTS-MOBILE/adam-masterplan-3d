import * as THREE from 'three';

/*
  ADAM calibrator — architectural flat material sync v3

  These five architectural meshes are physically very thin in the GLB, so
  app-v2 classifies them as `flats` rather than `solids` and the normal
  Building Material loop skips them.

  This module reads the GLOBAL Building Material controls themselves and
  applies those values directly to the five exact GLB targets on every render.
  They therefore follow Face colour, colour strength, white lift, opacity,
  roughness and metalness for every keyframe, without reclassifying them as
  solids or adding unwanted edge/glow geometry.
*/

const TARGET_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2'
]);

const originals = new WeakMap();
let targets = [];
let resolvedScene = null;
let lastResolutionSignature = '';
const chosen = new THREE.Color();

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function materialList(material) {
  return Array.isArray(material) ? material : material ? [material] : [];
}

function resolve(scene) {
  if (scene === resolvedScene && targets.length === TARGET_PATHS.size) return;

  resolvedScene = scene;
  targets = [];

  scene.traverse(object => {
    if (!object?.isMesh) return;
    const path = pathOf(object);
    if (!TARGET_PATHS.has(path)) return;

    targets.push({ path, mesh: object });
    for (const mat of materialList(object.material)) {
      if (!originals.has(mat)) {
        originals.set(mat, {
          color: mat?.color?.clone?.() || new THREE.Color(0xffffff)
        });
      }
    }
  });

  const signature = targets.map(t => t.path).sort().join('|');
  if (signature !== lastResolutionSignature) {
    lastResolutionSignature = signature;
    console.info(
      `[ADAM material sync v3] resolved ${targets.length}/${TARGET_PATHS.size}:`,
      targets.map(t => t.path)
    );

    const missing = [...TARGET_PATHS].filter(path => !targets.some(t => t.path === path));
    if (missing.length) console.warn('[ADAM material sync v3] unresolved targets:', missing);
  }
}

function readGlobalFaceStyle() {
  const wraps = [...document.querySelectorAll('#faceCtls .ctl')];
  if (wraps.length < 6) return null;

  const inputAt = index => wraps[index]?.querySelector('input');
  const faceInput = inputAt(0);
  const tintInput = inputAt(1);
  const liftInput = inputAt(2);
  const opacityInput = inputAt(3);
  const roughnessInput = inputAt(4);
  const metalnessInput = inputAt(5);

  if (!faceInput || !tintInput || !liftInput || !opacityInput || !roughnessInput || !metalnessInput) {
    return null;
  }

  return {
    face: faceInput.value,
    tint: Number(tintInput.value),
    lift: Number(liftInput.value),
    opacity: Number(opacityInput.value),
    roughness: Number(roughnessInput.value),
    metalness: Number(metalnessInput.value)
  };
}

function applyFaceStyle(mat, style) {
  if (!mat || !style) return;

  const original = originals.get(mat);
  if (mat.color && original?.color) {
    chosen.set(style.face);
    mat.color.copy(original.color).lerp(chosen, THREE.MathUtils.clamp(style.tint, 0, 1));
  }

  if (mat.emissive && mat.color) {
    mat.emissive.copy(mat.color);
    mat.emissiveIntensity = Math.max(0, style.lift);
  }

  if ('roughness' in mat) mat.roughness = THREE.MathUtils.clamp(style.roughness, 0, 1);
  if ('metalness' in mat) mat.metalness = Math.max(0, style.metalness);

  mat.transparent = true;
  mat.opacity = THREE.MathUtils.clamp(style.opacity, 0, 1);
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.needsUpdate = true;
}

function sync(scene) {
  resolve(scene);
  if (!targets.length) return;

  const style = readGlobalFaceStyle();
  if (!style) return;

  for (const { mesh } of targets) {
    for (const mat of materialList(mesh.material)) applyFaceStyle(mat, style);
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_ARCHITECTURAL_FLAT_MATERIAL_PATHS = [...TARGET_PATHS];
