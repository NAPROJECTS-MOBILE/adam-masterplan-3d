import * as THREE from 'three';

/*
  ADAM Object Material 2
  ----------------------
  Exact runtime mesh-path targeting with an authoritative per-mesh material
  binding.

  IMPORTANT: target discovery deliberately does NOT hook GLTFLoader anymore.
  Several calibrator modules wrap GLTFLoader.loadAsync, so a one-shot loader
  hook can be consumed/restored by the wrong load. Instead we sweep the actual
  scene passed to WebGLRenderer.render on its first frame, after app-v2 has
  loaded the model and cloned its source materials. This guarantees Material 2
  captures the meshes/materials that are really about to render.

  Rectangle_4 and Rectangle_5 are ordinary exported THREE.Mesh targets. They
  share their source glTF material with many other meshes, so once selected we
  store an independent Material 2 clone and re-bind that exact clone if any
  later code replaces mesh.material.
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

const FOCUS_TARGET_PATHS = new Set([
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
let capturedScene = null;
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

function addSelectedMesh(mesh, targetPath) {
  if (!mesh?.isMesh || !mesh.material || selectedByMesh.has(mesh)) return false;

  const entry = {
    mesh,
    targetPath,
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
  mesh.userData.adamObjectMaterialPath = targetPath;
  return true;
}

function captureRuntimeScene(scene) {
  selected.length = 0;
  selectedByMesh.clear();
  originals.clear();
  resolvedTargets.clear();

  scene?.traverse?.(mesh => {
    if (!mesh?.isMesh) return;
    const path = pathOf(mesh);
    if (!MATERIAL_2_TARGET_PATHS.has(path)) return;
    if (addSelectedMesh(mesh, path)) resolvedTargets.add(path);
  });

  capturedScene = scene;

  const missing = [...MATERIAL_2_TARGET_PATHS].filter(path => !resolvedTargets.has(path));
  const focus = [...FOCUS_TARGET_PATHS].map(path => ({
    path,
    resolved:resolvedTargets.has(path),
    mesh:selected.find(entry => entry.targetPath === path)?.mesh || null
  }));

  console.info(
    `[ADAM material 2] first-render scene sweep resolved ` +
    `${resolvedTargets.size}/${MATERIAL_2_TARGET_PATHS.size} target object(s) ` +
    `to ${selected.length} render mesh(es).`
  );
  console.info('[ADAM material 2] Rectangle_4 / Rectangle_5 runtime resolution:', focus);
  if (missing.length) console.warn('[ADAM material 2] unresolved target paths:', missing);
  updateStatus();
}

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

    if (FOCUS_TARGET_PATHS.has(entry.targetPath)) {
      console.info('[ADAM material 2] isolated focus target material', {
        path:entry.targetPath,
        mesh:mesh.name,
        source:current.map(mat => ({ uuid:mat.uuid, name:mat.name, type:mat.type })),
        material2:entry.material2.map(mat => ({ uuid:mat.uuid, name:mat.name, type:mat.type }))
      });
    }
  }

  if (!bindingMatches(entry)) {
    mesh.material = entry.materialWasArray ? entry.material2 : entry.material2[0];
    entry.rebinds++;

    if (FOCUS_TARGET_PATHS.has(entry.targetPath) && entry.rebinds <= 3) {
      console.warn(
        `[ADAM material 2] rebound ${entry.targetPath} to its authoritative clone ` +
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

  if (!capturedScene) {
    el.textContent = 'waiting for first rendered scene…';
    return;
  }

  const focusResolved = selected.filter(entry => FOCUS_TARGET_PATHS.has(entry.targetPath)).length;
  el.textContent =
    `${resolvedTargets.size}/${MATERIAL_2_TARGET_PATHS.size} target objects · ` +
    `${selected.length} render meshes · Rectangle_4/5 ${focusResolved}/${FOCUS_TARGET_PATHS.size}`;
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

// This wrapper is installed before app-v2 creates its renderer. On the first
// actual frame, the scene is fully populated and app-v2's setup/material clones
// are complete. Capture from that live scene exactly once, then style it.
const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamMaterial2Render(scene, camera) {
  if (capturedScene !== scene) captureRuntimeScene(scene);
  applyMaterial2();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_OBJECT_MATERIAL_2_STYLE = style;
window.__ADAM_OBJECT_MATERIAL_2_PATHS = MATERIAL_2_TARGET_PATHS;
window.__ADAM_OBJECT_MATERIAL_2_FOCUS_PATHS = FOCUS_TARGET_PATHS;
window.__ADAM_OBJECT_MATERIAL_2_CAPTURE_MODE = 'first-render-scene-sweep';
window.__ADAM_OBJECT_MATERIAL_2_MESHES = () => selected.map(entry => entry.mesh);
window.__ADAM_OBJECT_MATERIAL_2_ENTRIES = () => selected;
window.__ADAM_OBJECT_MATERIAL_2_RESOLVED = () => [...resolvedTargets];
window.__ADAM_OBJECT_MATERIAL_2_RECAPTURE = () => { capturedScene = null; };
