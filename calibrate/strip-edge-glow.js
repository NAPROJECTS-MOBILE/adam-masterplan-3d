import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM dedicated strip edge + glow v3
  -----------------------------------
  Separate from the building edge/glow system.

  The important correction here is TARGETING. Previous versions only searched
  under Main_Group/clusters, but app-v2's own `pathMeshes` are built from ALL
  flat meshes in the model (minus the primary slab). The long landscape strips
  can therefore live outside the clusters subtree and never enter the dedicated
  strip system at all.

  This version mirrors the real path-mesh idea instead:
    - capture every horizontal, planar, elongated non-base mesh in the GLB,
      regardless of hierarchy path;
    - keep the five known thin targets as unconditional inclusions;
    - exclude the giant site/base plate explicitly;
    - attach a private edge + inner glow + outer halo directly to the exact mesh;
    - hide competing generic line children on those meshes;
    - fall back to discovering candidates from the rendered scene if the loader
      hook ever misses, so the dedicated system cannot silently do nothing.
*/

const FLAT_WORLD_HEIGHT = 0.16;
const MIN_ASPECT = 1.8;
const PLANAR_RATIO = 0.06;
const HUGE_BASE_SIZE = 900;

const EXPLICIT_STRIP_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

const style = {
  edgeColor:'#242424',
  edgeOpacity:0.34,
  edgeWidth:1.2,
  edgeAngle:30,
  glowColor:'#86bf40',
  glowOpacity:0.68,
  glowWidth:9.0,
  haloOpacity:0.26,
  haloWidth:24.0,
  expansion:0.0025,
  edgesVisible:true,
  glowVisible:true
};

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function localMetrics(mesh) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (!bb) return null;
  const localSize = bb.getSize(new THREE.Vector3());
  const dims = [Math.abs(localSize.x), Math.abs(localSize.y), Math.abs(localSize.z)].sort((a,b) => a-b);
  const thin = dims[0];
  const width = Math.max(dims[1], 1e-6);
  const length = Math.max(dims[2], 1e-6);
  return {
    localSize,
    thin,
    width,
    length,
    planarRatio:thin / width,
    aspect:length / width
  };
}

function worldSizeOf(mesh) {
  mesh.updateWorldMatrix?.(true, false);
  return new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
}

function isHugeBase(metrics) {
  return metrics && metrics.length >= HUGE_BASE_SIZE && metrics.width >= HUGE_BASE_SIZE;
}

function qualifies(mesh, originalPath = pathOf(mesh)) {
  const explicit = EXPLICIT_STRIP_PATHS.has(originalPath);
  const metrics = localMetrics(mesh);
  if (!metrics) return null;

  const worldSize = worldSizeOf(mesh);
  const horizontalFlat = Math.abs(worldSize.y) <= FLAT_WORLD_HEIGHT;
  const planar = metrics.planarRatio <= PLANAR_RATIO;
  const elongated = metrics.aspect >= MIN_ASPECT;
  const hugeBase = isHugeBase(metrics);

  if (!explicit && !(horizontalFlat && planar && elongated && !hugeBase)) return null;
  return { explicit, metrics, worldSize };
}

let retained = [];
let captureDone = false;
let builtAngle = null;
let uiInstalled = false;
let countReadout = null;

function addRetained(mesh, originalPath, data) {
  if (!mesh || retained.some(entry => entry.mesh === mesh)) return false;
  mesh.userData.adamDedicatedStrip = true;
  mesh.userData.adamDedicatedStripOriginalPath = originalPath;
  retained.push({ mesh, originalPath, ...data });
  return true;
}

function captureStrips(root, source = 'loader') {
  const foundExplicit = new Set();
  let added = 0;
  root?.updateWorldMatrix?.(true, true);

  root?.traverse?.(mesh => {
    if (!mesh?.isMesh || mesh.isLineSegments2 || !mesh.geometry?.attributes?.position) return;
    const originalPath = pathOf(mesh);
    const data = qualifies(mesh, originalPath);
    if (!data) return;
    if (data.explicit) foundExplicit.add(originalPath);
    if (addRetained(mesh, originalPath, data)) added++;
  });

  captureDone = true;
  builtAngle = null;
  console.info(
    `[ADAM dedicated strips v3] ${source}: added ${added}, retained ${retained.length}; ` +
    `explicit ${foundExplicit.size}/${EXPLICIT_STRIP_PATHS.size}`
  );
}

// Primary capture: pristine GLB before spline-motion reparents anything.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureDedicatedStrips(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureStrips(gltf?.scene, 'pre-motion');
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

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

const edgeLines = [];
const innerGlowLines = [];
const outerGlowLines = [];

function clearLines(lines) {
  for (const line of lines) {
    line.removeFromParent();
    line.geometry?.dispose?.();
  }
  lines.length = 0;
}

function makeGeometry(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return null;
  }
  const arr = new Float32Array(pos.count * 3);
  arr.set(pos.array);
  edges.dispose();
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(arr);
  return geometry;
}

function addLine(entry, geometry, material, target, kind, renderOrder, instanceMatrix = null) {
  const line = new LineSegments2(geometry.clone(), material);
  line.userData.adamDedicatedStripLayer = true;
  line.userData.adamDedicatedStripKind = kind;
  line.userData.adamDedicatedStripPath = entry.originalPath;
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
    line.userData.adamDedicatedStripBaseMatrix = instanceMatrix.clone();
  }
  entry.mesh.add(line);
  target.push(line);
}

function addTriplet(entry, geometry, instanceMatrix = null) {
  addLine(entry, geometry, outerGlowMaterial, outerGlowLines, 'outer-halo', 60, instanceMatrix);
  addLine(entry, geometry, innerGlowMaterial, innerGlowLines, 'inner-glow', 61, instanceMatrix);
  addLine(entry, geometry, edgeMaterial, edgeLines, 'edge', 62, instanceMatrix);
}

function rebuild() {
  clearLines(edgeLines);
  clearLines(innerGlowLines);
  clearLines(outerGlowLines);

  let emptyGeometry = 0;
  for (const entry of retained) {
    const mesh = entry.mesh;
    if (!mesh?.parent || !mesh.geometry?.attributes?.position) continue;
    const geometry = makeGeometry(mesh, style.edgeAngle);
    if (!geometry) { emptyGeometry++; continue; }

    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        addTriplet(entry, geometry, matrix.clone());
      }
    } else {
      addTriplet(entry, geometry);
    }
    geometry.dispose();
  }

  builtAngle = style.edgeAngle;
  updateReadout();
  console.info(
    `[ADAM dedicated strips v3] built ${edgeLines.length} edge + ${innerGlowLines.length} inner + ` +
    `${outerGlowLines.length} halo layer(s); empty geometry=${emptyGeometry}`
  );
}

function canvasSize() {
  const canvas = document.querySelector('[data-scene3d-canvas]');
  if (!canvas) return { width:1, height:1 };
  const rect = canvas.getBoundingClientRect();
  return {
    width:Math.max(1, Math.round(rect.width)),
    height:Math.max(1, Math.round(rect.height))
  };
}

function applyExpansion(line, amount, multiplier) {
  const scale = 1 + Math.max(0, amount) * multiplier;
  const base = line.userData.adamDedicatedStripBaseMatrix;
  if (base && !line.matrixAutoUpdate) {
    line.matrix.copy(base).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    line.matrixWorldNeedsUpdate = true;
  } else {
    line.scale.setScalar(scale);
  }
}

function hideForeignLinesOnStrips() {
  for (const entry of retained) {
    for (const child of entry.mesh.children) {
      if (!child?.isLineSegments2 || child.userData?.adamDedicatedStripLayer) continue;
      child.visible = false;
    }
  }
}

function updateReadout() {
  if (!countReadout) return;
  const sample = retained.slice(0, 4).map(entry => entry.mesh.name || '(unnamed)').join(', ');
  countReadout.textContent = `${retained.length} strip meshes · ${innerGlowLines.length} glow layers` +
    (sample ? ` · e.g. ${sample}` : '');
}

function installUI() {
  if (uiInstalled) return;
  const dotHeading = [...document.querySelectorAll('#panel > h2')]
    .find(h => h.textContent.trim() === 'Isometric dots');
  if (!dotHeading) return;

  const heading = document.createElement('h2');
  heading.textContent = 'Strip edges & glow';

  countReadout = document.createElement('div');
  countReadout.className = 'scroll-hint';
  updateReadout();

  const host = document.createElement('div');
  host.id = 'stripGlowCtls';
  const toggles = document.createElement('div');
  toggles.className = 'row tog';

  const edgeToggle = document.createElement('button');
  edgeToggle.textContent = 'Strip edges';
  edgeToggle.classList.add('on');
  edgeToggle.onclick = () => {
    style.edgesVisible = !style.edgesVisible;
    edgeToggle.classList.toggle('on', style.edgesVisible);
  };

  const glowToggle = document.createElement('button');
  glowToggle.textContent = 'Strip glow';
  glowToggle.classList.add('on');
  glowToggle.onclick = () => {
    style.glowVisible = !style.glowVisible;
    glowToggle.classList.toggle('on', style.glowVisible);
  };
  toggles.append(edgeToggle, glowToggle);

  function addColor(key, label) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl color';
    wrap.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = style[key];
    input.oninput = () => { style[key] = input.value; };
    wrap.appendChild(input);
    host.appendChild(wrap);
  }

  function addRange(key, label, min, max, step) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl';
    const labelEl = document.createElement('label');
    const value = document.createElement('span');
    value.dataset.v = '';
    labelEl.append(document.createTextNode(label), value);
    const input = document.createElement('input');
    Object.assign(input, { type:'range', min, max, step, value:style[key] });
    const syncValue = () => {
      const v = Number(style[key]);
      value.textContent = Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0);
    };
    input.oninput = () => {
      style[key] = Number(input.value);
      syncValue();
    };
    wrap.append(labelEl, input);
    host.appendChild(wrap);
    syncValue();
  }

  addColor('edgeColor', 'Strip edge colour (RGB)');
  addRange('edgeOpacity', 'Strip edge opacity', 0, 1, 0.01);
  addRange('edgeWidth', 'Strip edge width (px)', 0.25, 5, 0.05);
  addRange('edgeAngle', 'Strip edge angle °', 1, 60, 1);
  addColor('glowColor', 'Strip glow colour (RGB)');
  addRange('glowOpacity', 'Strip inner glow opacity', 0, 1, 0.01);
  addRange('glowWidth', 'Strip inner glow width (px)', 1, 25, 0.1);
  addRange('haloOpacity', 'Strip outer halo opacity', 0, 1, 0.01);
  addRange('haloWidth', 'Strip outer halo width (px)', 1, 45, 0.25);
  addRange('expansion', 'Strip glow expansion', 0, 0.03, 0.0005);

  const copy = document.createElement('button');
  copy.className = 'btn ghost';
  copy.textContent = 'Copy STRIP_STYLE';
  copy.onclick = async () => {
    const out = `const STRIP_STYLE = ${JSON.stringify(style, null, 2)};`;
    try { await navigator.clipboard.writeText(out); }
    catch { console.info(out); }
  };
  host.appendChild(copy);

  dotHeading.before(heading, countReadout, toggles, host);
  uiInstalled = true;
}

let fallbackDiscoveryDone = false;
function fallbackDiscover(scene) {
  if (fallbackDiscoveryDone) return;
  fallbackDiscoveryDone = true;
  const before = retained.length;
  captureStrips(scene, 'first-render fallback');
  if (retained.length !== before) builtAngle = null;
}

function sync(scene) {
  installUI();
  fallbackDiscover(scene);
  if (!captureDone) return;
  if (builtAngle !== style.edgeAngle || (!edgeLines.length && retained.length)) rebuild();

  hideForeignLinesOnStrips();

  edgeMaterial.color.set(style.edgeColor);
  edgeMaterial.opacity = THREE.MathUtils.clamp(style.edgeOpacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.01, style.edgeWidth);

  innerGlowMaterial.color.set(style.glowColor);
  innerGlowMaterial.opacity = THREE.MathUtils.clamp(style.glowOpacity, 0, 1);
  innerGlowMaterial.linewidth = Math.max(0.1, style.glowWidth);

  outerGlowMaterial.color.set(style.glowColor);
  outerGlowMaterial.opacity = THREE.MathUtils.clamp(style.haloOpacity, 0, 1);
  outerGlowMaterial.linewidth = Math.max(0.1, style.haloWidth);

  const size = canvasSize();
  edgeMaterial.resolution.set(size.width, size.height);
  innerGlowMaterial.resolution.set(size.width, size.height);
  outerGlowMaterial.resolution.set(size.width, size.height);

  for (const line of outerGlowLines) {
    line.visible = style.glowVisible;
    applyExpansion(line, style.expansion, 2.0);
  }
  for (const line of innerGlowLines) {
    line.visible = style.glowVisible;
    applyExpansion(line, style.expansion, 1.15);
  }
  for (const line of edgeLines) line.visible = style.edgesVisible;
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_DEDICATED_STRIP_STYLE = style;
window.__ADAM_DEDICATED_STRIPS = () => retained;
window.__ADAM_DEDICATED_STRIP_LINES = () => ({ edgeLines, innerGlowLines, outerGlowLines });
