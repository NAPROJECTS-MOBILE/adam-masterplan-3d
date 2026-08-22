import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  ADAM Object Material 2
  ----------------------
  Most Material 2 targets export from Spline as ordinary GLB mesh nodes and can
  be matched directly by their full path.

  Rectangle_4 and Rectangle_5 are different: in the source Spline scene they
  are 3D Path objects. A Spline 3D Path is a generated mesh container, and its
  rendered GLB primitive(s) may sit below the named path node rather than being
  the named node itself. Matching only `object.isMesh && path === targetPath`
  therefore misses them.

  For those two exact Spline 3D Path targets we match the named node first, then
  assign Material 2 to every descendant render mesh. We also give those render
  meshes a clean MeshStandardMaterial so Spline's exported Color Layer / vertex
  colour contribution cannot multiply over the independent Material 2 colour.

  No building/flat/path classification is changed here. Material 2 is applied
  directly to the selected render meshes and reasserted in onBeforeRender.
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

const SPLINE_3D_PATH_TARGETS = new Set([
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
let prepared = false;
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

function addSelectedMesh(mesh, targetPath, spline3DPath = false) {
  if (!mesh?.isMesh || !mesh.material || selectedByMesh.has(mesh)) return false;

  const entry = {
    mesh,
    targetPath,
    meshPath:pathOf(mesh),
    spline3DPath
  };
  selected.push(entry);
  selectedByMesh.set(mesh, entry);
  originals.set(mesh, snapshotMaterials(mesh));
  mesh.userData.adamObjectMaterial = 2;
  mesh.userData.adamObjectMaterialPath = targetPath;
  mesh.userData.adamSpline3DPathMaterial2 = spline3DPath;
  return true;
}

function addSpline3DPathNode(node, targetPath) {
  let meshParts = 0;
  node.traverse?.(child => {
    if (addSelectedMesh(child, targetPath, true)) meshParts++;
  });
  if (meshParts) resolvedTargets.add(targetPath);
  console.info(`[ADAM material 2] Spline 3D Path ${targetPath} -> ${meshParts} render mesh part(s).`);
}

function capture(root) {
  selected.length = 0;
  selectedByMesh.clear();
  originals.clear();
  resolvedTargets.clear();
  prepared = false;

  // First resolve the two named Spline 3D Path containers. They may not be
  // meshes themselves, so matching must happen on all Object3D nodes.
  root?.traverse?.(object => {
    const path = pathOf(object);
    if (!SPLINE_3D_PATH_TARGETS.has(path)) return;
    addSpline3DPathNode(object, path);
  });

  // Normal Material 2 targets are ordinary GLB mesh nodes and remain exact-path
  // matches. Skip the two 3D Path target names because they were handled above.
  root?.traverse?.(mesh => {
    if (!mesh?.isMesh) return;
    const path = pathOf(mesh);
    if (SPLINE_3D_PATH_TARGETS.has(path)) return;
    if (!MATERIAL_2_TARGET_PATHS.has(path)) return;
    if (addSelectedMesh(mesh, path, false)) resolvedTargets.add(path);
  });

  const missing = [...MATERIAL_2_TARGET_PATHS].filter(path => !resolvedTargets.has(path));
  console.info(
    `[ADAM material 2] resolved ${resolvedTargets.size}/${MATERIAL_2_TARGET_PATHS.size} target object(s) ` +
    `to ${selected.length} render mesh part(s).`
  );
  if (missing.length) console.warn('[ADAM material 2] unresolved target paths:', missing);
  updateStatus();
}

// Capture exact source hierarchy before app-v2 does any motion/reparenting.
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

function clean3DPathMaterial(mesh, source, snapshot) {
  const mat = new THREE.MeshStandardMaterial({
    color:snapshot?.color || source?.color || 0xffffff,
    roughness:snapshot?.roughness ?? source?.roughness ?? 1,
    metalness:snapshot?.metalness ?? source?.metalness ?? 0,
    transparent:true,
    opacity:snapshot?.opacity ?? source?.opacity ?? 1,
    side:snapshot?.side ?? source?.side ?? THREE.FrontSide,
    alphaTest:snapshot?.alphaTest ?? source?.alphaTest ?? 0,
    depthTest:true,
    depthWrite:true,
    flatShading:!mesh.geometry?.attributes?.normal
  });

  // A GLB Color Layer can arrive as base-colour texture and/or vertex colour
  // modulation. Material 2 must be authoritative, so neither is carried over.
  mat.map = null;
  mat.vertexColors = false;
  mat.name = 'Object Material 2 — Spline 3D Path';
  mat.userData = { adamObjectMaterial:2, adamSpline3DPath:true };
  return mat;
}

function cloneMaterial2(mesh, source, snapshot, spline3DPath) {
  if (spline3DPath) return clean3DPathMaterial(mesh, source, snapshot);
  const clone = source.clone();
  clone.name = 'Object Material 2';
  clone.userData = { ...(clone.userData || {}), adamObjectMaterial:2 };
  return clone;
}

function applyOne(mesh) {
  const entry = selectedByMesh.get(mesh);
  if (!entry) return;

  const snaps = originals.get(mesh) || [];
  const mats = materialArray(mesh);
  const tint = tmpColor.set(style.face);
  const lift = Math.max(0, style.faceLift);

  mats.forEach((mat, index) => {
    const original = snaps[index] || snaps[0];
    if (!mat || !original) return;

    if (entry.spline3DPath) {
      // Keep Material 2 unmultiplied by exported path Color Layer data.
      if ('vertexColors' in mat && mat.vertexColors) {
        mat.vertexColors = false;
        mat.needsUpdate = true;
      }
      if ('map' in mat && mat.map) {
        mat.map = null;
        mat.needsUpdate = true;
      }
    }

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

function ensureIndependentMaterials() {
  if (prepared || !selected.length) return;

  for (const entry of selected) {
    const { mesh, spline3DPath } = entry;
    const snaps = originals.get(mesh) || [];
    const current = materialArray(mesh);
    if (!current.length) continue;

    const replacements = current.map((source, index) =>
      cloneMaterial2(mesh, source, snaps[index] || snaps[0], spline3DPath)
    );
    mesh.material = Array.isArray(mesh.material) ? replacements : replacements[0];

    const prior = mesh.onBeforeRender;
    mesh.onBeforeRender = function adamMaterial2BeforeRender(...args) {
      if (typeof prior === 'function') prior.apply(this, args);
      applyOne(this);
    };
  }

  prepared = true;
}

function applyMaterial2() {
  if (!selected.length) return;
  ensureIndependentMaterials();
  for (const { mesh } of selected) applyOne(mesh);
}

function updateStatus() {
  const el = document.getElementById('material2Status');
  if (!el) return;
  const pathMeshParts = selected.filter(entry => entry.spline3DPath).length;
  el.textContent =
    `${resolvedTargets.size}/${MATERIAL_2_TARGET_PATHS.size} target objects · ` +
    `${selected.length} render meshes · 3D Path parts ${pathMeshParts}`;
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
  if (uiBound) return;
  if (!document.getElementById('material2Ctls')) return;
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

// Safety net: reassert Material 2 before each frame. The per-mesh
// onBeforeRender callback remains the last write immediately before draw.
const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamMaterial2Render(scene, camera) {
  applyMaterial2();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_OBJECT_MATERIAL_2_STYLE = style;
window.__ADAM_OBJECT_MATERIAL_2_PATHS = MATERIAL_2_TARGET_PATHS;
window.__ADAM_OBJECT_MATERIAL_2_SPLINE_3D_PATHS = SPLINE_3D_PATH_TARGETS;
window.__ADAM_OBJECT_MATERIAL_2_MESHES = () => selected;
window.__ADAM_OBJECT_MATERIAL_2_RESOLVED = () => [...resolvedTargets];
