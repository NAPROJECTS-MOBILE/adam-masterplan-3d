import * as THREE from 'three';

/*
  ADAM shadow calibrator V2
  -------------------------
  V1 used a generic receiver plane derived from architecture bounds. That can be
  at a completely different Y from the separately transformed site base, making
  valid shadows invisible behind / away from the visible slab.

  V2 clones the ACTUAL base-slab geometry and world transform, lifts the shadow
  receiver slightly above it, and uses a tiny non-zero white-light intensity to
  keep Three's complete directional-shadow pipeline active without materially
  changing the approved scene lighting.
*/

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
let panelBuilt = false;
let statusEl = null;

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
    if (area > bestArea) {
      best = object;
      bestArea = area;
    }
  }
  return best;
}

function isArchitectureMesh(object) {
  if (!object?.isMesh || object.isLineSegments2) return false;
  if (object === slabMesh) return false;
  if (object.userData?.adamGlowHull) return false;
  if (object.userData?.adamShadowReceiver) return false;
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
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    contentRadius = Math.max(1, sphere.radius);
  }
}

function makeReceiver(scene) {
  receiverMaterial = new THREE.ShadowMaterial({
    color:0x000000,
    transparent:true,
    opacity:state.darkness,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    side:THREE.DoubleSide
  });

  const lift = new THREE.Matrix4().makeTranslation(0, state.receiverOffset, 0);

  if (slabMesh?.geometry) {
    // Match the real visible base exactly, including app-v2 rotation, position,
    // and the live Base plate size control's scale.
    slabMesh.updateWorldMatrix(true, false);
    receiver = new THREE.Mesh(slabMesh.geometry, receiverMaterial);
    receiver.matrixAutoUpdate = false;
    receiver.matrix.copy(slabMesh.matrixWorld);
    receiver.matrix.premultiply(lift);
    receiver.userData.adamShadowReceiverUsesSlab = true;
  } else {
    // Fallback only if the base cannot be resolved.
    const size = sceneBounds?.getSize(new THREE.Vector3()) || new THREE.Vector3(20,1,20);
    const width = Math.max(size.x * 1.35, contentRadius * 2.4);
    const depth = Math.max(size.z * 1.35, contentRadius * 2.4);
    receiver = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), receiverMaterial);
    receiver.rotation.x = -Math.PI / 2;
    receiver.position.set(contentCentre.x, (sceneBounds?.min.y || 0) + state.receiverOffset, contentCentre.z);
  }

  receiver.name = 'ADAM_Shadow_Receiver';
  receiver.userData.adamShadowReceiver = true;
  receiver.receiveShadow = true;
  receiver.castShadow = false;
  receiver.frustumCulled = false;
  // Draw after the translucent site slab so the black shadow overlay remains
  // visible instead of being hidden beneath the approved slab material.
  receiver.renderOrder = -10;
  scene.add(receiver);
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
  shadowLight.name = 'ADAM_Shadow_Directional';
  shadowLight.castShadow = true;
  shadowLight.target.name = 'ADAM_Shadow_Target';

  const shadow = shadowLight.shadow;
  shadow.mapSize.set(state.mapSize, state.mapSize);
  shadow.bias = state.bias;
  shadow.normalBias = state.normalBias;
  shadow.radius = state.softness;

  const span = contentRadius * 1.35;
  shadow.camera.left = -span;
  shadow.camera.right = span;
  shadow.camera.top = span;
  shadow.camera.bottom = -span;
  shadow.camera.near = 0.1;
  shadow.camera.far = contentRadius * 10;
  shadow.camera.updateProjectionMatrix();

  scene.add(shadowLight, shadowLight.target);
  updateDirection();
}

function updateDirection() {
  if (!shadowLight) return;
  const az = THREE.MathUtils.degToRad(state.azimuth);
  const el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(state.elevation, 3, 88));
  const horizontal = Math.cos(el);
  const distance = contentRadius * 3.2;

  shadowLight.target.position.copy(contentCentre);
  shadowLight.position.set(
    contentCentre.x + Math.sin(az) * horizontal * distance,
    contentCentre.y + Math.sin(el) * distance,
    contentCentre.z + Math.cos(az) * horizontal * distance
  );
  shadowLight.target.updateMatrixWorld();
  shadowLight.updateMatrixWorld();
}

function applyState(renderer) {
  if (!renderer) return;
  renderer.shadowMap.enabled = !!state.enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  syncReceiverToSlab();

  if (receiver) receiver.visible = !!state.enabled;
  if (receiverMaterial) {
    receiverMaterial.opacity = state.darkness;
    receiverMaterial.needsUpdate = true;
  }

  if (shadowLight) {
    shadowLight.visible = !!state.enabled;
    shadowLight.castShadow = !!state.enabled;
    shadowLight.intensity = SHADOW_LIGHT_INTENSITY;
    shadowLight.shadow.radius = state.softness;
    shadowLight.shadow.bias = state.bias;
    shadowLight.shadow.normalBias = state.normalBias;
    updateDirection();
  }

  updateStatus();
}

function makeRange(host, label, key, min, max, step, suffix = '') {
  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  const labelEl = document.createElement('label');
  labelEl.innerHTML = `${label}<span data-v></span>`;
  const input = document.createElement('input');
  Object.assign(input, { type:'range', min, max, step, value:state[key] });

  const sync = () => {
    state[key] = Number(input.value);
    labelEl.querySelector('[data-v]').textContent = `${Number(state[key].toFixed(4))}${suffix}`;
    applyState(window.__ADAM_SHADOW_RENDERER);
  };
  input.addEventListener('input', sync);
  wrap.append(labelEl, input);
  host.appendChild(wrap);
  sync();
}

function buildControls() {
  if (panelBuilt) return;
  const panel = document.getElementById('panel');
  const anchor = document.getElementById('slabCtls');
  if (!panel || !anchor) return;
  panelBuilt = true;

  const heading = document.createElement('h2');
  heading.textContent = 'Shadows';
  const host = document.createElement('div');
  host.id = 'shadowCtls';

  const toggleRow = document.createElement('div');
  toggleRow.className = 'row tog';
  const toggle = document.createElement('button');
  toggle.id = 'tShadowCalibration';
  toggle.textContent = 'Shadows';
  toggle.classList.toggle('on', state.enabled);
  toggle.onclick = () => {
    state.enabled = !state.enabled;
    toggle.classList.toggle('on', state.enabled);
    applyState(window.__ADAM_SHADOW_RENDERER);
  };
  toggleRow.appendChild(toggle);
  host.appendChild(toggleRow);

  makeRange(host, 'Shadow direction °', 'azimuth', -180, 180, 1, '°');
  makeRange(host, 'Shadow light elevation °', 'elevation', 3, 88, 1, '°');
  makeRange(host, 'Shadow darkness', 'darkness', 0, 0.8, 0.01);
  makeRange(host, 'Shadow softness / spread', 'softness', 0, 18, 0.25);
  makeRange(host, 'Shadow bias', 'bias', -0.005, 0.005, 0.00005);
  makeRange(host, 'Shadow normal bias', 'normalBias', 0, 0.15, 0.0025);

  const reset = document.createElement('button');
  reset.className = 'btn ghost';
  reset.textContent = 'Reset shadow controls';
  reset.onclick = () => {
    Object.assign(state, DEFAULTS);
    panelBuilt = false;
    heading.remove();
    host.remove();
    buildControls();
    applyState(window.__ADAM_SHADOW_RENDERER);
  };
  host.appendChild(reset);

  statusEl = document.createElement('div');
  statusEl.className = 'scroll-hint';
  statusEl.style.marginTop = '8px';
  host.appendChild(statusEl);

  const next = anchor.nextSibling;
  panel.insertBefore(heading, next);
  panel.insertBefore(host, heading.nextSibling);
  updateStatus();
}

function updateStatus() {
  if (!statusEl) return;
  statusEl.textContent = state.enabled
    ? `shadow map ON · ${architecture.length} casters · receiver ${slabMesh ? 'actual base slab' : 'fallback plane'} · white light ${SHADOW_LIGHT_INTENSITY} · map ${state.mapSize}px`
    : 'shadow calibration disabled';
}

function install(renderer, scene) {
  if (installed) return;
  installed = true;
  window.__ADAM_SHADOW_RENDERER = renderer;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.updateMatrixWorld(true);
  slabMesh = findSlab(scene);
  collectArchitecture(scene);
  makeReceiver(scene);
  makeShadowLight(scene);
  buildControls();
  applyState(renderer);

  console.info('[ADAM shadows V2]', {
    casters:architecture.length,
    radius:contentRadius,
    slab:slabMesh?.name || null,
    receiverUsesSlab:!!receiver?.userData?.adamShadowReceiverUsesSlab,
    lightIntensity:SHADOW_LIGHT_INTENSITY
  });
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamShadowCalibrationV2Render(scene, camera) {
  install(this, scene);
  applyState(this);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_SHADOW_CALIBRATOR = {
  version:2,
  state,
  defaults:DEFAULTS,
  get light(){ return shadowLight; },
  get receiver(){ return receiver; },
  get slab(){ return slabMesh; },
  get casters(){ return architecture; }
};
