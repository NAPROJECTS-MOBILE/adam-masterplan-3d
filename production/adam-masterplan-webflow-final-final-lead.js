import * as THREE from 'three';

/*
  ADAM final-final website wrapper — predictive 95% scroll smoothing
  -----------------------------------------------------------------
  Restored predictive-lead website build, with the approved warm neutral baked
  into both the scene background and the actual large base/slab mesh.

  Warm neutral:
    RGB 242, 243, 240
    HEX #f2f3f0
*/

await import('./scroll-smoothing-95.js?v=velocity-lead-v2-20260826-1114');
await import('./adam-masterplan-webflow-final-final.js?v=velocity-lead-wrapper-20260826-1114');

const BASE_COLOR = '#f2f3f0';
let installed = false;
let slabMesh = null;

function eachMaterial(mesh, fn) {
  if (!mesh?.material) return;
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else fn(mesh.material);
}

function findBasePlate(scene) {
  const mainGroup = scene?.getObjectByName?.('Main_Group');
  if (!mainGroup) return null;

  let best = null;
  let bestArea = -Infinity;
  const size = new THREE.Vector3();

  for (const object of mainGroup.children) {
    if (!object?.isMesh || !/^Rectangle(?:_\d+)?$/.test(object.name)) continue;

    object.geometry?.computeBoundingBox?.();
    const box = object.geometry?.boundingBox;
    if (!box) continue;

    box.getSize(size);
    const isLargePlanarBase = Math.abs(size.z) < 1e-5 && size.x > 1000 && size.y > 1000;
    if (!isLargePlanarBase) continue;

    const area = size.x * size.y;
    if (area > bestArea) {
      best = object;
      bestArea = area;
    }
  }

  return best;
}

function ownBasePlateMaterial(mesh) {
  if (!mesh?.material || mesh.userData?.adamWarmBaseMaterialOwned) return;

  const clone = material => material?.clone?.() || material;
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map(clone)
    : clone(mesh.material);

  mesh.userData = {
    ...(mesh.userData || {}),
    adamWarmBaseMaterialOwned:true
  };
}

function applyWarmBackgroundAndBase(api) {
  if (!api?.scene) return false;

  if (!api.scene.background?.isColor) api.scene.background = new THREE.Color(BASE_COLOR);
  else api.scene.background.set(BASE_COLOR);

  api.renderer?.setClearColor?.(BASE_COLOR, 1);

  if (!slabMesh || slabMesh.parent == null) slabMesh = findBasePlate(api.scene);
  if (slabMesh) {
    ownBasePlateMaterial(slabMesh);
    eachMaterial(slabMesh, material => {
      if (!material) return;
      material.color?.set?.(BASE_COLOR);
      material.needsUpdate = true;
    });
  }

  if (api.style) {
    api.style.background = BASE_COLOR;
    api.style.slab = BASE_COLOR;
  }

  if (api.completeExport?.STYLE) {
    api.completeExport.STYLE.background = BASE_COLOR;
    api.completeExport.STYLE.slab = BASE_COLOR;
  }

  if (api.finalFinal) api.finalFinal.baseColor = BASE_COLOR;

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.baseColor = BASE_COLOR;

  return true;
}

function install(api) {
  if (installed || !api?.scene || !api?.renderer) return false;

  applyWarmBackgroundAndBase(api);

  window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
  window.__ADAM_BEFORE_RENDER_HOOKS.push(() => applyWarmBackgroundAndBase(api));

  installed = true;
  console.info('[ADAM predictive lead] warm background/base baked', {
    rgb:[242,243,240],
    hex:BASE_COLOR,
    slab:slabMesh?.name || null
  });
  return true;
}

if (!install(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
