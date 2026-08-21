import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM dedicated strip edge + glow
  --------------------------------
  Completely separate from the building edge/glow system.

  Key fixes in this version:
    - strip detection is orientation-invariant: it uses LOCAL geometry extents,
      not world Y, so rotated/re-parented strip geometry cannot fall out of the
      selector simply because its thin axis is X or Z instead of Y;
    - the strip glow uses normal alpha blending rather than additive blending.
      Additive green over the almost-white site plate can wash toward white and
      look like "no glow". Normal blending visibly tints the light background;
    - every retained strip gets its own edge, inner glow and outer halo, attached
      directly to the exact mesh object captured before spline-motion runs;
    - generic building edge/glow lines attached to a dedicated strip are hidden,
      so this module is the single owner of the strip treatment.
*/

const CLUSTER_PREFIX = 'Scene_1/Main_Group/clusters/';
const STRIP_ASPECT = 4.0;
const PLANAR_RATIO = 0.025;

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
  glowOpacity:0.58,
  glowWidth:8.0,
  haloOpacity:0.22,
  haloWidth:22.0,
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

function localGeometrySize(mesh) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (!bb) return null;
  return bb.getSize(new THREE.Vector3());
}

function stripMetrics(mesh) {
  const size = localGeometrySize(mesh);
  if (!size) return null;
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a,b) => a-b);
  const thin = dims[0];
  const width = Math.max(dims[1], 1e-6);
  const length = Math.max(dims[2], 1e-6);
  return {
    size,
    thin,
    width,
    length,
    planarRatio:thin / width,
    aspect:length / width
  };
}

function isAutoStrip(mesh) {
  const m = stripMetrics(mesh);
  if (!m) return false;
  return m.planarRatio <= PLANAR_RATIO && m.aspect >= STRIP_ASPECT;
}

let retained = [];
let captureDone = false;

function captureStrips(root) {
  const foundExplicit = new Set();
  const picked = [];

  root?.traverse?.(mesh => {
    if (!mesh?.isMesh || mesh.isLineSegments2 || !mesh.geometry?.attributes?.position) return;
    const originalPath = pathOf(mesh);
    if (!originalPath.startsWith(CLUSTER_PREFIX)) return;

    const explicit = EXPLICIT_STRIP_PATHS.has(originalPath);
    const metrics = stripMetrics(mesh);
    const automatic = metrics && metrics.planarRatio <= PLANAR_RATIO && metrics.aspect >= STRIP_ASPECT;
    if (!explicit && !automatic) return;

    if (explicit) foundExplicit.add(originalPath);
    mesh.userData.adamDedicatedStrip = true;
    mesh.userData.adamDedicatedStripOriginalPath = originalPath;
    picked.push({ mesh, originalPath, explicit, metrics });
  });

  retained = picked;
  captureDone = true;

  console.info(
    `[ADAM dedicated strips v2] retained ${retained.length} strip mesh object(s) before motion; ` +
    `explicit ${foundExplicit.size}/${EXPLICIT_STRIP_PATHS.size}`
  );
  if (retained.length) {
    console.table(retained.map(entry => ({
      path:entry.originalPath,
      explicit:entry.explicit,
      aspect:Number(entry.metrics?.aspect?.toFixed?.(2) ?? 0),
      planarRatio:Number(entry.metrics?.planarRatio?.toFixed?.(5) ?? 0)
    })));
  }

  const missing = [...EXPLICIT_STRIP_PATHS].filter(path => !foundExplicit.has(path));
  if (missing.length) console.warn('[ADAM dedicated strips v2] explicit targets not found:', missing);
}

// Installed before glow-bootstrap/app-v2 so object references are captured from
// the pristine GLB before spline-motion can move or re-parent anything.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureDedicatedStrips(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureStrips(gltf?.scene);
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

// Deliberately normal-blended. On the light site plate this produces an actual
// green halo instead of additive blending clipping/washing toward white.
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
let builtAngle = null;
let uiInstalled = false;
let countReadout = null;

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
  addLine(entry, geometry, outerGlowMaterial, outerGlowLines, 'outer-halo', 40, instanceMatrix);
  addLine(entry, geometry, innerGlowMaterial, innerGlowLines, 'inner-glow', 41, instanceMatrix);
  addLine(entry, geometry, edgeMaterial, edgeLines, 'edge', 42, instanceMatrix);
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
  if (countReadout) {
    countReadout.textContent = `${retained.length} strip meshes · ${innerGlowLines.length} glow layers`;
  }
  console.info(
    `[ADAM dedicated strips v2] built ${edgeLines.length} edge + ${innerGlowLines.length} inner glow + ` +
    `${outerGlowLines.length} outer halo layer(s); empty edge geometry=${emptyGeometry}`
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

function installUI() {
  if (uiInstalled) return;
  const dotHeading = [...document.querySelectorAll('#panel > h2')]
    .find(h => h.textContent.trim() === 'Isometric dots');
  if (!dotHeading) return;

  const heading = document.createElement('h2');
  heading.textContent = 'Strip edges & glow';

  countReadout = document.createElement('div');
  countReadout.className = 'scroll-hint';
  countReadout.textContent = `${retained.length} strip meshes captured`;

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

function sync() {
  installUI();
  if (!captureDone) return;
  if (builtAngle !== style.edgeAngle || (!edgeLines.length && retained.length)) rebuild();

  // Generic building passes run before this wrapper in the render chain. Hide
  // their lines on dedicated strips every frame so this dedicated treatment wins.
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

// strip-edge-glow loads before rim-glow-filter. The rim wrapper later calls this
// wrapper as its previous render function, so this sync runs after the generic
// rim sync and gets the final say over dedicated strip visibility/materials.
const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_DEDICATED_STRIP_STYLE = style;
window.__ADAM_DEDICATED_STRIPS = () => retained;
window.__ADAM_DEDICATED_STRIP_LINES = () => ({ edgeLines, innerGlowLines, outerGlowLines });
