import * as THREE from 'three';

const DEFAULTS = {
  enabled:true,
  azimuth:42,
  elevation:58,
  darkness:0.35,
  softness:3.0,
  bias:-0.00035,
  normalBias:0.02,
  receiverOffset:0.025,
  mapSize:2048
};

const SHADOW_LIGHT_INTENSITY = 0.001;
const state = { ...DEFAULTS };
let installed = false;
let shadowLight = null;
let receiver = null;
let receiverMaterial = null;
let architecture = [];
let sceneBounds = null;
let contentCentre = new THREE.Vector3();
let contentRadius = 10;
let slabMesh = null;
let statusEl = null;
let uiBound = false;

const $ = id => document.getElementById(id);

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
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
  if (object.userData?.adamGlowHull || object.userData?.adamShadowReceiver) return false;
  if (!object.geometry?.attributes?.position) return false;
  return pathOf(object).includes('Scene_1/Main_Group/clusters/');
}

function collectArchitecture(scene) {
  architecture = [];
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  scene.traverse(object => {
    if (!isArchitectureMesh(object)) return;
    architecture.push(object);
    object.castShadow = true;
    object.receiveShadow = false;
    tmp.setFromObject(object);
    if (!tmp.isEmpty()) box.union(tmp);
  });
  sceneBounds = box;
  if (!box.isEmpty()) {
    contentCentre = box.getCenter(new THREE.Vector3());
    contentRadius = Math.max(1, box.getBoundingSphere(new THREE.Sphere()).radius);
  }
}

function makeReceiver(scene) {
  receiverMaterial = new THREE.ShadowMaterial({
    color:0x000000, transparent:true, opacity:state.darkness,
    depthWrite:false, depthTest:true, toneMapped:false, side:THREE.DoubleSide
  });

  if (slabMesh?.geometry) {
    slabMesh.updateWorldMatrix(true, false);
    receiver = new THREE.Mesh(slabMesh.geometry, receiverMaterial);
    receiver.matrixAutoUpdate = false;
    receiver.userData.adamShadowReceiverUsesSlab = true;
  } else {
    const size = sceneBounds?.getSize(new THREE.Vector3()) || new THREE.Vector3(20,1,20);
    receiver = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(size.x*1.35, contentRadius*2.4), Math.max(size.z*1.35, contentRadius*2.4)),
      receiverMaterial
    );
    receiver.rotation.x = -Math.PI/2;
    receiver.position.set(contentCentre.x, (sceneBounds?.min.y || 0)+state.receiverOffset, contentCentre.z);
  }

  receiver.name = 'ADAM_Shadow_Receiver';
  receiver.userData.adamShadowReceiver = true;
  receiver.receiveShadow = true;
  receiver.castShadow = false;
  receiver.frustumCulled = false;
  receiver.renderOrder = 10;
  scene.add(receiver);
  syncReceiverToSlab();
}

function syncReceiverToSlab() {
  if (!receiver || !slabMesh || !receiver.userData.adamShadowReceiverUsesSlab) return;
  slabMesh.updateWorldMatrix(true, false);
  receiver.matrix.copy(slabMesh.matrixWorld);
  receiver.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, state.receiverOffset, 0));
  receiver.matrixWorldNeedsUpdate = true;
}

function makeShadowLight(scene) {
  shadowLight = new THREE.DirectionalLight(0xffffff, SHADOW_LIGHT_INTENSITY);
  shadowLight.castShadow = true;
  shadowLight.target.name = 'ADAM_Shadow_Target';
  shadowLight.shadow.mapSize.set(state.mapSize, state.mapSize);
  const span = contentRadius * 1.35;
  Object.assign(shadowLight.shadow.camera, {
    left:-span, right:span, top:span, bottom:-span,
    near:0.1, far:contentRadius*10
  });
  shadowLight.shadow.camera.updateProjectionMatrix();
  scene.add(shadowLight, shadowLight.target);
  updateDirection();
}

function updateDirection() {
  if (!shadowLight) return;
  const az = THREE.MathUtils.degToRad(state.azimuth);
  const el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(state.elevation,3,88));
  const horizontal = Math.cos(el);
  const distance = contentRadius * 3.2;
  shadowLight.target.position.copy(contentCentre);
  shadowLight.position.set(
    contentCentre.x + Math.sin(az)*horizontal*distance,
    contentCentre.y + Math.sin(el)*distance,
    contentCentre.z + Math.cos(az)*horizontal*distance
  );
  shadowLight.target.updateMatrixWorld();
}

function updateReadouts() {
  const values = {
    shadowAzimuthV:`${state.azimuth.toFixed(0)}°`,
    shadowElevationV:`${state.elevation.toFixed(0)}°`,
    shadowDarknessV:state.darkness.toFixed(2),
    shadowSoftnessV:state.softness.toFixed(2),
    shadowBiasV:state.bias.toFixed(5),
    shadowNormalBiasV:state.normalBias.toFixed(4)
  };
  for (const [id,text] of Object.entries(values)) if ($(id)) $(id).textContent = text;
}

function updateStatus() {
  statusEl = statusEl || $('shadowStatus');
  if (!statusEl) return;
  statusEl.textContent = state.enabled
    ? `shadow module active · ${architecture.length} casters · receiver ${slabMesh ? 'base slab' : 'fallback'} · map ${state.mapSize}px`
    : 'shadow calibration disabled';
}

function applyState(renderer) {
  if (!renderer) return;
  renderer.shadowMap.enabled = !!state.enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  syncReceiverToSlab();
  if (receiver) receiver.visible = !!state.enabled;
  if (receiverMaterial) receiverMaterial.opacity = state.darkness;
  if (shadowLight) {
    shadowLight.visible = !!state.enabled;
    shadowLight.castShadow = !!state.enabled;
    shadowLight.intensity = SHADOW_LIGHT_INTENSITY;
    shadowLight.shadow.radius = state.softness;
    shadowLight.shadow.bias = state.bias;
    shadowLight.shadow.normalBias = state.normalBias;
    updateDirection();
  }
  updateReadouts();
  updateStatus();
}

function bindUI() {
  if (uiBound) return;
  const required = ['shadowAzimuth','shadowElevation','shadowDarkness','shadowSoftness','shadowBias','shadowNormalBias','tShadowCalibration','resetShadowBtn'];
  if (!required.every(id => $(id))) return;
  uiBound = true;

  const bind = (id,key) => {
    const input = $(id);
    input.value = state[key];
    input.addEventListener('input', () => {
      state[key] = Number(input.value);
      applyState(window.__ADAM_SHADOW_RENDERER);
    });
  };
  bind('shadowAzimuth','azimuth');
  bind('shadowElevation','elevation');
  bind('shadowDarkness','darkness');
  bind('shadowSoftness','softness');
  bind('shadowBias','bias');
  bind('shadowNormalBias','normalBias');

  const toggle = $('tShadowCalibration');
  toggle.onclick = () => {
    state.enabled = !state.enabled;
    toggle.classList.toggle('on', state.enabled);
    applyState(window.__ADAM_SHADOW_RENDERER);
  };

  $('resetShadowBtn').onclick = () => {
    Object.assign(state, DEFAULTS);
    for (const [id,key] of [['shadowAzimuth','azimuth'],['shadowElevation','elevation'],['shadowDarkness','darkness'],['shadowSoftness','softness'],['shadowBias','bias'],['shadowNormalBias','normalBias']]) $(id).value = state[key];
    toggle.classList.toggle('on', state.enabled);
    applyState(window.__ADAM_SHADOW_RENDERER);
  };

  statusEl = $('shadowStatus');
  updateReadouts();
  updateStatus();
}

function install(renderer, scene) {
  if (installed) return;
  installed = true;
  window.__ADAM_SHADOW_RENDERER = renderer;
  bindUI();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.updateMatrixWorld(true);
  slabMesh = findSlab(scene);
  collectArchitecture(scene);
  makeReceiver(scene);
  makeShadowLight(scene);
  applyState(renderer);
  console.info('[ADAM shadows V3]', { casters:architecture.length, slab:slabMesh?.name || null });
}

requestAnimationFrame(bindUI);

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamShadowCalibrationV3Render(scene, camera) {
  install(this, scene);
  applyState(this);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_SHADOW_CALIBRATOR = {
  version:3,
  state,
  defaults:DEFAULTS,
  get light(){ return shadowLight; },
  get receiver(){ return receiver; },
  get slab(){ return slabMesh; },
  get casters(){ return architecture; }
};
