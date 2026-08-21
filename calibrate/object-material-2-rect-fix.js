import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  Targeted Material 2 fix for the two cluster_4 rectangle candidates that do
  not respond to normal material tinting. Only these two exact GLB meshes are
  affected. Their source material is replaced with a plain MeshStandardMaterial
  so the Material 2 controls have an actual colour/roughness/metalness surface
  to drive, then the style is re-applied in onBeforeRender so no global face
  pass can overwrite it.
*/

const TARGETS = new Set([
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_4',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5'
]);

const captured = [];
const originals = new Map();
let installed = false;
const tmp = new THREE.Color();

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function mats(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : (mesh.material ? [mesh.material] : []);
}

function capture(root) {
  captured.length = 0;
  originals.clear();
  const resolved = new Set();

  root?.traverse?.(mesh => {
    if (!mesh?.isMesh) return;
    const path = pathOf(mesh);
    if (!TARGETS.has(path)) return;

    originals.set(mesh, mats(mesh).map(mat => ({
      color:mat?.color?.clone?.() || new THREE.Color(0xffffff),
      roughness:mat?.roughness ?? 1,
      metalness:mat?.metalness ?? 0,
      side:mat?.side ?? THREE.FrontSide,
      alphaTest:mat?.alphaTest ?? 0
    })));

    captured.push({ mesh, path });
    resolved.add(path);
  });

  console.info(`[ADAM material 2 rect fix] resolved ${resolved.size}/${TARGETS.size}.`);
}

const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamMaterial2RectCapture(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    setTimeout(waitAndInstall, 0);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function style() {
  return window.__ADAM_OBJECT_MATERIAL_2_STYLE || {
    face:'#ebebeb', faceTint:0.70, faceLift:0.15,
    faceOpacity:0.94, faceRoughness:0.97, faceMetalness:0
  };
}

function applyOne(mesh) {
  const s = style();
  const snaps = originals.get(mesh) || [];
  const list = mats(mesh);
  const tint = tmp.set(s.face);

  list.forEach((mat, index) => {
    const original = snaps[index] || snaps[0];
    if (!mat || !original) return;
    mat.color.copy(original.color).lerp(tint, s.faceTint);
    mat.emissive.copy(mat.color);
    mat.emissiveIntensity = Math.max(0, s.faceLift ?? 0);
    mat.roughness = s.faceRoughness;
    mat.metalness = s.faceMetalness;
    mat.transparent = true;
    mat.opacity = s.faceOpacity;
    mat.depthTest = true;
    mat.depthWrite = true;
    mat.needsUpdate = true;
  });
}

function forceStandardMaterial(mesh) {
  const source = mats(mesh);
  const snaps = originals.get(mesh) || [];
  if (!source.length) return;

  const replacements = source.map((mat, index) => {
    const original = snaps[index] || snaps[0];
    const next = new THREE.MeshStandardMaterial({
      color:original?.color || 0xffffff,
      roughness:original?.roughness ?? 1,
      metalness:original?.metalness ?? 0,
      transparent:true,
      opacity:mat?.opacity ?? 1,
      side:original?.side ?? THREE.FrontSide,
      alphaTest:original?.alphaTest ?? 0,
      depthTest:true,
      depthWrite:true
    });
    next.name = 'Object Material 2 — forced rectangle';
    next.userData.adamObjectMaterial = 2;
    next.userData.adamForcedMaterial2Rectangle = true;
    return next;
  });

  mesh.material = Array.isArray(mesh.material) ? replacements : replacements[0];
  mesh.userData.adamObjectMaterial = 2;
  mesh.userData.adamForcedMaterial2Rectangle = true;

  const prior = mesh.onBeforeRender;
  mesh.onBeforeRender = function adamForcedMaterial2RectangleBeforeRender(...args) {
    if (typeof prior === 'function') prior.apply(this, args);
    applyOne(this);
  };

  applyOne(mesh);
}

function install() {
  if (installed || captured.length !== TARGETS.size) return false;
  for (const { mesh } of captured) forceStandardMaterial(mesh);
  installed = true;
  console.info('[ADAM material 2 rect fix] forced standard Material 2 on Rectangle_4 + Rectangle_5.');
  return true;
}

let frames = 0;
function waitAndInstall() {
  if (window.__ADAM_OBJECT_MATERIAL_2_STYLE && install()) return;
  if (frames++ < 240) requestAnimationFrame(waitAndInstall);
  else console.warn('[ADAM material 2 rect fix] could not install forced materials.');
}

window.__ADAM_MATERIAL_2_RECT_FIX_TARGETS = TARGETS;
