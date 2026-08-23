import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createSplineMotion } from '../calibrate/spline-motion.js';
import { FORCE_GLOW_PATHS } from '../calibrate/glow-targets.js';

/*
  ADAM MASTERPLAN — WEBFLOW V1.5 PREVIEW
  --------------------------------------
  Test-only Webflow runtime. Existing approved production V1.4 is untouched.

  Includes:
  - supplied desktop + mobile camera keyframes
  - supplied global STYLE
  - committed M2-split GLB
  - integrated Object Material 2 path + split-material targeting
  - adjustable base footprint through data-base-scale on the embed root
  - one WebGL draw loop, offscreen pause and adaptive mobile DPR
  - accepted Spline motion/ambient driver

  Mobile breakpoint intentionally matches the existing production runtime:
  max-width: 767px.
*/

const MODEL_URL = new URL(
  '../model/adam_landscape_in_use_fullerversion_m2split.glb?v=55bb022db8f5017432b8767fac5f1a9cf6db0375',
  import.meta.url
).href;

const FLAT_THRESHOLD = 0.1;
const MOBILE_QUERY = '(max-width: 767px)';

const DESKTOP_KEYFRAMES = [
  { scrollPct: 0,  azimuth: 38, elevation: 27, zoom: 0.08, panX: -0.46, panZ: -0.08, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 25, azimuth: 51, elevation: 28, zoom: 0.08, panX: -0.19, panZ: 0.17,  motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 50, azimuth: 51, elevation: 28, zoom: 0.08, panX: 0.12,  panZ: 0.27,  motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 75, azimuth: 44, elevation: 28, zoom: 0.08, panX: 0.48,  panZ: 0.35,  motionProgress: 0.000, ease: 'easeInOut' }
];

const MOBILE_KEYFRAMES = [
  { scrollPct: 0,  azimuth: 37, elevation: 34, zoom: 0.06, panX: -0.44, panZ: 0.00, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 25, azimuth: 14, elevation: 37, zoom: 0.05, panX: -0.19, panZ: 0.27, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 50, azimuth: 38, elevation: 36, zoom: 0.09, panX: 0.12,  panZ: 0.27, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 75, azimuth: 29, elevation: 37, zoom: 0.08, panX: 0.48,  panZ: 0.31, motionProgress: 0.000, ease: 'easeInOut' }
];

const STYLE = {
  background: '#ffffff',
  face: '#ffffff',
  faceTint: 0.7,
  faceLift: 0.5,
  faceOpacity: 0.94,
  faceRoughness: 0.97,
  faceMetalness: 0,
  slab: '#ffffff',
  slabOpacity: 0.14,
  slabRoughness: 1,
  edge: '#242424',
  edgeOpacity: 0.15,
  edgeWidth: 1,
  edgeAngle: 30,
  glow: '#b9e222',
  glowOpacity: 0.06,
  glowWidth: 7,
  glowStrength: 0.3,
  glowExpansion: 0,
  dotColor: '#141414',
  dotDensity: 20.45,
  dotSize: 0.0275,
  dotEdgeSoftness: 0.012,
  dotSkew: 0.5,
  dotFadedOpacity: 0.05,
  dotActiveOpacity: 0.34,
  rippleSpeed: -1.25,
  rippleFrequency: 0.35,
  rippleWidth: 0.3,
  rippleSoftness: 0.08,
  rippleOriginX: 0,
  rippleOriginZ: 0,
  hemisphere: 0.6,
  key: 1.3,
  rim: 0.35,
  exposure: 0.85,
  keyTint: '#ffffff'
};

// No separate Material 2 export was supplied with this Webflow test, so keep
// the current calibrator Material 2 defaults. This is deliberately independent
// of the global building STYLE above.
const MATERIAL_2_STYLE = {
  face: '#ebebeb',
  faceTint: 0.70,
  faceLift: 0.15,
  faceOpacity: 0.94,
  faceRoughness: 0.97,
  faceMetalness: 0.0
};

const MATERIAL_2_TARGET_MATERIALS = new Set([
  'ADAM_M2_CL4_ISLAND_A',
  'ADAM_M2_CL4_ISLAND_B',
  'ADAM_M2_GRP2_RECT3_SMALL'
]);

const MATERIAL_2_TARGET_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Group_3/Boolean_4_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa/Group_3/Boolean_3_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1/Boolean_4_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1/Boolean_3_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Boolean_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Boolean_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2/Boolean_4_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2/Boolean_3_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2/Rectangle_11_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group/Rectangle_11',
  'Scene_1/Main_Group/clusters/cluster_3/villa/Group_3/Rectangle_11_3',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1/Rectangle_11_1',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_1',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_4',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_8_instance_10',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_1',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_10',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_5',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_10',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/Rectangle_14',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_2',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_3',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_4',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_5',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_6',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_30_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_31_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_32_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_33_1',
  'Scene_1/Main_Group/clusters/cluster_2/c_building/Rectangle_34_1',
  'Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_10',
  'Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_9',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_3',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_2',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_30',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_31',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_32',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_33',
  'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_34',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_36',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_36_1',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_38',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_39',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_40',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_41',
  'Scene_1/Main_Group/clusters/cluster_1/b5/b5a/Rectangle_42'
]);

const FIVE_NATIVE_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

const STATIC_ROOF_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_6',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_2'
]);

const FORCE_NATIVE_PATHS = new Set([
  ...FORCE_GLOW_PATHS,
  ...STATIC_ROOF_PATHS,
  ...FIVE_NATIVE_PATHS
]);

const NO_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3'
]);

const EASINGS = {
  linear: t => t,
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  swingIn: t => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  swingOut: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  swingInOut: t => {
    const c1 = 1.70158, c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
  }
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

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

function materialArray(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : (mesh.material ? [mesh.material] : []);
}

function edgeGeometryForMesh(mesh, angle, originalPath) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return null;
  }

  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const isB10Prism = !!bb && originalPath.includes('/b10/') && (bb.max.z - bb.min.z) > 10;

  let arr;
  if (isB10Prism) {
    const topZ = bb.max.z;
    const eps = Math.max(1e-4, (bb.max.z - bb.min.z) * 1e-4);
    const kept = [];
    for (let i = 0; i < pos.count; i += 2) {
      const aTop = pos.getZ(i) >= topZ - eps;
      const bTop = pos.getZ(i + 1) >= topZ - eps;
      if (aTop && bTop) continue;
      kept.push(
        pos.getX(i), pos.getY(i), pos.getZ(i),
        pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)
      );
    }
    arr = new Float32Array(kept);
  } else {
    arr = new Float32Array(pos.count * 3);
    arr.set(pos.array);
  }

  edges.dispose();
  if (!arr.length) return null;
  const geo = new LineSegmentsGeometry();
  geo.setPositions(arr);
  return geo;
}

async function init(root) {
  if (root.dataset.adamV15PreviewBooted) return;
  root.dataset.adamV15PreviewBooted = 'true';

  const canvas = root.querySelector('canvas') || root.appendChild(document.createElement('canvas'));
  const track = root.closest('.h-scroll') || document.querySelector('.h-scroll');
  if (!track) {
    console.error('[ADAM V1.5 preview] No .h-scroll element found.');
    return;
  }

  const mobileMedia = matchMedia(MOBILE_QUERY);
  const deviceDpr = Math.max(1, window.devicePixelRatio || 1);
  const mobileMinDpr = Math.min(deviceDpr, 1.35);
  const mobileMaxDpr = Math.min(deviceDpr, 1.75);
  let activeDpr = mobileMedia.matches ? Math.min(deviceDpr, 1.65) : Math.min(deviceDpr, 1.75);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: activeDpr < 1.5,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setPixelRatio(activeDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = STYLE.exposure;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STYLE.background);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, STYLE.hemisphere);
  const keyLight = new THREE.DirectionalLight(STYLE.keyTint, STYLE.key);
  const rimLight = new THREE.DirectionalLight(STYLE.glow, STYLE.rim);
  scene.add(hemi, keyLight, rimLight);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL_URL);
  const model = gltf.scene;

  const strip = [];
  model.traverse(o => { if (o.isCamera || o.isLight) strip.push(o); });
  strip.forEach(o => o.parent?.remove(o));

  const mainGroup = model.getObjectByName('Main_Group');
  let primaryBaseMesh = null;
  if (mainGroup) {
    const baseCandidates = [];
    for (const o of [...mainGroup.children]) {
      if (!o.isMesh || !/^Rectangle(?:_\d+)?$/.test(o.name)) continue;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      if (!bb) continue;
      const ext = bb.getSize(new THREE.Vector3());
      const isLargePlanarBase = ext.z < 1e-5 && ext.x > 1000 && ext.y > 1000;
      if (!isLargePlanarBase) continue;
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      o.matrixWorldNeedsUpdate = true;
      baseCandidates.push(o);
    }
    primaryBaseMesh = baseCandidates[0] || null;
    if (primaryBaseMesh) {
      primaryBaseMesh.position.y -= 5;
      const requestedScale = clamp(Number(root.dataset.baseScale || 1), 0.5, 2.5);
      primaryBaseMesh.scale.x *= requestedScale;
      primaryBaseMesh.scale.y *= requestedScale;
      root.dataset.baseScale = requestedScale.toFixed(2);
      primaryBaseMesh.updateMatrix();
      primaryBaseMesh.matrixWorldNeedsUpdate = true;
    }
    for (const duplicate of baseCandidates.slice(1)) duplicate.removeFromParent();
  }

  model.updateWorldMatrix(true, true);

  const originals = new Map();
  const originalPaths = new Map();
  const material2Meshes = new Set();
  const solids = [];
  const flats = [];
  const contentBox = new THREE.Box3();

  model.traverse(o => {
    if (!o.isMesh) return;
    const path = pathOf(o);
    originalPaths.set(o, path);

    const sourceMats = materialArray(o);
    originals.set(o, sourceMats.map(mat => ({
      color: mat?.color?.clone?.() || new THREE.Color(0xffffff),
      roughness: mat?.roughness ?? 1,
      metalness: mat?.metalness ?? 0,
      opacity: mat?.opacity ?? 1
    })));

    const splitMaterialHit = sourceMats.some(mat => MATERIAL_2_TARGET_MATERIALS.has(mat?.name || ''));
    if (MATERIAL_2_TARGET_PATHS.has(path) || splitMaterialHit) material2Meshes.add(o);

    if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
    else if (o.material) o.material = o.material.clone();

    const b = new THREE.Box3().setFromObject(o);
    const meshSize = b.getSize(new THREE.Vector3());
    const forceNative = FORCE_NATIVE_PATHS.has(path);
    if (meshSize.y >= FLAT_THRESHOLD || forceNative) {
      solids.push(o);
      contentBox.union(b);
    } else {
      flats.push({ mesh: o, footprint: meshSize.x * meshSize.z });
    }
  });

  if (!solids.length || contentBox.isEmpty()) contentBox.setFromObject(model);
  flats.sort((a, b) => b.footprint - a.footprint);
  const slabMesh = primaryBaseMesh || flats[0]?.mesh || null;

  const size = contentBox.getSize(new THREE.Vector3());
  const centre = contentBox.getCenter(new THREE.Vector3());
  const sphere = new THREE.Sphere();
  contentBox.getBoundingSphere(sphere);
  const radius = sphere.radius;

  model.position.sub(centre);
  scene.add(model);
  model.updateWorldMatrix(true, true);

  keyLight.position.set(0.45, 1, 0.55).multiplyScalar(radius);
  rimLight.position.set(-0.7, 0.35, -0.6).multiplyScalar(radius);

  const motion = createSplineMotion(model, { debug: false, unitScale: 1, ambient: true });
  motion.setProgress?.(0);
  model.updateWorldMatrix(true, true);

  const faceTint = new THREE.Color(STYLE.face);
  for (const mesh of solids) {
    const snaps = originals.get(mesh) || [];
    eachMaterial(mesh, (mat, index) => {
      const original = snaps[index] || snaps[0];
      if (!original) return;
      if (mat.color) mat.color.copy(original.color).lerp(faceTint, STYLE.faceTint);
      if (mat.emissive && mat.color) {
        mat.emissive.copy(mat.color);
        mat.emissiveIntensity = Math.max(0, STYLE.faceLift);
      }
      if ('roughness' in mat) mat.roughness = STYLE.faceRoughness;
      if ('metalness' in mat) mat.metalness = STYLE.faceMetalness;
      mat.transparent = true;
      mat.opacity = STYLE.faceOpacity;
      mat.depthWrite = true;
      mat.depthTest = true;
      mat.needsUpdate = true;
    });
  }

  // Object Material 2 is applied after the global building pass so it is the
  // final material authority for every selected mesh.
  const m2Tint = new THREE.Color(MATERIAL_2_STYLE.face);
  for (const mesh of material2Meshes) {
    const snaps = originals.get(mesh) || [];
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(m => m.clone());
    else if (mesh.material) mesh.material = mesh.material.clone();

    eachMaterial(mesh, (mat, index) => {
      const original = snaps[index] || snaps[0];
      if (!original) return;
      mat.name = 'Object Material 2 — Webflow preview';
      mat.userData = { ...(mat.userData || {}), adamObjectMaterial: 2, adamMaterial2: true };
      if (mat.color) mat.color.copy(original.color).lerp(m2Tint, MATERIAL_2_STYLE.faceTint);
      if (mat.emissive && mat.color) {
        mat.emissive.copy(mat.color);
        mat.emissiveIntensity = Math.max(0, MATERIAL_2_STYLE.faceLift);
      }
      if ('roughness' in mat) mat.roughness = MATERIAL_2_STYLE.faceRoughness;
      if ('metalness' in mat) mat.metalness = MATERIAL_2_STYLE.faceMetalness;
      mat.transparent = true;
      mat.opacity = MATERIAL_2_STYLE.faceOpacity;
      mat.depthWrite = true;
      mat.depthTest = true;
      mat.needsUpdate = true;
    });
  }

  if (slabMesh) {
    slabMesh.renderOrder = -20;
    eachMaterial(slabMesh, mat => {
      if (mat.color) mat.color.set(STYLE.slab);
      if ('roughness' in mat) mat.roughness = STYLE.slabRoughness;
      mat.transparent = true;
      mat.opacity = STYLE.slabOpacity;
      mat.depthTest = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    });
  }

  const edgeMat = new LineMaterial({
    color: STYLE.edge,
    opacity: STYLE.edgeOpacity,
    linewidth: STYLE.edgeWidth,
    transparent: true,
    depthTest: true
  });
  const glowMat = new LineMaterial({
    color: STYLE.glow,
    opacity: STYLE.glowOpacity * STYLE.glowStrength,
    linewidth: STYLE.glowWidth,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  edgeMat.toneMapped = false;
  glowMat.toneMapped = false;

  const edgeLayers = [];
  const glowLayers = [];
  const nativeSet = new Set(solids);
  const im = new THREE.Matrix4();

  function attachLine(mesh, geometry, material, renderOrder, instanceMatrix, bucket) {
    const line = new LineSegments2(geometry.clone(), material);
    line.frustumCulled = false;
    line.renderOrder = renderOrder;
    if (instanceMatrix) {
      line.matrixAutoUpdate = false;
      line.matrix.copy(instanceMatrix);
    }
    mesh.add(line);
    bucket.push(line);
  }

  function addNativeEdgeGlow(mesh) {
    const path = originalPaths.get(mesh) || '';
    const geo = edgeGeometryForMesh(mesh, STYLE.edgeAngle, path);
    if (!geo) return;
    const allowGlow = !NO_GLOW_PATHS.has(path);

    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, im);
        attachLine(mesh, geo, edgeMat, 3, im.clone(), edgeLayers);
        if (allowGlow) attachLine(mesh, geo, glowMat, 2, im.clone(), glowLayers);
      }
    } else {
      attachLine(mesh, geo, edgeMat, 3, null, edgeLayers);
      if (allowGlow) attachLine(mesh, geo, glowMat, 2, null, glowLayers);
    }
    geo.dispose();
  }

  for (const mesh of solids) addNativeEdgeGlow(mesh);

  model.traverse(mesh => {
    if (!mesh.isMesh || nativeSet.has(mesh) || !mesh.geometry?.attributes?.position) return;
    const path = originalPaths.get(mesh) || '';
    if (!path.includes('Scene_1/Main_Group/clusters/') || NO_GLOW_PATHS.has(path)) return;
    const geo = edgeGeometryForMesh(mesh, 30, path);
    if (!geo) return;
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, im);
        attachLine(mesh, geo, glowMat, 2, im.clone(), glowLayers);
      }
    } else {
      attachLine(mesh, geo, glowMat, 2, null, glowLayers);
    }
    geo.dispose();
  });

  const expansion = 1 + STYLE.glowExpansion;
  for (const line of glowLayers) if (line.matrixAutoUpdate) line.scale.setScalar(expansion);

  const dotUniforms = {
    uTime: { value: 0 },
    uDotColor: { value: new THREE.Color(STYLE.dotColor) },
    uSpacing: { value: 2 / Math.max(0.05, STYLE.dotDensity) },
    uDotSize: { value: STYLE.dotSize },
    uEdgeSoft: { value: STYLE.dotEdgeSoftness },
    uSkew: { value: STYLE.dotSkew },
    uFadedOpacity: { value: STYLE.dotFadedOpacity },
    uActiveOpacity: { value: STYLE.dotActiveOpacity },
    uRippleSpeed: { value: STYLE.rippleSpeed },
    uRippleFrequency: { value: STYLE.rippleFrequency },
    uRippleWidth: { value: STYLE.rippleWidth },
    uRippleSoft: { value: STYLE.rippleSoftness },
    uRippleOrigin: { value: new THREE.Vector2(STYLE.rippleOriginX, STYLE.rippleOriginZ) },
    uAnimate: { value: 1 }
  };

  const dotMaterial = new THREE.ShaderMaterial({
    uniforms: dotUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: 'varying vec3 vWorld;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
    fragmentShader: 'uniform float uTime,uSpacing,uDotSize,uEdgeSoft,uSkew,uFadedOpacity,uActiveOpacity,uRippleSpeed,uRippleFrequency,uRippleWidth,uRippleSoft,uAnimate;uniform vec2 uRippleOrigin;uniform vec3 uDotColor;varying vec3 vWorld;void main(){vec2 p=vWorld.xz;vec2 iso=vec2(p.x+p.y*uSkew,p.y*0.8660254);vec2 cell=fract(iso/uSpacing)-0.5;float d=length(cell);float dotMask=1.0-smoothstep(uDotSize,uDotSize+max(uEdgeSoft,0.0005),d);if(dotMask<0.001)discard;float dist=length(p-uRippleOrigin);float wave=0.5+0.5*sin(dist*uRippleFrequency-uTime*uRippleSpeed);float low=clamp(0.5-uRippleWidth*0.5,0.0,1.0);float high=clamp(0.5+uRippleWidth*0.5,0.0,1.0);float ripple=smoothstep(low-uRippleSoft,low+uRippleSoft,wave)*(1.0-smoothstep(high-uRippleSoft,high+uRippleSoft,wave));ripple=mix(0.0,ripple,uAnimate);float alpha=mix(uFadedOpacity,uActiveOpacity,ripple)*dotMask;if(alpha<0.001)discard;gl_FragColor=vec4(uDotColor,alpha);}'
  });

  let dotOverlay = null;
  if (slabMesh) {
    slabMesh.updateWorldMatrix(true, false);
    dotOverlay = new THREE.Mesh(slabMesh.geometry, dotMaterial);
    dotOverlay.matrixAutoUpdate = false;
    dotOverlay.matrix.copy(slabMesh.matrixWorld);
    dotOverlay.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, 0.004, 0));
    dotOverlay.frustumCulled = false;
    dotOverlay.renderOrder = 1;
    scene.add(dotOverlay);
  }

  let width = 0;
  let height = 0;
  let fitDist = radius * 3;
  const look = new THREE.Vector3();
  let running = false;
  let onscreen = true;
  let rafId = 0;
  let lastNow = 0;
  let frameSamples = [];
  let framesSinceDprChange = 0;

  function activeKeyframes() {
    return mobileMedia.matches ? MOBILE_KEYFRAMES : DESKTOP_KEYFRAMES;
  }

  function applyDpr(next) {
    const clamped = mobileMedia.matches
      ? Math.max(mobileMinDpr, Math.min(mobileMaxDpr, next))
      : Math.min(deviceDpr, 1.75);
    if (Math.abs(clamped - activeDpr) < 0.01) return;
    activeDpr = Number(clamped.toFixed(2));
    renderer.setPixelRatio(activeDpr);
    if (width && height) renderer.setSize(width, height, false);
    root.dataset.adamDpr = activeDpr.toFixed(2);
    frameSamples.length = 0;
    framesSinceDprChange = 0;
  }

  function computeFit() {
    const vf = camera.fov * Math.PI / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    fitDist = Math.max(radius / Math.sin(vf / 2), radius / Math.sin(hf / 2));
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width));
    const nextH = Math.max(1, Math.round(rect.height));
    if (nextW === width && nextH === height) return;
    width = nextW;
    height = nextH;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = height > width ? 50 : 38;
    camera.updateProjectionMatrix();
    computeFit();
    edgeMat.resolution.set(width, height);
    glowMat.resolution.set(width, height);
  }

  function readScrollPct() {
    const rect = track.getBoundingClientRect();
    const travel = rect.height - window.innerHeight;
    if (travel <= 0) return rect.top <= 0 ? 100 : 0;
    return clamp((-rect.top / travel) * 100, 0, 100);
  }

  function poseAtPct(pct) {
    const frames = activeKeyframes();
    const p = clamp(pct, 0, 100);
    let a = frames[0];
    let b = frames[0];
    let t = 0;

    if (p <= frames[0].scrollPct) {
      a = b = frames[0];
    } else if (p >= frames[frames.length - 1].scrollPct) {
      a = b = frames[frames.length - 1];
    } else {
      let i = 0;
      while (i < frames.length - 1 && p > frames[i + 1].scrollPct) i++;
      a = frames[i];
      b = frames[i + 1];
      const span = Math.max(0.0001, b.scrollPct - a.scrollPct);
      const raw = clamp((p - a.scrollPct) / span, 0, 1);
      t = (EASINGS[a.ease] || EASINGS.easeInOut)(raw);
    }

    const azimuth = lerp(a.azimuth, b.azimuth, t) * Math.PI / 180;
    const elevation = lerp(a.elevation, b.elevation, t) * Math.PI / 180;
    const zoom = lerp(a.zoom, b.zoom, t);
    const panX = lerp(a.panX, b.panX, t);
    const panZ = lerp(a.panZ, b.panZ, t);
    const motionProgress = lerp(a.motionProgress ?? 0, b.motionProgress ?? 0, t);

    look.set(panX * size.x, 0, panZ * size.z);
    const d = fitDist * zoom;
    camera.position.set(
      look.x + Math.sin(azimuth) * Math.cos(elevation) * d,
      look.y + Math.sin(elevation) * d,
      look.z + Math.cos(azimuth) * Math.cos(elevation) * d
    );
    camera.lookAt(look);
    motion.setProgress?.(motionProgress);
    root.dataset.scrollPct = p.toFixed(2);
  }

  function updateAdaptiveDpr(now) {
    if (!mobileMedia.matches || !lastNow) return;
    const dt = now - lastNow;
    if (dt > 4 && dt < 80) frameSamples.push(dt);
    if (frameSamples.length > 90) frameSamples.shift();
    framesSinceDprChange++;
    if (frameSamples.length < 60 || framesSinceDprChange < 120) return;

    const avg = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
    if (avg > 20.5 && activeDpr > mobileMinDpr + 0.02) {
      applyDpr(activeDpr - 0.10);
    } else if (avg < 16.9 && activeDpr < mobileMaxDpr - 0.02 && framesSinceDprChange > 240) {
      applyDpr(activeDpr + 0.05);
    }
  }

  function updateDotOverlayMatrix() {
    if (!slabMesh || !dotOverlay) return;
    slabMesh.updateWorldMatrix(true, false);
    dotOverlay.matrix.copy(slabMesh.matrixWorld);
    dotOverlay.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, 0.004, 0));
    dotOverlay.matrixWorldNeedsUpdate = true;
  }

  function setBaseScale(value) {
    if (!primaryBaseMesh) return;
    const previous = Number(root.dataset.baseScale || 1) || 1;
    const next = clamp(Number(value) || 1, 0.5, 2.5);
    const ratio = next / previous;
    primaryBaseMesh.scale.x *= ratio;
    primaryBaseMesh.scale.y *= ratio;
    primaryBaseMesh.updateMatrix();
    primaryBaseMesh.matrixWorldNeedsUpdate = true;
    root.dataset.baseScale = next.toFixed(2);
    model.updateMatrixWorld(true);
    updateDotOverlayMatrix();
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    updateAdaptiveDpr(now);
    resize();

    const pct = readScrollPct();
    motion.setAmbientTime?.(now * 0.001);
    poseAtPct(pct);
    model.updateMatrixWorld(true);
    dotUniforms.uTime.value = now * 0.001;
    renderer.render(scene, camera);

    lastNow = now;
    if (!root.hasAttribute('data-ready')) root.setAttribute('data-ready', '');
  }

  function start() {
    if (running || !onscreen || document.hidden) return;
    running = true;
    lastNow = 0;
    frameSamples.length = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    lastNow = 0;
    frameSamples.length = 0;
  }

  resize();
  root.dataset.adamVersion = '1.5-preview';
  root.dataset.adamDpr = activeDpr.toFixed(2);
  root.dataset.material2Meshes = String(material2Meshes.size);

  const intersectionTarget = track || root;
  new IntersectionObserver(entries => {
    onscreen = entries.some(entry => entry.isIntersecting);
    if (onscreen) start();
    else stop();
  }, { rootMargin: '25% 0px' }).observe(intersectionTarget);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  mobileMedia.addEventListener?.('change', () => {
    if (mobileMedia.matches) applyDpr(Math.min(deviceDpr, 1.65));
    else applyDpr(Math.min(deviceDpr, 1.75));
  });

  window.__adamMasterplanV15Preview = {
    version: '1.5-preview',
    desktopKeyframes: DESKTOP_KEYFRAMES,
    mobileKeyframes: MOBILE_KEYFRAMES,
    style: STYLE,
    material2Style: MATERIAL_2_STYLE,
    material2Meshes,
    model,
    camera,
    scene,
    renderer,
    track,
    motion,
    progress: readScrollPct,
    setBaseScale,
    performance: {
      start,
      stop,
      get dpr() { return activeDpr; },
      setDpr: value => applyDpr(Number(value))
    }
  };

  console.info('[ADAM V1.5 preview] ready', {
    mobile: mobileMedia.matches,
    material2Meshes: material2Meshes.size,
    baseScale: root.dataset.baseScale,
    model: MODEL_URL
  });

  start();
}

function lazyInit(root) {
  const track = root.closest('.h-scroll') || document.querySelector('.h-scroll');
  if (!track) {
    init(root).catch(error => console.error('[ADAM V1.5 preview] boot failed:', error));
    return;
  }

  let started = false;
  const observer = new IntersectionObserver(entries => {
    if (started || !entries.some(entry => entry.isIntersecting)) return;
    started = true;
    observer.disconnect();
    init(root).catch(error => console.error('[ADAM V1.5 preview] boot failed:', error));
  }, { rootMargin: '100% 0px' });
  observer.observe(track);
}

for (const root of document.querySelectorAll('[data-adam-masterplan-v15-preview]')) {
  lazyInit(root);
}
