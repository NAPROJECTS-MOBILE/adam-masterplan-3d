/*
  ADAM path source-ribbon opacity control
  --------------------------------------
  The generated edge/glow rails have their own opacity controls, but the
  original GLB ribbon meshes remain visible underneath them. This module adds
  an independent source-ribbon opacity control so the actual underlying strip
  geometry can be faded without changing edge/glow/pulse settings.

  It is safe in production too: if no calibrator panel exists, it simply keeps
  sourceOpacity at 1.0 unless a runtime explicitly changes the style value.
*/

const DEFAULT_SOURCE_OPACITY = 1.0;
const CONTROL_ID = 'pathSourceOpacity';
const READOUT_ID = 'pathSourceOpacityV';

let bound = false;
let applyFrames = 0;

function style() {
  const s = window.__ADAM_PATH_RIBBON_STYLE;
  if (s && !Number.isFinite(Number(s.sourceOpacity))) s.sourceOpacity = DEFAULT_SOURCE_OPACITY;
  return s;
}

function retained() {
  return Array.isArray(window.__ADAM_PATH_RIBBON_REFS) ? window.__ADAM_PATH_RIBBON_REFS : [];
}

function cloneMaterialForSource(mesh) {
  if (!mesh?.material || mesh.userData?.adamPathSourceOpacityOwned) return;

  const remember = material => {
    if (!material) return material;
    const clone = material.clone?.() || material;
    clone.userData = { ...(clone.userData || {}) };
    clone.userData.adamPathSourceOriginalOpacity = Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1;
    clone.userData.adamPathSourceOriginalTransparent = !!material.transparent;
    clone.userData.adamPathSourceOriginalDepthWrite = material.depthWrite !== false;
    return clone;
  };

  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map(remember)
    : remember(mesh.material);

  mesh.userData = { ...(mesh.userData || {}), adamPathSourceOpacityOwned:true };
}

function eachMaterial(mesh, fn) {
  if (!mesh?.material) return;
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else fn(mesh.material);
}

function applySourceOpacity() {
  const s = style();
  if (!s) return false;

  const opacity = Math.max(0, Math.min(1, Number(s.sourceOpacity)));
  let count = 0;

  for (const entry of retained()) {
    const mesh = entry?.mesh;
    if (!mesh?.isMesh) continue;
    cloneMaterialForSource(mesh);

    eachMaterial(mesh, material => {
      if (!material) return;
      const baseOpacity = Number.isFinite(Number(material.userData?.adamPathSourceOriginalOpacity))
        ? Number(material.userData.adamPathSourceOriginalOpacity)
        : 1;
      const baseTransparent = !!material.userData?.adamPathSourceOriginalTransparent;
      const baseDepthWrite = material.userData?.adamPathSourceOriginalDepthWrite !== false;

      material.transparent = baseTransparent || opacity < 0.999;
      material.opacity = baseOpacity * opacity;
      material.depthTest = true;
      // An invisible/semi-transparent source ribbon must not leave a hidden
      // depth mask behind the generated rail/glow layers.
      material.depthWrite = opacity >= 0.999 ? baseDepthWrite : false;
      material.needsUpdate = true;
    });
    count++;
  }

  applyFrames++;
  window.__ADAM_PATH_SOURCE_OPACITY_STATE = {
    version:1,
    opacity,
    sources:count,
    applyFrames
  };
  return count > 0;
}

function ensureControl() {
  if (document.getElementById(CONTROL_ID)) return true;

  const edgeWidth = document.getElementById('pathEdgeWidth');
  const anchor = edgeWidth?.closest?.('.ctl');
  if (!anchor?.parentNode) return false;

  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  wrap.innerHTML = `
    <label>Strip source opacity<span id="${READOUT_ID}" data-v>${DEFAULT_SOURCE_OPACITY.toFixed(2)}</span></label>
    <input id="${CONTROL_ID}" type="range" min="0" max="1" step="0.01" value="${DEFAULT_SOURCE_OPACITY}">
  `;
  anchor.insertAdjacentElement('afterend', wrap);
  return true;
}

function paint() {
  const input = document.getElementById(CONTROL_ID);
  const readout = document.getElementById(READOUT_ID);
  if (input && readout) readout.textContent = Number(input.value).toFixed(2);
}

function bindControl() {
  if (bound) return true;
  if (!ensureControl()) return false;

  const input = document.getElementById(CONTROL_ID);
  if (!input) return false;

  const s = style();
  if (s) input.value = String(s.sourceOpacity ?? DEFAULT_SOURCE_OPACITY);
  paint();

  input.addEventListener('input', () => {
    const target = style();
    if (target) target.sourceOpacity = Number(input.value);
    paint();
    applySourceOpacity();
    syncExportSoon();
  });

  bound = true;
  return true;
}

function patchStripStyleBlock(text) {
  if (!text || typeof text !== 'string') return text;

  const regex = /const STRIP_STYLE = (\{[\s\S]*?\n\});/;
  const match = text.match(regex);
  if (!match) return text;

  try {
    const parsed = JSON.parse(match[1]);
    parsed.sourceOpacity = Number(style()?.sourceOpacity ?? DEFAULT_SOURCE_OPACITY);
    const replacement = `const STRIP_STYLE = ${JSON.stringify(parsed, null, 2)};`;
    return text.replace(match[0], replacement);
  } catch {
    return text;
  }
}

function syncExport() {
  const out = document.getElementById('out');
  if (!out?.value) return;
  out.value = patchStripStyleBlock(out.value);
}

function syncExportSoon() {
  setTimeout(syncExport, 0);
  setTimeout(syncExport, 40);
}

function wrapCopyButton() {
  const copy = document.getElementById('copyBtn');
  if (!copy || copy.dataset.pathSourceOpacityWrapped) return;
  copy.dataset.pathSourceOpacityWrapped = 'true';

  copy.addEventListener('click', () => {
    setTimeout(async () => {
      syncExport();
      try { await navigator.clipboard.writeText(document.getElementById('out')?.value || ''); }
      catch {}
    }, 60);
  });
}

function updateStatus() {
  const status = document.getElementById('pathRibbonStatus');
  if (!status || status.dataset.sourceOpacityStatus === '1') return;
  const s = style();
  if (!s) return;
  status.dataset.sourceOpacityStatus = '1';
}

function install() {
  style();
  bindControl();
  applySourceOpacity();
  wrapCopyButton();
  updateStatus();
  syncExportSoon();
}

install();

let attempts = 0;
const timer = setInterval(() => {
  install();
  if (bound && retained().length) clearInterval(timer);
  if (++attempts > 500) clearInterval(timer);
}, 25);

window.__ADAM_PATH_SOURCE_OPACITY = {
  version:1,
  apply:applySourceOpacity,
  patchExport:patchStripStyleBlock,
  get value(){ return Number(style()?.sourceOpacity ?? DEFAULT_SOURCE_OPACITY); },
  set value(v){
    const opacity = Math.max(0, Math.min(1, Number(v)));
    const s = style();
    if (s) s.sourceOpacity = opacity;
    const input = document.getElementById(CONTROL_ID);
    if (input) input.value = String(opacity);
    paint();
    applySourceOpacity();
    syncExportSoon();
  }
};
