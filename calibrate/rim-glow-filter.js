import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=67-20260820-1235';

/*
  ADAM rim-glow policy
  --------------------
  The calibrator's native edge builder only creates glow for meshes classified
  as `solids` by world-space height. A number of user-confirmed architectural
  targets are thin/rotated and fall into the `flats` bucket, so they otherwise
  receive no glow.

  Policy:
    1. every GLB mesh under Main_Group/clusters is glow-eligible by default;
    2. every path in FORCE_GLOW_PATHS is ALWAYS glow-eligible;
    3. native app-v2 glow is left alone;
    4. missing glow is added locally so it follows object motion;
    5. legacy exclusions remain only for paths that are NOT force-selected;
    6. style/visibility/resolution mirror the app's existing glow layer.
*/
export const NO_RIM_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3'
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

function isForced(path) { return FORCE_GLOW_PATHS.has(path); }
function isExcluded(path) { return NO_RIM_GLOW_PATHS.has(path) && !isForced(path); }
function isNativeOrSupplementalGlow(object) { return object?.isLineSegments2 && object.material?.blending === THREE.AdditiveBlending; }
function isSupplementalGlow(object) { return !!object?.userData?.adamSupplementalRimGlow; }
function isEligibleClusterMesh(object) {
  if (!object?.isMesh || object.isLineSegments2) return false;
  if (!object.geometry?.attributes?.position) return false;
  const path = pathOf(object);
  return isForced(path) || path.includes('Scene_1/Main_Group/clusters/');
}

function makeLineGeometry(mesh, thresholdAngle = 30) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) { edges.dispose(); return null; }
  const arr = new Float32Array(pos.count * 3);
  arr.set(pos.array);
  edges.dispose();
  const geo = new LineSegmentsGeometry();
  geo.setPositions(arr);
  return geo;
}

function directNativeGlowChildren(mesh) {
  return mesh.children.filter(child => isNativeOrSupplementalGlow(child) && !isSupplementalGlow(child));
}
function findNativeGlowTemplate(scene) {
  let template = null;
  scene.traverse(object => {
    if (template || !isNativeOrSupplementalGlow(object) || isSupplementalGlow(object)) return;
    if (!object.parent) return;
    if (isExcluded(pathOf(object.parent))) return;
    template = object;
  });
  return template;
}

const originalUpdateMatrixWorld = LineSegments2.prototype.updateMatrixWorld;
LineSegments2.prototype.updateMatrixWorld = function updateMatrixWorld(force) {
  originalUpdateMatrixWorld.call(this, force);
  if (!isNativeOrSupplementalGlow(this) || !this.parent) return;
  const path = pathOf(this.parent);
  if (isExcluded(path)) this.visible = false;
};

const supplemental = new Set();
let templateIdentity = null;
let lastAddedCount = -1;
let lastForcedResolved = -1;

function destroySupplemental() {
  for (const line of supplemental) {
    line.removeFromParent();
    line.geometry?.dispose?.();
    line.material?.dispose?.();
  }
  supplemental.clear();
}
function cloneTemplateMaterial(template) {
  const mat = template.material.clone();
  mat.blending = THREE.AdditiveBlending;
  mat.depthTest = true;
  mat.depthWrite = false;
  mat.transparent = true;
  mat.toneMapped = false;
  return mat;
}
function addSupplementalGlow(mesh, template) {
  const geometry = makeLineGeometry(mesh, 30);
  if (!geometry) return 0;
  const makeOne = instanceMatrix => {
    const line = new LineSegments2(geometry.clone(), cloneTemplateMaterial(template));
    line.userData.adamSupplementalRimGlow = true;
    line.frustumCulled = false;
    line.renderOrder = template.renderOrder || 2;
    if (instanceMatrix) {
      line.matrixAutoUpdate = false;
      line.matrix.copy(instanceMatrix);
    }
    mesh.add(line);
    supplemental.add(line);
    return 1;
  };
  let made = 0;
  if (mesh.isInstancedMesh) {
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); made += makeOne(matrix.clone()); }
    geometry.dispose();
  } else {
    const line = new LineSegments2(geometry, cloneTemplateMaterial(template));
    line.userData.adamSupplementalRimGlow = true;
    line.frustumCulled = false;
    line.renderOrder = template.renderOrder || 2;
    mesh.add(line);
    supplemental.add(line);
    made = 1;
  }
  return made;
}
function copyGlowStyle(template, line) {
  const src = template.material, dst = line.material;
  if (src.color && dst.color) dst.color.copy(src.color);
  if ('opacity' in src) dst.opacity = src.opacity;
  if ('linewidth' in src) dst.linewidth = src.linewidth;
  if (src.resolution && dst.resolution) dst.resolution.copy(src.resolution);
  line.visible = template.visible;
}
function rebuildMissingGlow(scene, template) {
  destroySupplemental();
  let added = 0, forcedResolved = 0;
  scene.traverse(mesh => {
    if (!isEligibleClusterMesh(mesh)) return;
    const path = pathOf(mesh);
    if (isForced(path)) forcedResolved++;
    if (isExcluded(path)) {
      for (const glow of directNativeGlowChildren(mesh)) glow.visible = false;
      return;
    }
    if (directNativeGlowChildren(mesh).length) return;
    added += addSupplementalGlow(mesh, template);
  });
  if (added !== lastAddedCount || forcedResolved !== lastForcedResolved) {
    lastAddedCount = added;
    lastForcedResolved = forcedResolved;
    console.info(`[ADAM rim glow] added ${added} supplemental glow layer(s); forced targets resolved=${forcedResolved}/${FORCE_GLOW_PATHS.size}; legacy blacklist=${NO_RIM_GLOW_PATHS.size}`);
  }
}
function syncRimGlow(scene) {
  const template = findNativeGlowTemplate(scene);
  if (!template) return;
  if (template !== templateIdentity) {
    templateIdentity = template;
    rebuildMissingGlow(scene, template);
  }
  for (const line of supplemental) {
    if (!line.parent) continue;
    const path = pathOf(line.parent);
    const excluded = isExcluded(path);
    line.visible = excluded ? false : template.visible;
    if (!excluded) copyGlowStyle(template, line);
  }
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  syncRimGlow(scene);
  return originalRender.call(this, scene, camera);
};

window.__ADAM_NO_RIM_GLOW_PATHS = NO_RIM_GLOW_PATHS;
window.__ADAM_FORCE_GLOW_PATHS = FORCE_GLOW_PATHS;
window.__ADAM_RIM_GLOW_SUPPLEMENTAL = supplemental;
