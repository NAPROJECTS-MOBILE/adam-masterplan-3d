import * as THREE from 'three';

// ADAM shadow grounding proxies
// ----------------------------
// Some small static blocks sit visibly above the slab / receiver and therefore
// cast shadows that appear slightly detached or cut into their own lower edge.
// Rather than moving the global receiver again, add invisible shadow-only
// support volumes beneath ONLY the small, static elevated blocks.
//
// The proxies do not render colour; they only cast into the existing shadow map.
// Animated movers are auto-excluded by watching a short warm-up period and only
// grounding candidates that remain effectively static.

const GAP_MIN = 0.06;
const GAP_MAX = 1.75;
const MAX_FOOTPRINT_SIDE = 10.0;
const MAX_FOOTPRINT_AREA = 65.0;
const MAX_HEIGHT = 14.0;
const FOOTPRINT_SHRINK = 0.92;
const MOTION_EPSILON = 0.01;
const OBSERVE_FRAMES = 24;
const VERTICAL_OVERLAP = 0.02;

let started = false;
let completed = false;
let frameCount = 0;
let receiverTopY = null;
let slabMesh = null;
let candidates = new Map();
let proxies = [];

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function findSlab(scene) {
  const mainGroup = scene?.getObjectByName?.('Main_Group');
  if (!mainGroup) return null;
  let best = null;
  let bestArea = -Infinity;
  for (const object of mainGroup.children) {
    if (!object?.isMesh || !/^Rectangle(?:_\d+)?$/.test(object.name)) continue;
    object.geometry?.computeBoundingBox?.();
    const box = object.geometry?.boundingBox;
    if (!box) continue;
    const size = box.getSize(new THREE.Vector3());
    const planar = size.z < 1e-5 && size.x > 1000 && size.y > 1000;
    if (!planar) continue;
    const area = size.x * size.y;
    if (area > bestArea) { best = object; bestArea = area; }
  }
  return best;
}

function isArchitectureMesh(object) {
  if (!object?.isMesh || object.isLineSegments2) return false;
  if (object === slabMesh) return false;
  if (object.userData?.adamGlowHull || object.userData?.adamShadowReceiver || object.userData?.adamShadowGroundProxy) return false;
  if (!object.geometry?.attributes?.position) return false;
  return pathOf(object).includes('Scene_1/Main_Group/clusters/');
}

function computeReceiverTopY() {
  const receiver = window.__ADAM_SHADOW_CALIBRATOR?.receiver;
  if (!receiver) return null;
  const box = new THREE.Box3().setFromObject(receiver);
  return Number.isFinite(box.max.y) ? box.max.y : null;
}

function collectCandidates(scene) {
  if (!Number.isFinite(receiverTopY)) return;
  const tmpBox = new THREE.Box3();
  scene.traverse(object => {
    if (!isArchitectureMesh(object)) return;
    tmpBox.setFromObject(object);
    if (tmpBox.isEmpty()) return;

    const size = tmpBox.getSize(new THREE.Vector3());
    const centre = tmpBox.getCenter(new THREE.Vector3());
    const gap = tmpBox.min.y - receiverTopY;
    const footprintArea = size.x * size.z;

    if (gap < GAP_MIN || gap > GAP_MAX) return;
    if (size.x > MAX_FOOTPRINT_SIDE || size.z > MAX_FOOTPRINT_SIDE) return;
    if (footprintArea > MAX_FOOTPRINT_AREA) return;
    if (size.y > MAX_HEIGHT) return;

    const path = pathOf(object);
    candidates.set(object.uuid, {
      object,
      path,
      lastCentre: centre.clone(),
      maxMotion: 0,
      bbox: tmpBox.clone(),
      size,
      gap,
      footprintArea
    });
  });
}

function observeMotion() {
  for (const entry of candidates.values()) {
    const box = new THREE.Box3().setFromObject(entry.object);
    if (box.isEmpty()) {
      entry.maxMotion = Infinity;
      continue;
    }
    const centre = box.getCenter(new THREE.Vector3());
    entry.maxMotion = Math.max(entry.maxMotion, centre.distanceTo(entry.lastCentre));
    entry.lastCentre.copy(centre);
    entry.bbox.copy(box);
    entry.size = box.getSize(new THREE.Vector3());
    entry.gap = box.min.y - receiverTopY;
  }
}

function makeProxy(entry, scene) {
  const box = entry.bbox;
  const size = entry.size;
  const gap = entry.gap;
  const width = Math.max(0.05, size.x * FOOTPRINT_SHRINK);
  const depth = Math.max(0.05, size.z * FOOTPRINT_SHRINK);
  const height = Math.max(0.02, gap + VERTICAL_OVERLAP);

  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    colorWrite: false,
    depthWrite: false,
    transparent: true,
    opacity: 0,
    toneMapped: false
  });

  const proxy = new THREE.Mesh(geo, mat);
  proxy.name = `ADAM_Shadow_GroundProxy_${entry.object.name || entry.object.uuid.slice(0,6)}`;
  proxy.userData.adamShadowGroundProxy = true;
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.frustumCulled = false;
  proxy.position.set(
    (box.min.x + box.max.x) * 0.5,
    receiverTopY + height * 0.5,
    (box.min.z + box.max.z) * 0.5
  );

  scene.add(proxy);
  proxies.push({ proxy, entry });
}

function finalize(scene) {
  if (completed) return;
  completed = true;

  const grounded = [];
  for (const entry of candidates.values()) {
    const isStatic = entry.maxMotion <= MOTION_EPSILON;
    const gapOK = entry.gap >= GAP_MIN && entry.gap <= GAP_MAX;
    if (!isStatic || !gapOK) continue;
    makeProxy(entry, scene);
    grounded.push({
      path: entry.path,
      gap: Number(entry.gap.toFixed(3)),
      motion: Number(entry.maxMotion.toFixed(4))
    });
  }

  console.info('[ADAM shadow grounding]', {
    receiverTopY,
    observedCandidates: candidates.size,
    grounded: grounded.length,
    groundedDetails: grounded.slice(0, 20)
  });
}

function beforeRender(renderer, scene) {
  if (completed) return;

  if (!started) {
    slabMesh = findSlab(scene);
    receiverTopY = computeReceiverTopY();
    if (!Number.isFinite(receiverTopY)) return;
    collectCandidates(scene);
    started = true;
  }

  frameCount++;
  observeMotion();

  if (frameCount >= OBSERVE_FRAMES) finalize(scene);
}

window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_SHADOW_GROUNDING = {
  version: 1,
  get receiverTopY(){ return receiverTopY; },
  get observedFrames(){ return frameCount; },
  get candidateCount(){ return candidates.size; },
  get proxyCount(){ return proxies.length; },
  get proxies(){ return proxies; }
};
