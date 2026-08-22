import * as THREE from 'three';

/*
  ADAM calibrator — Base plate size
  ---------------------------------
  Calibrator-only live footprint control. This does not alter the GLB geometry
  or the frozen Material 2 setup.

  app-v2 rotates the large source Rectangle onto the ground and uses it as the
  slab. We scale that mesh in its local X/Y plane, which becomes world X/Z after
  the -90° X rotation. The separate isometric-dot overlay copies the slab's
  updated world matrix so the dots expand with the plate.
*/

const controlState = { baseScale:1.00 };
let sceneRef = null;
let slabMesh = null;
let dotOverlay = null;
let baseScale = null;
let uiBound = false;
const dotLift = new THREE.Matrix4().makeTranslation(0, .004, 0);

function findSlab(scene) {
  const mainGroup = scene?.getObjectByName?.('Main_Group');
  if (!mainGroup) return null;

  let best = null;
  let bestArea = -Infinity;

  for (const o of mainGroup.children) {
    if (!o?.isMesh || !/^Rectangle(?:_\d+)?$/.test(o.name)) continue;
    o.geometry?.computeBoundingBox?.();
    const bb = o.geometry?.boundingBox;
    if (!bb) continue;

    const ext = bb.getSize(new THREE.Vector3());
    const isLargePlanarBase = ext.z < 1e-5 && ext.x > 1000 && ext.y > 1000;
    if (!isLargePlanarBase) continue;

    const area = ext.x * ext.y;
    if (area > bestArea) {
      best = o;
      bestArea = area;
    }
  }

  return best;
}

function findDotOverlay(scene, slab) {
  let found = null;
  scene?.traverse?.(o => {
    if (found || !o?.isMesh || o === slab) return;
    if (o.geometry !== slab.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some(mat => mat?.isShaderMaterial)) found = o;
  });
  return found;
}

function capture(scene) {
  if (sceneRef === scene && slabMesh) return;

  const slab = findSlab(scene);
  if (!slab) return;

  sceneRef = scene;
  slabMesh = slab;
  baseScale = slab.scale.clone();
  dotOverlay = findDotOverlay(scene, slab);

  slabMesh.userData.adamBasePlateScaleBaseline = baseScale.clone();
  console.info('[ADAM base plate] captured', {
    name:slabMesh.name,
    baselineScale:baseScale.toArray(),
    dotOverlay:!!dotOverlay
  });

  applyScale();
}

function applyScale() {
  if (!slabMesh || !baseScale) return;

  const scale = Math.max(0.01, Number(controlState.baseScale) || 1);

  // Source base is an XY plane rotated onto world XZ by app-v2.
  slabMesh.scale.set(
    baseScale.x * scale,
    baseScale.y * scale,
    baseScale.z
  );
  slabMesh.updateMatrix();
  slabMesh.updateWorldMatrix(true, false);

  if (!dotOverlay || dotOverlay.parent == null) {
    dotOverlay = findDotOverlay(sceneRef, slabMesh);
  }

  if (dotOverlay) {
    dotOverlay.matrix.copy(slabMesh.matrixWorld);
    dotOverlay.matrix.premultiply(dotLift);
    dotOverlay.matrixWorldNeedsUpdate = true;
  }

  window.__ADAM_BASE_PLATE_SIZE = scale;
}

function bindUI() {
  if (uiBound) return;
  const host = document.getElementById('slabCtls');
  if (!host || !host.children.length) return;
  uiBound = true;

  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  wrap.innerHTML = '<label>Base plate size<span data-v>1.00</span></label>';

  const input = document.createElement('input');
  Object.assign(input, {
    type:'range',
    min:'0.80',
    max:'1.60',
    step:'0.01',
    value:'1.00'
  });

  // Match app-v2's generated-control metadata so its syncUI() can safely walk
  // this extra control alongside the native Base plate controls.
  wrap._input = input;
  wrap._key = 'baseScale';
  wrap._get = () => controlState;
  wrap._isColor = false;

  input.oninput = () => {
    controlState.baseScale = Number(input.value);
    wrap.querySelector('[data-v]').textContent = controlState.baseScale.toFixed(2);
    applyScale();
  };

  wrap.appendChild(input);
  host.appendChild(wrap);
  applyScale();
}

function waitForUI() {
  bindUI();
  if (!uiBound) requestAnimationFrame(waitForUI);
}
requestAnimationFrame(waitForUI);

// Capture from the real scene without touching GLTFLoader or the model-loading
// chain. This avoids interfering with Material 2 / path-ribbon loader wrappers.
const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamBasePlateSizeRender(scene, camera) {
  capture(scene);
  applyScale();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_BASE_PLATE_SIZE_STATE = controlState;
window.__ADAM_BASE_PLATE_SIZE_APPLY = value => {
  controlState.baseScale = Number(value);
  applyScale();
};
