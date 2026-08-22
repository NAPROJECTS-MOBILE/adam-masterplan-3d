import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  ADAM Material 2 — split-GLB targets
  ----------------------------------
  Calibrator-only companion for Claude's M2-split model.

  The rewritten/split model gives the previously unreachable cluster-4 mesh
  groups unique material names. Most nodes in those groups are unnamed, so the
  normal path-based Material 2 list cannot address them. This module captures
  them by MATERIAL NAME instead.

  The two named Rectangle_4 / Rectangle_5 nodes are already owned by the normal
  object-material-2.js path list, so this companion skips those two exact meshes
  to avoid two Material 2 systems fighting over the same mesh. Their ten unnamed
  siblings in each island are handled here, plus the newly isolated small
  Group_2 Rectangle_3.

  Production is untouched.
*/

const SPLIT_MATERIAL_TARGETS = new Set([
  'ADAM_M2_CL4_ISLAND_A',
  'ADAM_M2_CL4_ISLAND_B',
  'ADAM_M2_GRP2_RECT3_SMALL'
]);

const BASE_M2_EXACT_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_4',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5'
]);

const selected = [];
const selectedByMesh = new Map();
const originals = new Map();
const resolvedMaterials = new Set();
const tmpColor = new THREE.Color();

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function materialArray(mesh) {
  if (Array.isArray(mesh.material)) return mesh.material;
  return mesh.material ? [mesh.material] : [];
}

function materialNames(mesh) {
  return materialArray(mesh).map(mat => mat?.name || '');
}

function snapshotMaterials(mesh) {
  return materialArray(mesh).map(mat => ({
    color:mat?.color?.clone?.() || new THREE.Color(0xffffff),
    roughness:mat?.roughness ?? 1,
    metalness:mat?.metalness ?? 0,
    opacity:mat?.opacity ?? 1,
    side:mat?.side ?? THREE.FrontSide,
    alphaTest:mat?.alphaTest ?? 0
  }));
}

function addSelected(mesh, materialName) {
  if (!mesh?.isMesh || !mesh.material || selectedByMesh.has(mesh)) return false;

  const path = pathOf(mesh);
  if (BASE_M2_EXACT_PATHS.has(path)) return false;

  const entry = {
    mesh,
    path,
    sourceMaterialName:materialName,
    material2:null,
    materialWasArray:Array.isArray(mesh.material),
    hookInstalled:false,
    rebinds:0
  };

  selected.push(entry);
  selectedByMesh.set(mesh, entry);
  originals.set(mesh, snapshotMaterials(mesh));
  mesh.userData.adamObjectMaterial = 2;
  mesh.userData.adamObjectMaterialSplit = materialName;
  return true;
}

function capture(root) {
  selected.length = 0;
  selectedByMesh.clear();
  originals.clear();
  resolvedMaterials.clear();

  root?.traverse?.(mesh => {
    if (!mesh?.isMesh || !mesh.material) return;

    const targetName = materialNames(mesh).find(name => SPLIT_MATERIAL_TARGETS.has(name));
    if (!targetName) return;

    resolvedMaterials.add(targetName);
    addSelected(mesh, targetName);
  });

  const counts = {};
  for (const name of SPLIT_MATERIAL_TARGETS) {
    counts[name] = selected.filter(entry => entry.sourceMaterialName === name).length;
  }

  console.info('[ADAM material 2 split] captured material-name targets', {
    resolvedMaterials:[...resolvedMaterials],
    additionalMeshes:selected.length,
    counts,
    expectedAdditionalMeshes:21,
    note:'Rectangle_4 and Rectangle_5 exact named meshes remain owned by base Material 2.'
  });
}

// Wrap after the normal Material 2 loader hook and before path-ribbon-glow.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureMaterial2Split(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function cloneMaterial2(source) {
  const clone = source.clone();
  clone.name = `Object Material 2 — ${source.name || 'split target'}`;
  clone.userData = {
    ...(clone.userData || {}),
    adamObjectMaterial:2,
    adamMaterial2:true,
    adamMaterial2Split:true
  };
  return clone;
}

function bindingMatches(entry) {
  if (!entry.material2?.length) return false;

  if (entry.materialWasArray) {
    return Array.isArray(entry.mesh.material) &&
      entry.mesh.material.length === entry.material2.length &&
      entry.mesh.material.every((mat, index) => mat === entry.material2[index]);
  }

  return !Array.isArray(entry.mesh.material) && entry.mesh.material === entry.material2[0];
}

function assignBinding(entry) {
  if (!entry.material2) {
    const current = materialArray(entry.mesh);
    if (!current.length) return false;

    entry.materialWasArray = Array.isArray(entry.mesh.material);
    entry.material2 = current.map(cloneMaterial2);
  }

  if (!bindingMatches(entry)) {
    entry.mesh.material = entry.materialWasArray ? entry.material2 : entry.material2[0];
    entry.rebinds++;
  }

  if (!entry.hookInstalled) {
    const prior = entry.mesh.onBeforeRender;
    entry.mesh.onBeforeRender = function adamMaterial2SplitBeforeRender(...args) {
      if (typeof prior === 'function') prior.apply(this, args);
      const liveEntry = selectedByMesh.get(this);
      if (!liveEntry) return;
      assignBinding(liveEntry);
      applyOne(liveEntry);
    };
    entry.hookInstalled = true;
  }

  return true;
}

function applyOne(entry) {
  if (!entry || !assignBinding(entry)) return;

  // Use the exact same live style object as the normal Material 2 controls.
  const style = window.__ADAM_OBJECT_MATERIAL_2_STYLE;
  if (!style) return;

  const snaps = originals.get(entry.mesh) || [];
  const mats = entry.material2 || [];
  const tint = tmpColor.set(style.face);
  const lift = Math.max(0, style.faceLift);

  mats.forEach((mat, index) => {
    const original = snaps[index] || snaps[0];
    if (!mat || !original) return;

    if (mat.color) mat.color.copy(original.color).lerp(tint, style.faceTint);
    if (mat.emissive && mat.color) {
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = lift;
    }
    if ('roughness' in mat) mat.roughness = style.faceRoughness;
    if ('metalness' in mat) mat.metalness = style.faceMetalness;
    mat.transparent = true;
    mat.opacity = style.faceOpacity;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.needsUpdate = true;
  });
}

function applySplitMaterial2() {
  for (const entry of selected) applyOne(entry);
}

// Installed outside the base Material 2 wrapper. We style the additional split
// meshes, then call through to base Material 2 for all of its existing targets.
const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamMaterial2SplitRender(scene, camera) {
  applySplitMaterial2();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_OBJECT_MATERIAL_2_SPLIT_MATERIALS = SPLIT_MATERIAL_TARGETS;
window.__ADAM_OBJECT_MATERIAL_2_SPLIT_MESHES = () => selected.map(entry => entry.mesh);
window.__ADAM_OBJECT_MATERIAL_2_SPLIT_ENTRIES = () => selected;
window.__ADAM_OBJECT_MATERIAL_2_SPLIT_RESOLVED = () => [...resolvedMaterials];
