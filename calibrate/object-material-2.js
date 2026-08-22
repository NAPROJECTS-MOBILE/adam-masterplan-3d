import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  ADAM Object Material 2
  ----------------------
  The proven path-targeting system remains intact for all existing Material 2
  objects. The M2-split GLB also exposes three previously ambiguous/unreachable
  groups through unique material names, so this same capture/apply pipeline now
  accepts either an exact object path OR one of those material names.

  Keeping both selectors in this one module is intentional: the old path system
  already works, and the split-material meshes must use the exact same clone,
  rebind and UI styling path rather than a second competing Material 2 module.
*/

const MATERIAL_2_TARGET_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Group_3/Boolean_4_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa/Group_3/Boolean_3_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1/Boolean_4_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1/Boolean_3_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Boolean_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Boolean_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2/Boolean_4_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2/Boolean_3_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2/Rectangle_11_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Rectangle_11',
  'Scene_1/Main_Group/clusters/cluster_3/villa/Group_3/Rectangle_11_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1/Rectangle_11_1',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_1',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_4',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_10',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_1',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_10',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_5',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_10',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/Rectangle_14',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_2',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_3',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_4',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_5',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_6',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_30_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_31_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_32_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_33_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_34_1',
  'Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_10',
  'Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_9',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_3',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_2',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_30',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_31',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_32',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_33',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_34',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_36',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_36_1',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_38',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_39',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_40',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_41',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_42'
]);

// These are unique only in the split GLB. They intentionally catch anonymous
// nodes which cannot be selected reliably by pathOf().
const MATERIAL_2_TARGET_MATERIALS = new Set([
  'ADAM_M2_CL4_ISLAND_A',
  'ADAM_M2_CL4_ISLAND_B',
  'ADAM_M2_GRP2_RECT3_SMALL'
]);

const SHARED_MATERIAL_GUARD_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_4',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5'
]);

const style = {
  face:'#ebebeb',
  faceTint:0.70,
  faceLift:0.15,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0.0
};

const selected = [];
const selectedByMesh = new Map();
const originals = new Map();
const resolvedTargets = new Set();
const resolvedMaterialTargets = new Set();
let uiBound = false;
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

function targetMaterialName(mesh) {
  return materialArray(mesh)
    .map(mat => mat?.name || '')
    .find(name => MATERIAL_2_TARGET_MATERIALS.has(name)) || '';
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

function addSelectedMesh(mesh, targetKey, sourceKind, sourceValue) {
  if (!mesh?.isMesh || !mesh.material || selectedByMesh.has(mesh)) return false;

  const entry = {
    mesh,
    targetKey,
    sourceKind,
    sourceValue,
    meshPath:pathOf(mesh),
    material2:null,
    materialWasArray:Array.isArray(mesh.material),
    hookInstalled:false,
    rebinds:0
  };

  selected.push(entry);
  selectedByMesh.set(mesh, entry);
  originals.set(mesh, snapshotMaterials(mesh));
  mesh.userData.adamObjectMaterial = 2;
  mesh.userData.adamObjectMaterialSource = sourceKind;
  mesh.userData.adamObjectMaterialPath = entry.meshPath;
  if (sourceKind === 'material') mesh.userData.adamObjectMaterialSourceMaterial = sourceValue;
  return true;
}

function capture(root) {
  selected.length = 0;
  selectedByMesh.clear();
  originals.clear();
  resolvedTargets.clear();
  resolvedMaterialTargets.clear();

  root?.traverse?.(mesh => {
    if (!mesh?.isMesh || !mesh.material) return;

    const path = pathOf(mesh);
    const materialTarget = targetMaterialName(mesh);

    // Record material-name resolution even if this exact mesh is also already
    // addressable by a path. This makes the status line a useful integrity check.
    if (materialTarget) resolvedMaterialTargets.add(materialTarget);

    if (MATERIAL_2_TARGET_PATHS.has(path)) {
      if (addSelectedMesh(mesh, path, 'path', path)) resolvedTargets.add(path);
      return;
    }

    if (materialTarget) {
      addSelectedMesh(mesh, `material:${materialTarget}`, 'material', materialTarget);
    }
  });

  const missingPaths = [...MATERIAL_2_TARGET_PATHS].filter(path => !resolvedTargets.has(path));
  const missingMaterials = [...MATERIAL_2_TARGET_MATERIALS]
    .filter(name => !resolvedMaterialTargets.has(name));

  const splitCounts = {};
  for (const name of MATERIAL_2_TARGET_MATERIALS) {
    splitCounts[name] = selected.filter(entry =>
      materialArray(entry.mesh).some(mat => mat?.name === name)
    ).length;
  }

  console.info('[ADAM material 2] capture complete', {
    resolvedPaths:`${resolvedTargets.size}/${MATERIAL_2_TARGET_PATHS.size}`,
    resolvedSplitMaterials:`${resolvedMaterialTargets.size}/${MATERIAL_2_TARGET_MATERIALS.size}`,
    renderMeshes:selected.length,
    splitCounts
  });
  if (missingPaths.length) console.warn('[ADAM material 2] unresolved target paths:', missingPaths);
  if (missingMaterials.length) console.warn('[ADAM material 2] unresolved split materials:', missingMaterials);
  updateStatus();
}

const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureMaterial2(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    setTimeout(waitForUI, 0);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function cloneMaterial2(source) {
  const clone = source.clone();
  clone.name = 'Object Material 2';
  clone.userData = {
    ...(clone.userData || {}),
    adamObjectMaterial:2,
    adamMaterial2:true
  };
  return clone;
}

function bindingMatches(entry) {
  if (!entry.material2?.length) return false;
  const { mesh, material2, materialWasArray } = entry;

  if (materialWasArray) {
    return Array.isArray(mesh.material) &&
      mesh.material.length === material2.length &&
      mesh.material.every((mat, i) => mat === material2[i]);
  }

  return !Array.isArray(mesh.material) && mesh.material === material2[0];
}

function assignAuthoritativeBinding(entry) {
  const { mesh } = entry;

  if (!entry.material2) {
    const current = materialArray(mesh);
    if (!current.length) return false;
    entry.materialWasArray = Array.isArray(mesh.material);
    entry.material2 = current.map(cloneMaterial2);

    if (SHARED_MATERIAL_GUARD_PATHS.has(entry.meshPath)) {
      console.info('[ADAM material 2 guard] isolated target material', {
        path:entry.meshPath,
        source:current.map(mat => mat.uuid),
        material2:entry.material2.map(mat => mat.uuid)
      });
    }
  }

  if (!bindingMatches(entry)) {
    mesh.material = entry.materialWasArray ? entry.material2 : entry.material2[0];
    entry.rebinds++;

    if (SHARED_MATERIAL_GUARD_PATHS.has(entry.meshPath) && entry.rebinds <= 3) {
      console.warn(
        `[ADAM material 2 guard] rebound ${entry.meshPath} to its authoritative Material 2 clone ` +
        `(rebind ${entry.rebinds}).`
      );
    }
  }

  if (!entry.hookInstalled) {
    const prior = mesh.onBeforeRender;
    mesh.onBeforeRender = function adamMaterial2BeforeRender(...args) {
      if (typeof prior === 'function') prior.apply(this, args);
      const liveEntry = selectedByMesh.get(this);
      if (!liveEntry) return;
      assignAuthoritativeBinding(liveEntry);
      applyOne(this);
    };
    entry.hookInstalled = true;
  }

  return true;
}

function applyOne(mesh) {
  const entry = selectedByMesh.get(mesh);
  if (!entry || !assignAuthoritativeBinding(entry)) return;

  const snaps = originals.get(mesh) || [];
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

function applyMaterial2() {
  for (const { mesh } of selected) applyOne(mesh);
}

function updateStatus() {
  const el = document.getElementById('material2Status');
  if (!el) return;
  el.textContent =
    `${resolvedTargets.size}/${MATERIAL_2_TARGET_PATHS.size} path targets · ` +
    `${resolvedMaterialTargets.size}/${MATERIAL_2_TARGET_MATERIALS.size} split materials · ` +
    `${selected.length} render meshes`;
}

function bindRange(id, key, digits = 2) {
  const input = document.getElementById(id);
  const readout = document.getElementById(`${id}V`);
  if (!input) return;
  input.value = String(style[key]);
  const paint = () => {
    if (readout) readout.textContent = Math.abs(Number(input.value)) < 10
      ? Number(input.value).toFixed(digits)
      : Number(input.value).toFixed(0);
  };
  input.addEventListener('input', () => {
    style[key] = Number(input.value);
    paint();
    applyMaterial2();
  });
  paint();
}

function bindColor(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = style[key];
  input.addEventListener('input', () => {
    style[key] = input.value;
    applyMaterial2();
  });
}

function bindUI() {
  if (uiBound || !document.getElementById('material2Ctls')) return;
  uiBound = true;

  bindColor('material2Face', 'face');
  bindRange('material2Tint', 'faceTint');
  bindRange('material2Lift', 'faceLift');
  bindRange('material2Opacity', 'faceOpacity');
  bindRange('material2Roughness', 'faceRoughness');
  bindRange('material2Metalness', 'faceMetalness');

  document.getElementById('copyMaterial2StyleBtn')?.addEventListener('click', async () => {
    const out = `const MATERIAL_2_STYLE = ${JSON.stringify(style, null, 2)};`;
    try { await navigator.clipboard.writeText(out); }
    catch { console.info(out); }
  });

  updateStatus();
  applyMaterial2();
}

let waitFrames = 0;
function waitForUI() {
  if (document.getElementById('material2Ctls')) return bindUI();
  if (waitFrames++ < 240) requestAnimationFrame(waitForUI);
}
requestAnimationFrame(waitForUI);

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamMaterial2Render(scene, camera) {
  applyMaterial2();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_OBJECT_MATERIAL_2_STYLE = style;
window.__ADAM_OBJECT_MATERIAL_2_PATHS = MATERIAL_2_TARGET_PATHS;
window.__ADAM_OBJECT_MATERIAL_2_MATERIALS = MATERIAL_2_TARGET_MATERIALS;
window.__ADAM_OBJECT_MATERIAL_2_GUARDED_PATHS = SHARED_MATERIAL_GUARD_PATHS;
window.__ADAM_OBJECT_MATERIAL_2_MESHES = () => selected.map(entry => entry.mesh);
window.__ADAM_OBJECT_MATERIAL_2_ENTRIES = () => selected;
window.__ADAM_OBJECT_MATERIAL_2_RESOLVED = () => [...resolvedTargets];
window.__ADAM_OBJECT_MATERIAL_2_RESOLVED_MATERIALS = () => [...resolvedMaterialTargets];
