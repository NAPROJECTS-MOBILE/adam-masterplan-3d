import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/* ADAM dedicated strip/path edge + glow v4
   ----------------------------------------
   This module is deliberately independent from app-v2's normal building edge
   and glow controls. The controls now live statically in calibrate.html so they
   are always visible even if model capture/render setup fails.

   Targeting mirrors app-v2's flat/path concept, but avoids glow-bootstrap's
   temporary Box3 classification patch by transforming each geometry bounding
   box directly with matrixWorld. Every flat non-base mesh is retained BEFORE
   spline-motion can re-parent it. The five historically troublesome thin meshes
   are unconditional inclusions.
*/

const FLAT_THRESHOLD = 0.100001;
const GIANT_BASE_DIM = 900;

const EXPLICIT_STRIP_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

const defaults = Object.freeze({
  edgeColor:'#242424',
  edgeOpacity:0.28,
  edgeWidth:1.15,
  edgeAngle:30,
  glowColor:'#86bf40',
  glowOpacity:0.52,
  glowWidth:9.0,
  haloOpacity:0.20,
  haloWidth:22.0,
  expansion:0.0025,
  edgesVisible:true,
  glowVisible:true
});

const style = { ...defaults };

const $ = id => document.getElementById(id);
const numberFrom = (id, fallback) => {
  const n = Number($(id)?.value);
  return Number.isFinite(n) ? n : fallback;
};

function syncStyleFromControls() {
  style.edgeColor = $('stripEdgeColor')?.value || style.edgeColor;
  style.edgeOpacity = numberFrom('stripEdgeOpacity', style.edgeOpacity);
  style.edgeWidth = numberFrom('stripEdgeWidth', style.edgeWidth);
  style.edgeAngle = numberFrom('stripEdgeAngle', style.edgeAngle);
  style.glowColor = $('stripGlowColor')?.value || style.glowColor;
  style.glowOpacity = numberFrom('stripGlowOpacity', style.glowOpacity);
  style.glowWidth = numberFrom('stripGlowWidth', style.glowWidth);
  style.haloOpacity = numberFrom('stripHaloOpacity', style.haloOpacity);
  style.haloWidth = numberFrom('stripHaloWidth', style.haloWidth);
  style.expansion = numberFrom('stripGlowExpansion', style.expansion);
}

function bindToggle(id, key) {
  const button = $(id);
  if (!button) return;
  button.classList.toggle('on', !!style[key]);
  button.addEventListener('click', () => {
    style[key] = !style[key];
    button.classList.toggle('on', !!style[key]);
  });
}

function bindUI() {
  bindToggle('tStripEdges', 'edgesVisible');
  bindToggle('tStripGlow', 'glowVisible');

  const copyButton = $('copyStripStyleBtn');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      syncStyleFromControls();
      const text = `const STRIP_STYLE = ${JSON.stringify(style, null, 2)};`;
      try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = 'Copied STRIP_STYLE';
        setTimeout(() => { copyButton.textContent = 'Copy STRIP_STYLE'; }, 1200);
      } catch {
        console.info(text);
      }
    });
  }
}

bindUI();

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function geometryWorldSize(mesh) {
  mesh.geometry.computeBoundingBox();
  const local = mesh.geometry.boundingBox;
  if (!local) return null;
  const worldBox = local.clone().applyMatrix4(mesh.matrixWorld);
  return worldBox.getSize(new THREE.Vector3());
}

function isGiantBase(mesh) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (!bb) return false;
  const local = bb.getSize(new THREE.Vector3());
  const dims = [Math.abs(local.x), Math.abs(local.y), Math.abs(local.z)].sort((a,b) => a-b);
  return dims[1] > GIANT_BASE_DIM && dims[2] > GIANT_BASE_DIM;
}

let retained = [];
let captureDone = false;
let captureSource = 'waiting';

function addRetained(mesh, originalPath, explicit, worldSize) {
  if (retained.some(entry => entry.mesh === mesh)) return;
  mesh.userData.adamDedicatedStrip = true;
  mesh.userData.adamDedicatedStripOriginalPath = originalPath;
  retained.push({ mesh, originalPath, explicit, worldSize:worldSize?.clone?.() || null });
}

function captureFromRoot(root, source) {
  if (!root?.traverse) return;
  root.updateWorldMatrix?.(true, true);
  let scanned = 0;
  let flat = 0;
  let explicitCount = 0;

  root.traverse(mesh => {
    if (!mesh?.isMesh || mesh.isLineSegments2 || !mesh.geometry?.attributes?.position) return;
    scanned++;

    const originalPath = pathOf(mesh);
    const explicit = EXPLICIT_STRIP_PATHS.has(originalPath);
    const worldSize = geometryWorldSize(mesh);
    if (!worldSize) return;

    const isFlat = Math.abs(worldSize.y) < FLAT_THRESHOLD;
    if (isFlat) flat++;
    if (explicit) explicitCount++;

    if (!explicit && (!isFlat || isGiantBase(mesh))) return;
    addRetained(mesh, originalPath, explicit, worldSize);
  });

  captureDone = true;
  captureSource = source;
  updateStatus(`captured ${retained.length} strip/path meshes · ${explicitCount}/5 explicit`);
  console.info(
    `[ADAM dedicated strip/path v4] ${source}: scanned=${scanned}, flat=${flat}, ` +
    `retained=${retained.length}, explicit=${explicitCount}/5`
  );
}

// Capture the untouched GLB before app-v2 / spline-motion re-parent meshes.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureDedicatedStripPaths(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureFromRoot(gltf?.scene, 'pre-motion GLB');
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
let builtAngle = null;
let fallbackDiscoveryDone = false;

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
  addLine(entry, geometry, outerGlowMaterial, outerGlowLines, 'outer-halo', 80, instanceMatrix);
  addLine(entry, geometry, innerGlowMaterial, innerGlowLines, 'inner-glow', 81, instanceMatrix);
  addLine(entry, geometry, edgeMaterial, edgeLines, 'edge', 82, instanceMatrix);
}

function rebuild() {
  clearLines(edgeLines);
  clearLines(innerGlowLines);
  clearLines(outerGlowLines);

  let builtMeshes = 0;
  let emptyGeometry = 0;

  for (const entry of retained) {
    const mesh = entry.mesh;
    if (!mesh?.parent || !mesh.geometry?.attributes?.position) continue;

    const geometry = makeGeometry(mesh, style.edgeAngle);
    if (!geometry) {
      emptyGeometry++;
      continue;
    }

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
    builtMeshes++;
  }

  builtAngle = style.edgeAngle;
  updateStatus(
    `${retained.length} strip/path meshes · ${builtMeshes} built · ${innerGlowLines.length} glow layers`
  );
  console.info(
    `[ADAM dedicated strip/path v4] built meshes=${builtMeshes}, edge=${edgeLines.length}, ` +
    `inner=${innerGlowLines.length}, halo=${outerGlowLines.length}, empty=${emptyGeometry}`
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

function hideForeignLines() {
  for (const entry of retained) {
    for (const child of entry.mesh.children) {
      if (!child?.isLineSegments2 || child.userData?.adamDedicatedStripLayer) continue;
      child.visible = false;
    }
  }
}

function updateStatus(text) {
  const el = $('stripGlowStatus');
  if (el) el.textContent = text;
}

function fallbackDiscover(scene) {
  if (fallbackDiscoveryDone || retained.length) return;
  fallbackDiscoveryDone = true;
  captureFromRoot(scene, 'first-render fallback');
  builtAngle = null;
}

function sync(scene) {
  fallbackDiscover(scene);
  syncStyleFromControls();
  if (!captureDone) return;

  if (builtAngle !== style.edgeAngle || (!edgeLines.length && retained.length)) rebuild();

  // rim-glow-filter runs before this wrapper in the final render chain. Enforce
  // dedicated ownership immediately before the actual WebGL draw.
  hideForeignLines();

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
window.__ADAM_DEDICATED_STRIP_CAPTURE_SOURCE = () => captureSource;
