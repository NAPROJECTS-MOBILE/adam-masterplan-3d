import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM MASTERPLAN — WEBFLOW V1.5 PREVIEW 3
  ----------------------------------------
  Test-only wrapper around preview 1. Captures path-ribbon source meshes from
  the untouched GLB BEFORE the base preview runs its motion/hierarchy setup,
  matching the proven calibrator strategy.
*/

const DESKTOP_KEYFRAMES = [
  { scrollPct:0,   azimuth:22, elevation:27, zoom:0.04, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:38, elevation:27, zoom:0.08, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:51, elevation:28, zoom:0.08, panX:-0.19, panZ:0.17,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:51, elevation:28, zoom:0.08, panX:0.12,  panZ:0.27,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:44, elevation:28, zoom:0.08, panX:0.48,  panZ:0.35,  motionProgress:0.000, ease:'easeInOut' }
];

const MOBILE_KEYFRAMES = [
  { scrollPct:0,   azimuth:29, elevation:32, zoom:0.02, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:37, elevation:34, zoom:0.06, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:14, elevation:37, zoom:0.05, panX:-0.19, panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:29, elevation:36, zoom:0.08, panX:0.11,  panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:29, elevation:37, zoom:0.08, panX:0.48,  panZ:0.31, motionProgress:0.000, ease:'easeInOut' }
];

const STRIP_STYLE = {
  edgeColor:'#242424', edgeOpacity:0.14, edgeWidth:1.0,
  glowColor:'#86bf40', glowOpacity:0.076, glowWidth:1.96,
  haloOpacity:0.030, haloWidth:3.50, edgeAngle:10
};

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const SPUR_FIX_PATHS = new Set([
  'Scene_1/Main_Group/Rectangle',
  'Scene_1/Main_Group/paths/path_13_Clones/Clone_1_1/path_13_1',
  'Scene_1/Main_Group/paths/path_13_Clones/Clone_0_1/path_13',
  'Scene_1/Main_Group/paths/path_11',
  'Scene_1/Main_Group/paths/mesh_125_instance_2',
  'Scene_1/Main_Group/paths/path_2',
  'Scene_1/Main_Group/paths/mesh_134_instance_2',
  'Scene_1/Main_Group/paths/mesh_134_instance_3',
  'Scene_1/Main_Group/paths/path_4',
  'Scene_1/Main_Group/paths/mesh_132_instance_2'
]);

const capturedRails = [];
let railCaptureDone = false;

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) if (node.name) parts.push(node.name);
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
}

function captureRails(root) {
  if (railCaptureDone) return;
  railCaptureDone = true;
  const seen = new Set();
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position || seen.has(object)) return;
    const originalPath = pathOf(object);
    const normalRibbon = originalPath.startsWith(PATH_PREFIX);
    const spurFix = SPUR_FIX_PATHS.has(originalPath);
    if (!normalRibbon && !spurFix) return;
    seen.add(object);
    capturedRails.push({ mesh:object, originalPath, spurFix });
  });
  console.info('[ADAM V1.5 preview 3] pre-motion strip capture', {
    sources:capturedRails.length,
    spurs:capturedRails.filter(entry => entry.spurFix).length
  });
}

// Capture before preview 1 / createSplineMotion touches hierarchy.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamV15Preview3CaptureRails(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureRails(gltf?.scene);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

await import('./adam-masterplan-v1.5-preview.js?v=c3de4c1400092453c86e58cf4467f42f29077420');

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
  if (!pos || pos.count < 2) { edges.dispose(); return null; }
  const lengthAxis = longestAxisOf(mesh);
  const kept = [];
  for (let i = 0; i + 1 < pos.count; i += 2) {
    const dx = pos.getX(i + 1) - pos.getX(i);
    const dy = pos.getY(i + 1) - pos.getY(i);
    const dz = pos.getZ(i + 1) - pos.getZ(i);
    const d = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
    const along = d[lengthAxis];
    const across = Math.max(d[(lengthAxis + 1) % 3], d[(lengthAxis + 2) % 3]);
    if (along < across * 0.65) continue;
    kept.push(
      pos.getX(i), pos.getY(i), pos.getZ(i),
      pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)
    );
  }
  edges.dispose();
  if (!kept.length) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(kept));
  return geometry;
}

function makeLineMaterial({ depthBias=false } = {}) {
  const material = new LineMaterial({
    transparent:true, depthTest:true, depthWrite:false, blending:THREE.NormalBlending
  });
  material.toneMapped = false;
  if (depthBias) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -4;
  }
  return material;
}

function installRails(api) {
  if (!api?.model || api.__preview3RailsInstalled) return false;
  api.__preview3RailsInstalled = true;

  const edgeMaterial = makeLineMaterial();
  const innerGlowMaterial = makeLineMaterial();
  const outerGlowMaterial = makeLineMaterial();
  const spurInnerGlowMaterial = makeLineMaterial({ depthBias:true });
  const spurOuterGlowMaterial = makeLineMaterial({ depthBias:true });

  edgeMaterial.color.set(STRIP_STYLE.edgeColor);
  edgeMaterial.opacity = STRIP_STYLE.edgeOpacity;
  edgeMaterial.linewidth = STRIP_STYLE.edgeWidth;

  for (const material of [innerGlowMaterial, spurInnerGlowMaterial]) {
    material.color.set(STRIP_STYLE.glowColor);
    material.opacity = STRIP_STYLE.glowOpacity;
    material.linewidth = STRIP_STYLE.glowWidth;
  }
  for (const material of [outerGlowMaterial, spurOuterGlowMaterial]) {
    material.color.set(STRIP_STYLE.glowColor);
    material.opacity = STRIP_STYLE.haloOpacity;
    material.linewidth = STRIP_STYLE.haloWidth;
  }

  const entries = [];
  for (const retained of capturedRails) {
    const source = retained.mesh;
    if (!source?.parent || !source.geometry?.attributes?.position) continue;
    const geometry = railGeometryForMesh(source, STRIP_STYLE.edgeAngle);
    if (!geometry) continue;

    source.renderOrder = 0;
    eachMaterial(source, material => {
      material.depthTest = true;
      material.needsUpdate = true;
    });

    const outer = new LineSegments2(
      geometry,
      retained.spurFix ? spurOuterGlowMaterial : outerGlowMaterial
    );
    const inner = new LineSegments2(
      geometry.clone(),
      retained.spurFix ? spurInnerGlowMaterial : innerGlowMaterial
    );
    const edge = new LineSegments2(geometry.clone(), edgeMaterial);

    outer.renderOrder = 2;
    inner.renderOrder = 3;
    edge.renderOrder = 4;
    for (const line of [outer, inner, edge]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamPathRailSource = retained.originalPath;
      line.frustumCulled = false;
    }
    source.add(outer, inner, edge);

    if (retained.spurFix) {
      for (const child of source.children) {
        if (!child?.isLineSegments2 || child.userData?.adamPathRailLayer) continue;
        child.visible = false;
      }
    }

    entries.push({ source, outer, inner, edge, originalPath:retained.originalPath });
  }

  const resolutionMaterials = [
    edgeMaterial, innerGlowMaterial, outerGlowMaterial,
    spurInnerGlowMaterial, spurOuterGlowMaterial
  ];
  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  const setResolution = () => {
    const rect = root?.getBoundingClientRect?.();
    const w = Math.max(1, Math.round(rect?.width || 1));
    const h = Math.max(1, Math.round(rect?.height || 1));
    for (const material of resolutionMaterials) material.resolution.set(w, h);
  };
  setResolution();
  if (root && 'ResizeObserver' in window) new ResizeObserver(setResolution).observe(root);

  api.stripStyle = STRIP_STYLE;
  api.stripRails = entries;
  api.stripRailSources = capturedRails;

  console.info('[ADAM V1.5 preview 3] strip rails installed', {
    captured:capturedRails.length,
    rendered:entries.length,
    targetedSpurs:entries.filter(entry => SPUR_FIX_PATHS.has(entry.originalPath)).length
  });
  return true;
}

function patch(api) {
  if (!api || api.__preview3Patched) return false;
  api.__preview3Patched = true;

  // Preview 1 closes over these arrays; mutate them in place.
  api.desktopKeyframes.splice(0, api.desktopKeyframes.length, ...DESKTOP_KEYFRAMES);
  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...MOBILE_KEYFRAMES);
  installRails(api);
  api.version = '1.5-preview3';

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = '1.5-preview3';

  console.info('[ADAM V1.5 preview 3] supplied presets active', {
    desktopFrames:api.desktopKeyframes.length,
    mobileFrames:api.mobileKeyframes.length,
    stripRails:api.stripRails?.length || 0
  });
  return true;
}

if (!patch(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (patch(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
