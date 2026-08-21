import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  ADAM Object Material 2
  ----------------------
  Selected building meshes keep all normal scene behaviour, but their face
  material is controlled independently from the main Building material panel.

  Material 2 is applied twice for reliability:
    1) whenever its controls change;
    2) in each selected mesh's onBeforeRender callback, immediately before that
       mesh is drawn. That makes Material 2 authoritative even if app-v2's
       global Building material styling runs earlier in the same frame.
*/

const MATERIAL_2_PATHS = new Set([
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

const style = {
  face:'#ebebeb',
  faceTint:0.70,
  faceLift:0.15,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0.0
};

const selected = [];
const originals = new Map();
const previousBeforeRender = new Map();
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

function capture(root) {
  selected.length = 0;
  originals.clear();
  previousBeforeRender.clear();
  prepared = false;
  const resolved = new Set();

  root?.traverse?.(mesh => {
    if (!mesh?.isMesh) return;
    const path = pathOf(mesh);
    if (!MATERIAL_2_PATHS.has(path)) return;

    const snapshots = materialArray(mesh).map(mat => ({
      color:mat?.color?.clone?.() || new THREE.Color(0xffffff),
      roughness:mat?.roughness ?? 1,
      metalness:mat?.metalness ?? 0
    }));

    mesh.userData.adamObjectMaterial = 2;
    mesh.userData.adamObjectMaterialPath = path;
    selected.push({ mesh, path });
    originals.set(mesh, snapshots);
    resolved.add(path);
  });

  const missing = [...MATERIAL_2_PATHS].filter(path => !resolved.has(path));
  console.info(`[ADAM material 2] resolved ${resolved.size}/${MATERIAL_2_PATHS.size} selected mesh(es).`);
  if (missing.length) console.warn('[ADAM material 2] unresolved paths:', missing);
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

function applyOne(mesh) {
  const snaps = originals.get(mesh) || [];
  const mats = materialArray(mesh);
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

function ensureIndependentMaterials() {
  if (prepared || !selected.length) return;
  for (const { mesh } of selected) {
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(mat => {
        const clone = mat.clone();
        clone.name = 'Object Material 2';
        clone.userData = { ...(clone.userData || {}), adamObjectMaterial:2 };
        return clone;
      });
    } else if (mesh.material) {
      const clone = mesh.material.clone();
      clone.name = 'Object Material 2';
      clone.userData = { ...(clone.userData || {}), adamObjectMaterial:2 };
      mesh.material = clone;
    }

    const prior = mesh.onBeforeRender;
    previousBeforeRender.set(mesh, prior);
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
  if (el) el.textContent = `${selected.length}/${MATERIAL_2_PATHS.size} objects assigned to Material 2`;
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

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamMaterial2Render(scene, camera) {
  applyMaterial2();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_OBJECT_MATERIAL_2_STYLE = style;
window.__ADAM_OBJECT_MATERIAL_2_PATHS = MATERIAL_2_PATHS;
window.__ADAM_OBJECT_MATERIAL_2_MESHES = () => selected;
