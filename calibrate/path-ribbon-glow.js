import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM path-ribbon edge + glow
  ----------------------------
  Foreground rails are real ribbon meshes under:

    Scene_1/Main_Group/paths/**

  The 10° EdgesGeometry rail treatment is user-confirmed working on the long
  main bundle. The remaining visually failing short angled spurs are also under
  /paths/, but they are the one exact structural subset that share source
  geometry between 3–4 separate mesh nodes.

  Static analysis says their EdgesGeometry output is valid, so shared geometry
  is used here only as a SAFE DISCRIMINATOR for the known failing subset, not as
  an explanation of the bug. Those shared groups now use a transform-safe
  principal-axis centreline treatment instead of hundreds of generated edge
  segments. Each mesh still receives its own LineSegments2 objects, so every
  spur gets an independent dark core + inner glow + outer halo at its own node
  transform. Unique-geometry ribbons keep the already-working 10° rail code
  completely unchanged.
*/

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const DEFAULT_PATH_EDGE_ANGLE = 10;
const retained = [];
const entries = [];
let builtAngle = null;
let initialized = false;
let totalRailSegments = 0;
let fallbackCount = 0;
let lastRenderer = null;
let lastScene = null;
let lastCamera = null;
let clickIdentifyEnabled = false;

const edgeMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.NormalBlending
});
edgeMaterial.toneMapped = false;

const innerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.NormalBlending
});
innerGlowMaterial.toneMapped = false;

const outerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.NormalBlending
});
outerGlowMaterial.toneMapped = false;

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function shortPath(path) {
  return String(path || '').replace(PATH_PREFIX, '');
}

function capture(root) {
  retained.length = 0;
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const path = pathOf(object);
    if (!path.startsWith(PATH_PREFIX)) return;
    retained.push({ mesh:object, originalPath:path });
  });
  console.info(`[ADAM path rails] captured ${retained.length} Main_Group/paths mesh(es).`);
}

// Capture exact mesh references before app-v2 classifies/recentres the model.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCapturePathRails(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    setTimeout(() => waitForAppControls(), 0);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function geometryShareCounts() {
  const counts = new Map();
  for (const { mesh } of retained) {
    const uuid = mesh.geometry?.uuid || '(none)';
    counts.set(uuid, (counts.get(uuid) || 0) + 1);
  }
  return counts;
}

function longestAxisOf(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return 0;
  const size = box.getSize(new THREE.Vector3());
  if (size.y >= size.x && size.y >= size.z) return 1;
  if (size.z >= size.x && size.z >= size.y) return 2;
  return 0;
}

function railGeometryForMesh(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return { geometry:null, segments:0, mode:'rails' };
  }

  const lengthAxis = longestAxisOf(mesh);
  const kept = [];

  for (let i = 0; i + 1 < pos.count; i += 2) {
    const dx = pos.getX(i + 1) - pos.getX(i);
    const dy = pos.getY(i + 1) - pos.getY(i);
    const dz = pos.getZ(i + 1) - pos.getZ(i);
    const d = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
    const along = d[lengthAxis];
    const across = Math.max(d[(lengthAxis + 1) % 3], d[(lengthAxis + 2) % 3]);

    // Keep the longitudinal rails; reject end-cap/cross-profile strokes.
    if (along < across * 0.65) continue;

    kept.push(
      pos.getX(i), pos.getY(i), pos.getZ(i),
      pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)
    );
  }

  edges.dispose();
  if (!kept.length) return { geometry:null, segments:0, mode:'rails' };

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(kept));
  return { geometry, segments:kept.length / 6, mode:'rails' };
}

// One straight local-space centreline through the actual ribbon geometry.
// Principal-axis extraction avoids assuming the authored strip aligns to X/Y/Z.
// This is intentionally used only for shared-geometry spur groups; the working
// long bundle remains on the exact railGeometryForMesh path above.
function principalCentrelineGeometry(mesh) {
  const pos = mesh.geometry?.attributes?.position;
  if (!pos || pos.count < 2) return { geometry:null, segments:0, mode:'shared-centreline' };

  const centre = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    centre.add(p);
  }
  centre.multiplyScalar(1 / pos.count);

  let xx=0, xy=0, xz=0, yy=0, yz=0, zz=0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(centre);
    xx += p.x*p.x; xy += p.x*p.y; xz += p.x*p.z;
    yy += p.y*p.y; yz += p.y*p.z; zz += p.z*p.z;
  }

  // Seed on the axis with greatest variance, then power-iterate the covariance
  // matrix to obtain the dominant direction even for diagonally-authored strips.
  let axis = new THREE.Vector3(1,0,0);
  if (yy >= xx && yy >= zz) axis.set(0,1,0);
  else if (zz >= xx && zz >= yy) axis.set(0,0,1);

  for (let i = 0; i < 16; i++) {
    const x = xx*axis.x + xy*axis.y + xz*axis.z;
    const y = xy*axis.x + yy*axis.y + yz*axis.z;
    const z = xz*axis.x + yz*axis.y + zz*axis.z;
    axis.set(x,y,z);
    if (axis.lengthSq() < 1e-16) break;
    axis.normalize();
  }
  if (axis.lengthSq() < 1e-12) return { geometry:null, segments:0, mode:'shared-centreline' };

  let minT = Infinity, maxT = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(centre);
    const t = p.dot(axis);
    minT = Math.min(minT, t);
    maxT = Math.max(maxT, t);
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT - minT < 1e-6) {
    return { geometry:null, segments:0, mode:'shared-centreline' };
  }

  // Tiny inset prevents any fat-line cap from extending beyond the real ribbon
  // while still reaching essentially the full visible spur length.
  const inset = (maxT - minT) * 0.01;
  minT += inset;
  maxT -= inset;
  const a = centre.clone().addScaledVector(axis, minT);
  const b = centre.clone().addScaledVector(axis, maxT);

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array([a.x,a.y,a.z,b.x,b.y,b.z]));
  return { geometry, segments:1, mode:'shared-centreline' };
}

function clearLayers() {
  for (const entry of entries) {
    for (const line of [entry.outer, entry.inner, entry.edge]) {
      line.removeFromParent();
      line.geometry?.dispose?.();
    }
  }
  entries.length = 0;
  totalRailSegments = 0;
  fallbackCount = 0;
}

function pathAngle() {
  const input = document.getElementById('pathEdgeAngle');
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : DEFAULT_PATH_EDGE_ANGLE;
}

function rebuild() {
  const angle = pathAngle();
  clearLayers();
  const shareCounts = geometryShareCounts();

  for (const retainedEntry of retained) {
    const source = retainedEntry.mesh;
    if (!source?.parent || !source.geometry?.attributes?.position) continue;

    const shareCount = shareCounts.get(source.geometry?.uuid || '(none)') || 1;
    const result = shareCount > 1
      ? principalCentrelineGeometry(source)
      : railGeometryForMesh(source, angle);
    if (!result.geometry) continue;

    const outer = new LineSegments2(result.geometry, outerGlowMaterial);
    const inner = new LineSegments2(result.geometry.clone(), innerGlowMaterial);
    const edge = new LineSegments2(result.geometry.clone(), edgeMaterial);

    for (const line of [outer, inner, edge]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamPathRailSource = retainedEntry.originalPath;
      line.userData.adamPathRailMode = result.mode;
      line.frustumCulled = false;
    }

    outer.renderOrder = 90;
    inner.renderOrder = 91;
    edge.renderOrder = 92;

    source.add(outer, inner, edge);
    entries.push({
      source,
      outer,
      inner,
      edge,
      segments:result.segments,
      mode:result.mode,
      geometrySharedBy:shareCount
    });
    totalRailSegments += result.segments;
    if (result.mode === 'shared-centreline') fallbackCount++;
  }

  builtAngle = angle;
  syncFromCalibrator();
  updateStatus();

  console.info(
    `[ADAM path rails] angle ${angle}° · ${entries.length}/${retained.length} ribbons · ` +
    `${totalRailSegments} segments · shared-centreline fallback ${fallbackCount}`
  );
}

function wrapFor(hostId, key) {
  const host = document.getElementById(hostId);
  if (!host) return null;
  return [...host.children].find(child => child?._key === key) || null;
}

function readControl(hostId, key, fallback) {
  const wrap = wrapFor(hostId, key);
  const input = wrap?._input;
  if (!input) return fallback;
  if (wrap._isColor) return input.value || fallback;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function setResolution() {
  const root = document.querySelector('[data-scene3d]');
  const r = root?.getBoundingClientRect?.();
  const w = Math.max(1, Math.round(r?.width || 1));
  const h = Math.max(1, Math.round(r?.height || 1));
  edgeMaterial.resolution.set(w, h);
  innerGlowMaterial.resolution.set(w, h);
  outerGlowMaterial.resolution.set(w, h);
}

function syncFromCalibrator() {
  if (!entries.length) return;

  const edgeColor = readControl('edgeCtls', 'edge', '#242424');
  const edgeOpacity = readControl('edgeCtls', 'edgeOpacity', 0.14);
  const edgeWidth = readControl('edgeCtls', 'edgeWidth', 1.0);
  const glowColor = readControl('glowCtls', 'glow', '#86bf40');
  const glowOpacity = readControl('glowCtls', 'glowOpacity', 0.06);
  const glowWidth = readControl('glowCtls', 'glowWidth', 7.0);
  const glowStrength = readControl('glowCtls', 'glowStrength', 0.55);

  edgeMaterial.color.set(edgeColor);
  edgeMaterial.opacity = THREE.MathUtils.clamp(edgeOpacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.2, edgeWidth);

  const combined = THREE.MathUtils.clamp(glowOpacity * glowStrength, 0, 1);
  innerGlowMaterial.color.set(glowColor);
  innerGlowMaterial.opacity = THREE.MathUtils.clamp(combined * 2.3, 0, 0.55);
  innerGlowMaterial.linewidth = Math.max(1, glowWidth);

  outerGlowMaterial.color.set(glowColor);
  outerGlowMaterial.opacity = THREE.MathUtils.clamp(combined * 0.9, 0, 0.24);
  outerGlowMaterial.linewidth = Math.max(1.5, glowWidth * 1.9);

  setResolution();

  const glowButton = document.getElementById('tGlow');
  const edgeButton = document.getElementById('tEdges');
  const glowVisible = glowButton ? glowButton.classList.contains('on') : true;
  const edgeVisible = edgeButton ? edgeButton.classList.contains('on') : true;

  for (const entry of entries) {
    entry.outer.visible = glowVisible;
    entry.inner.visible = glowVisible;
    entry.edge.visible = edgeVisible;
  }
}

function updateStatus(extra = '') {
  const status = document.getElementById('pathRibbonStatus');
  if (status) {
    status.textContent = `${entries.length}/${retained.length} ribbons · ${totalRailSegments} segments · ` +
      `${fallbackCount} shared-spur fallbacks · ${pathAngle()}°${extra ? ` · ${extra}` : ''}`;
  }
}

function sourceWorldBox(mesh) {
  mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) return new THREE.Box3();
  mesh.updateWorldMatrix(true, false);
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}

function railWorldBox(rails) {
  const box = new THREE.Box3();
  for (const rail of rails) {
    rail.updateWorldMatrix(true, false);
    box.expandByObject(rail);
  }
  return box;
}

function rootOf(object) {
  let node = object;
  while (node?.parent) node = node.parent;
  return node || null;
}

function lineSegmentCount(line) {
  const g = line?.geometry;
  const instanceStart = g?.attributes?.instanceStart;
  if (instanceStart?.count != null) return instanceStart.count;
  const pos = g?.attributes?.position;
  return pos?.count ? Math.floor(pos.count / 2) : 0;
}

function auditRows() {
  const shareCounts = geometryShareCounts();
  return retained.map(({ mesh, originalPath }) => {
    const rails = mesh.children.filter(child => child.userData?.adamPathRailLayer);
    const sourceBox = sourceWorldBox(mesh);
    const rBox = railWorldBox(rails);
    const railBoxEmpty = !rails.length || rBox.isEmpty();
    const sourceCentre = sourceBox.getCenter(new THREE.Vector3());
    const railCentre = railBoxEmpty ? new THREE.Vector3() : rBox.getCenter(new THREE.Vector3());
    const centreOffset = railBoxEmpty ? -1 : sourceCentre.distanceTo(railCentre);
    const root = rootOf(mesh);
    const inScene = !!root?.isScene;
    const uuid = mesh.geometry?.uuid || '(none)';
    const builtEntry = entries.find(entry => entry.source === mesh);

    return {
      name: shortPath(originalPath),
      fullPath: originalPath,
      mode:builtEntry?.mode || '(none)',
      rails: rails.length,
      segments: builtEntry?.segments ?? lineSegmentCount(rails[0]),
      visible: rails.map(r => r.visible),
      railBoxEmpty,
      centreOffset:Number(centreOffset.toFixed(5)),
      meshVisible:mesh.visible,
      inScene,
      isInstancedMesh:!!mesh.isInstancedMesh,
      geometryUuid:uuid,
      geometrySharedBy:shareCounts.get(uuid) || 1,
      position:[mesh.position.x, mesh.position.y, mesh.position.z].map(v => Number(v.toFixed(5)))
    };
  });
}

function suspiciousRows(rows) {
  return rows.filter(row =>
    row.rails !== 3 ||
    row.segments <= 0 ||
    row.railBoxEmpty ||
    row.centreOffset < 0 ||
    row.centreOffset > 0.25 ||
    !row.meshVisible ||
    !row.inScene
  );
}

function renderAudit() {
  const rows = auditRows();
  const bad = suspiciousRows(rows);
  console.group(`[ADAM path rail runtime audit] ${bad.length} suspicious / ${rows.length} ribbons`);
  console.table(rows);
  console.groupEnd();

  const probe = document.getElementById('pathRibbonProbe');
  if (probe) {
    if (!bad.length) {
      probe.textContent = `Runtime audit: all ${rows.length} retained ribbons have 3 visible rail layers. ${fallbackCount} shared-geometry angled spurs are using the new principal-centreline fallback.`;
    } else {
      probe.textContent = `Runtime audit found ${bad.length} suspicious ribbon(s): ${bad.map(r => r.name).join(', ')}`;
    }
  }
  updateStatus(`${bad.length} runtime anomalies`);
  return rows;
}

async function copyAudit() {
  const rows = auditRows();
  const text = JSON.stringify(rows, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    const probe = document.getElementById('pathRibbonProbe');
    if (probe) probe.textContent = `Copied runtime audit for ${rows.length} ribbons.`;
  } catch {
    console.log(text);
  }
}

function identifyFromEvent(event) {
  if (!clickIdentifyEnabled || !lastRenderer || !lastCamera || !lastScene) return;
  const canvas = lastRenderer.domElement;
  if (!canvas || event.target !== canvas) return;

  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line2 = { threshold:10 };
  raycaster.setFromCamera(pointer, lastCamera);

  const candidates = [
    ...retained.map(entry => entry.mesh),
    ...entries.flatMap(entry => [entry.outer, entry.inner, entry.edge])
  ];
  const hit = raycaster.intersectObjects(candidates, false)[0];
  const probe = document.getElementById('pathRibbonProbe');
  if (!hit) {
    if (probe) probe.textContent = 'Click probe: no path ribbon hit. Try clicking directly on the visible spur mesh.';
    return;
  }

  let source = hit.object;
  if (hit.object.userData?.adamPathRailLayer) {
    const sourcePath = hit.object.userData.adamPathRailSource;
    source = retained.find(entry => entry.originalPath === sourcePath)?.mesh || hit.object.parent;
  }
  const row = auditRows().find(item => item.fullPath === pathOf(source));
  const label = row?.name || shortPath(pathOf(source));
  console.info('[ADAM path click probe]', row || { path:pathOf(source), hit:hit.object });

  if (probe) {
    probe.textContent = row
      ? `CLICK: ${label} · ${row.mode} · rails ${row.rails} · segs ${row.segments} · centre offset ${row.centreOffset} · shared geometry ×${row.geometrySharedBy} · visible ${row.visible.join('/')}`
      : `CLICK: ${label} · no audit row found`;
  }
}

function bindControls() {
  const angleInput = document.getElementById('pathEdgeAngle');
  const angleValue = document.getElementById('pathEdgeAngleV');
  if (angleInput) {
    const paint = () => {
      if (angleValue) angleValue.textContent = `${Number(angleInput.value).toFixed(0)}°`;
    };
    angleInput.addEventListener('input', () => {
      paint();
      rebuild();
    });
    paint();
  }

  document.getElementById('pathRailAuditBtn')?.addEventListener('click', renderAudit);
  document.getElementById('pathRailCopyBtn')?.addEventListener('click', copyAudit);
  document.getElementById('pathRailIdentifyBtn')?.addEventListener('click', event => {
    clickIdentifyEnabled = !clickIdentifyEnabled;
    event.currentTarget.classList.toggle('on', clickIdentifyEnabled);
    event.currentTarget.textContent = clickIdentifyEnabled ? 'Click identify: ON' : 'Click identify';
    const probe = document.getElementById('pathRibbonProbe');
    if (probe && clickIdentifyEnabled) probe.textContent = 'Click-identify is ON. Click one of the path strips in the canvas.';
  });
  document.addEventListener('click', identifyFromEvent, true);

  document.getElementById('edgeCtls')?.addEventListener('input', syncFromCalibrator);
  document.getElementById('glowCtls')?.addEventListener('input', syncFromCalibrator);
  document.getElementById('presetRow')?.addEventListener('click', () => requestAnimationFrame(syncFromCalibrator));

  for (const id of ['tEdges', 'tGlow', 'resetBtn']) {
    document.getElementById(id)?.addEventListener('click', () => requestAnimationFrame(syncFromCalibrator));
  }

  const root = document.querySelector('[data-scene3d]');
  if (root && 'ResizeObserver' in window) new ResizeObserver(setResolution).observe(root);
}

function initialize() {
  if (initialized) return;
  initialized = true;
  bindControls();
  rebuild();
}

let waitFrames = 0;
function waitForAppControls() {
  if (initialized) return;
  const edgeReady = document.getElementById('edgeCtls')?.children?.length;
  const glowReady = document.getElementById('glowCtls')?.children?.length;
  if (edgeReady && glowReady) {
    initialize();
    return;
  }
  if (waitFrames++ < 180) requestAnimationFrame(waitForAppControls);
  else console.warn('[ADAM path rails] app-v2 controls never became ready.');
}

// Capture live renderer/scene/camera references without changing the render.
const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamPathRailProbeRender(scene, camera) {
  lastRenderer = this;
  lastScene = scene;
  lastCamera = camera;
  return previousRender.call(this, scene, camera);
};

window.__ADAM_PATH_RIBBON_REFS = retained;
window.__ADAM_PATH_RAIL_LAYERS = entries;
window.__ADAM_REBUILD_PATH_RAILS = rebuild;
window.__ADAM_PATH_RAIL_AUDIT = renderAudit;
window.__ADAM_PATH_RAIL_AUDIT_ROWS = auditRows;
