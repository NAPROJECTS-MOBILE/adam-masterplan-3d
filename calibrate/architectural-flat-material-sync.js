import * as THREE from 'three';

/*
  ADAM calibrator — architectural flat material sync

  These two meshes are physically very thin in the GLB, so the main calibrator
  classifies them as `flats` rather than `solids`. That means they otherwise
  miss the universal Building Material controls.

  Keep their geometry/classification unchanged (so we do not accidentally add
  building edge/glow treatment to a floor surface), but mirror the ACTUAL live
  building material values onto them every render. This makes Face colour,
  colour strength, white lift, opacity, roughness and metalness global for these
  meshes too, across every keyframe.
*/

const SOURCE_PATH =
  'Scene_1/Main_Group/clusters/cluster_1/building_2/Rectangle_3_1';

const TARGET_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

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

function copyLiveFaceMaterial(sourceMaterial, targetMaterial) {
  if (!sourceMaterial || !targetMaterial) return;

  if (sourceMaterial.color && targetMaterial.color) {
    targetMaterial.color.copy(sourceMaterial.color);
  }
  if (sourceMaterial.emissive && targetMaterial.emissive) {
    targetMaterial.emissive.copy(sourceMaterial.emissive);
  }
  if ('emissiveIntensity' in sourceMaterial && 'emissiveIntensity' in targetMaterial) {
    targetMaterial.emissiveIntensity = sourceMaterial.emissiveIntensity;
  }
  if ('roughness' in sourceMaterial && 'roughness' in targetMaterial) {
    targetMaterial.roughness = sourceMaterial.roughness;
  }
  if ('metalness' in sourceMaterial && 'metalness' in targetMaterial) {
    targetMaterial.metalness = sourceMaterial.metalness;
  }

  targetMaterial.transparent = sourceMaterial.transparent;
  targetMaterial.opacity = sourceMaterial.opacity;
  targetMaterial.depthWrite = sourceMaterial.depthWrite;
  targetMaterial.depthTest = sourceMaterial.depthTest;
  targetMaterial.toneMapped = sourceMaterial.toneMapped;
  targetMaterial.needsUpdate = true;
}

let sourceMesh = null;
let targets = [];
let resolvedScene = null;

function resolve(scene) {
  if (scene === resolvedScene && sourceMesh && targets.length === TARGET_PATHS.size) return;

  resolvedScene = scene;
  sourceMesh = null;
  targets = [];

  scene.traverse(object => {
    if (!object?.isMesh) return;
    const path = pathOf(object);
    if (path === SOURCE_PATH) sourceMesh = object;
    if (TARGET_PATHS.has(path)) targets.push({ path, mesh: object });
  });

  if (sourceMesh && targets.length) {
    console.info(
      `[ADAM material sync] ${targets.length}/${TARGET_PATHS.size} thin architecture meshes ` +
      'now follow the universal Building Material controls.'
    );
  }
}

function sync(scene) {
  resolve(scene);
  if (!sourceMesh || !targets.length) return;

  const sourceMaterials = materialList(sourceMesh.material);
  if (!sourceMaterials.length) return;

  for (const { mesh } of targets) {
    const targetMaterials = materialList(mesh.material);
    for (let i = 0; i < targetMaterials.length; i++) {
      const sourceMaterial = sourceMaterials[Math.min(i, sourceMaterials.length - 1)];
      copyLiveFaceMaterial(sourceMaterial, targetMaterials[i]);
    }
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_ARCHITECTURAL_FLAT_MATERIAL_PATHS = [...TARGET_PATHS];
