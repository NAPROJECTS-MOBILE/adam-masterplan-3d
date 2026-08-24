import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM MASTERPLAN — WEBFLOW V1.5 PREVIEW 2
  ----------------------------------------
  Extends the previous V1.5 preview without touching approved production V1.4.

  This revision:
  - replaces the desktop + mobile camera arrays with the supplied 5-frame sets
  - restores the accepted calibrator path-ribbon edge + dual glow treatment
  - keeps the committed M2-split GLB / Material 2 implementation from preview 1
  - keeps the base-scale hook, single draw loop and adaptive DPR from preview 1
*/

await import('./adam-masterplan-v1.5-preview.js?v=c3de4c1400092453c86e58cf4467f42f29077420');

const DESKTOP_KEYFRAMES = [
  { scrollPct: 0,   azimuth: 22, elevation: 27, zoom: 0.04, panX: -0.46, panZ: -0.08, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 25,  azimuth: 38, elevation: 27, zoom: 0.08, panX: -0.46, panZ: -0.08, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 50,  azimuth: 51, elevation: 28, zoom: 0.08, panX: -0.19, panZ: 0.17,  motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 75,  azimuth: 51, elevation: 28, zoom: 0.08, panX: 0.12,  panZ: 0.27,  motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 100, azimuth: 44, elevation: 28, zoom: 0.08, panX: 0.48,  panZ: 0.35,  motionProgress: 0.000, ease: 'easeInOut' }
];

const MOBILE_KEYFRAMES = [
  { scrollPct: 0,   azimuth: 29, elevation: 32, zoom: 0.02, panX: -0.44, panZ: 0.00, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 25,  azimuth: 37, elevation: 34, zoom: 0.06, panX: -0.44, panZ: 0.00, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 50,  azimuth: 14, elevation: 37, zoom: 0.05, panX: -0.19, panZ: 0.27, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 75,  azimuth: 29, elevation: 36, zoom: 0.08, panX: 0.11,  panZ: 0.27, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 100, azimuth: 29, elevation: 37, zoom: 0.08, panX: 0.48,  panZ: 0.31, motionProgress: 0.000, ease: 'easeInOut' }
];

// Shared global STYLE is unchanged from the supplied preview-1 values.
const STYLE = {
  background:'#ffffff', face:'#ffffff', faceTint:0.7, faceLift:0.5,
  faceOpacity:0.94, faceRoughness:0.97, faceMetalness:0,
  slab:'#ffffff', slabOpacity:0.14, slabRoughness:1,
  edge:'#242424', edgeOpacity:0.15, edgeWidth:1, edgeAngle:30,
  glow:'#b9e222', glowOpacity:0.06, glowWidth:7, glowStrength:0.3,
  glowExpansion:0, dotColor:'#141414', dotDensity:20.45,
  dotSize:0.0275, dotEdgeSoftness:0.012, dotSkew:0.5,
  dotFadedOpacity:0.05, dotActiveOpacity:0.34, rippleSpeed:-1.25,
  rippleFrequency:0.35, rippleWidth:0.3, rippleSoftness:0.08,
  rippleOriginX:0, rippleOriginZ:0, hemisphere:0.6, key:1.3,
  rim:0.35, exposure:0.85, keyTint:'#ffffff'
};

// Exact accepted strip appearance from the working calibrator.
const STRIP_STYLE = {
  edgeColor:'#242424',
  edgeOpacity:0.14,
  edgeWidth:1.0,
  glowColor:'#86bf40',
  glowOpacity:0.076,
  glowWidth:1.96,
  haloOpacity:0.030,
  haloWidth:3.50,
  edgeAngle:10
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

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
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
    return null;
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

function makeLineMaterial({ depthBias = false } = {}) {
  const material = new LineMaterial({
    transparent:true,
    depthTest:true,
    depthWrite:false,
    blending:THREE.NormalBlending
  });
  material.toneMapped = false;
  if (depthBias) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -4;
  }
  return material;
}

function installStripRails(api) {
  if (!api?.model || api.__stripRailsInstalled) return false;
  api.__stripRailsInstalled = true;

  const edgeMaterial = makeLineMaterial();
  const innerGlowMaterial = makeLineMaterial();
  const outerGlowMaterial = makeLineMaterial();
  const spurInnerGlowMaterial = makeLineMaterial({ depthBias:true });
  const spurOuterGlowMaterial = makeLineMaterial({ depthBias:true });
  const resolutionMaterials = [
    edgeMaterial, innerGlowMaterial, outerGlowMaterial,
    spurInnerGlowMaterial, spurOuterGlowMaterial
  ];

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

  const retained = [];
  api.model.traverse(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const originalPath = pathOf(object);
    const normalRibbon = originalPath.startsWith(PATH_PREFIX);
    const spurFix = SPUR_FIX_PATHS.has(originalPath);
    if (!normalRibbon && !spurFix) return;
    retained.push({ mesh:object, originalPath, spurFix });
  });

  const entries = [];
  for (const retainedEntry of retained) {
    const source = retainedEntry.mesh;
    const geometry = railGeometryForMesh(source, STRIP_STYLE.edgeAngle);
    if (!geometry) continue;

    source.renderOrder = 0;
    eachMaterial(source, material => {
      material.depthTest = true;
      material.needsUpdate = true;
    });

    const outerMat = retainedEntry.spurFix ? spurOuterGlowMaterial : outerGlowMaterial;
    const innerMat = retainedEntry.spurFix ? spurInnerGlowMaterial : innerGlowMaterial;
    const outer = new LineSegments2(geometry, outerMat);
    const inner = new LineSegments2(geometry.clone(), innerMat);
    const edge = new LineSegments2(geometry.clone(), edgeMaterial);

    outer.renderOrder = 2;
    inner.renderOrder = 3;
    edge.renderOrder = 4;

    for (const line of [outer, inner, edge]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamPathRailSource = retainedEntry.originalPath;
      line.frustumCulled = false;
    }

    source.add(outer, inner, edge);

    if (retainedEntry.spurFix) {
      for (const child of source.children) {
        if (!child?.isLineSegments2 || child.userData?.adamPathRailLayer) continue;
        child.visible = false;
      }
    }

    entries.push({ source, outer, inner, edge, originalPath:retainedEntry.originalPath });
  }

  function setResolution() {
    const root = document.querySelector('[data-adam-masterplan-v15-preview]');
    const rect = root?.getBoundingClientRect?.();
    const width = Math.max(1, Math.round(rect?.width || 1));
    const height = Math.max(1, Math.round(rect?.height || 1));
    for (const material of resolutionMaterials) material.resolution.set(width, height);
  }
  setResolution();
  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root && 'ResizeObserver' in window) new ResizeObserver(setResolution).observe(root);

  api.stripStyle = STRIP_STYLE;
  api.stripRails = entries;
  api.stripRailSources = retained;

  console.info('[ADAM V1.5 preview 2] path strip rails installed', {
    sources:retained.length,
    rails:entries.length,
    targetedSpurs:entries.filter(entry => SPUR_FIX_PATHS.has(entry.originalPath)).length,
    style:STRIP_STYLE
  });
  return true;
}

function patchPreview(api) {
  if (!api || api.__preview2Patched) return false;
  api.__preview2Patched = true;

  // Mutate in-place because preview 1's activeKeyframes() closes over these
  // same arrays.
  api.desktopKeyframes.splice(0, api.desktopKeyframes.length, ...DESKTOP_KEYFRAMES);
  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...MOBILE_KEYFRAMES);
  api.style = STYLE;
  api.version = '1.5-preview2';

  installStripRails(api);

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = '1.5-preview2';

  console.info('[ADAM V1.5 preview 2] presets installed', {
    desktopFrames:api.desktopKeyframes.length,
    mobileFrames:api.mobileKeyframes.length,
    stripRails:api.stripRails?.length || 0
  });
  return true;
}

if (!patchPreview(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (patchPreview(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
