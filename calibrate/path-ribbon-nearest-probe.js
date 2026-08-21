import * as THREE from 'three';

/*
  Diagnostic only. Does not modify ribbon geometry, materials, visibility,
  depth, camera, motion, or production styling.

  The scene itself is not an interactive picking surface in this calibrator, so
  identification is PANEL-ONLY. This module now reads renderer/camera state from
  an EARLY hook loaded before app boot, rather than wrapping renderer.render late
  and hoping to stay in the active render chain.
*/

let selectedPath = null;
let selectedIndex = -1;
let mode = 'likely';
let marker = null;
let markerLabel = null;
let uiInstalled = false;

function shortPath(path) {
  return String(path || '').replace('Scene_1/Main_Group/paths/', '');
}

function rows() {
  return window.__ADAM_PATH_RAIL_AUDIT_ROWS?.() || [];
}

function refs() {
  return Array.isArray(window.__ADAM_PATH_RIBBON_REFS) ? window.__ADAM_PATH_RIBBON_REFS : [];
}

function view() {
  return window.__ADAM_PATH_VIEW?.() || { renderer:null, scene:null, camera:null };
}

function candidateRows() {
  const all = rows();
  const likely = all.filter(row => Number(row.geometrySharedBy) > 1);
  return mode === 'likely' && likely.length ? likely : all;
}

function sourceFor(path) {
  return refs().find(entry => entry.originalPath === path)?.mesh || null;
}

function ensureMarker() {
  if (marker) return;

  marker = document.createElement('div');
  marker.id = 'adamPathCandidateMarker';
  Object.assign(marker.style, {
    position:'fixed',
    width:'34px',
    height:'34px',
    marginLeft:'-17px',
    marginTop:'-17px',
    border:'4px solid #ff2f7d',
    borderRadius:'50%',
    boxShadow:'0 0 0 2px #111, 0 0 18px rgba(255,47,125,.95)',
    pointerEvents:'none',
    zIndex:'2147483646',
    display:'none'
  });

  markerLabel = document.createElement('div');
  Object.assign(markerLabel.style, {
    position:'fixed',
    padding:'5px 7px',
    background:'#111',
    color:'#ff8db5',
    border:'1px solid #ff2f7d',
    borderRadius:'3px',
    font:'11px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace',
    whiteSpace:'nowrap',
    pointerEvents:'none',
    zIndex:'2147483647',
    display:'none'
  });

  document.body.append(marker, markerLabel);
}

function hideMarker() {
  selectedPath = null;
  selectedIndex = -1;
  if (marker) marker.style.display = 'none';
  if (markerLabel) markerLabel.style.display = 'none';
  const probe = document.getElementById('pathRibbonProbe');
  if (probe) probe.textContent = 'Marker cleared. Use Prev / Next to cycle candidates.';
}

function updateMarker() {
  if (!selectedPath) return;

  const { renderer, camera } = view();
  const source = sourceFor(selectedPath);
  if (!renderer?.domElement || !camera || !source?.geometry) return;

  source.geometry.computeBoundingBox();
  const box = source.geometry.boundingBox;
  if (!box) return;

  source.updateWorldMatrix(true, false);
  camera.updateMatrixWorld?.(true);

  const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(source.matrixWorld).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return;

  ensureMarker();
  if (centre.z < -1 || centre.z > 1) {
    marker.style.display = 'none';
    markerLabel.style.display = 'none';
    return;
  }

  const x = rect.left + (centre.x + 1) * 0.5 * rect.width;
  const y = rect.top + (1 - centre.y) * 0.5 * rect.height;

  marker.style.left = `${x}px`;
  marker.style.top = `${y}px`;
  marker.style.display = 'block';
  markerLabel.style.left = `${x + 21}px`;
  markerLabel.style.top = `${y - 9}px`;
  markerLabel.style.display = 'block';
}

function showSelection(index) {
  const list = candidateRows();
  const probe = document.getElementById('pathRibbonProbe');

  if (!list.length) {
    if (probe) probe.textContent = 'Identifier: waiting for ribbon audit data. Press Run rail audit once, then use Next candidate.';
    return;
  }

  selectedIndex = ((index % list.length) + list.length) % list.length;
  const row = list[selectedIndex];
  selectedPath = row.fullPath;
  ensureMarker();
  markerLabel.textContent = shortPath(selectedPath);
  updateMarker();

  if (probe) {
    probe.textContent = `MARKED ${selectedIndex + 1}/${list.length}: ${row.name} · rails ${row.rails} · segs ${row.segments} · shared geometry ×${row.geometrySharedBy}`;
  }
}

function toggleMode(button) {
  mode = mode === 'likely' ? 'all' : 'likely';
  selectedIndex = -1;
  selectedPath = null;
  if (button) button.textContent = mode === 'likely' ? 'Mode: likely spurs' : 'Mode: all ribbons';
  showSelection(0);
}

function installUI() {
  if (uiInstalled) return;
  const probe = document.getElementById('pathRibbonProbe');
  if (!probe) return;

  const oldPick = document.getElementById('pathRailIdentifyBtn');
  if (oldPick) {
    oldPick.disabled = true;
    oldPick.classList.remove('on');
    oldPick.textContent = 'Scene picking unavailable';
  }

  const row = document.createElement('div');
  row.className = 'row';
  row.id = 'pathPanelIdentifier';

  const prev = document.createElement('button');
  prev.textContent = '◀ Prev candidate';
  prev.onclick = () => showSelection(selectedIndex < 0 ? 0 : selectedIndex - 1);

  const next = document.createElement('button');
  next.textContent = 'Next candidate ▶';
  next.onclick = () => showSelection(selectedIndex < 0 ? 0 : selectedIndex + 1);

  const modeBtn = document.createElement('button');
  modeBtn.textContent = 'Mode: likely spurs';
  modeBtn.onclick = () => toggleMode(modeBtn);

  const clear = document.createElement('button');
  clear.textContent = 'Clear marker';
  clear.onclick = hideMarker;

  row.append(prev, next, modeBtn, clear);
  probe.after(row);
  probe.textContent = 'Scene objects are not clickable. Use Prev / Next; a pink marker will identify candidates without changing the WebGL scene.';
  uiInstalled = true;
}

function tick() {
  installUI();
  updateMarker();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__ADAM_PATH_PANEL_SELECT = showSelection;
window.__ADAM_PATH_PANEL_CLEAR = hideMarker;
