import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createSplineMotion } from '../calibrate/spline-motion.js';
import { FORCE_GLOW_PATHS } from '../calibrate/glow-targets.js';

/*
  ADAM MASTERPLAN — PRODUCTION V1
  --------------------------------
  - Reads real progress from the nearest .h-scroll element.
  - Uses the fuller 1.31 MB GLB.
  - Uses the calibrated 5-keyframe camera timeline supplied 20 Aug 2026.
  - Applies the calibrated GLOBAL STYLE supplied 20 Aug 2026.
  - Keeps the native face / edge / glow treatment, including the five thin
    architectural meshes that were explicitly promoted into the native pass.
  - Lazy boots near the .h-scroll section and renders only when scroll/size/
    visibility changes. No calibration UI and no permanent render loop.
  - Shadows are intentionally OFF in V1; they can be added as a separate pass.
*/

const MODEL_URL = new URL('../model/adam_landscape_in_use_fullerversion.glb', import.meta.url).href;
const FLAT_THRESHOLD = 0.1;

const KEYFRAMES = [
  { scrollPct: 0, azimuth: 25, elevation: 27, zoom: 0.04, panX: -0.46, panZ: -0.08, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 25, azimuth: 32, elevation: 30, zoom: 0.06, panX: -0.46, panZ: -0.06, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 50, azimuth: 50, elevation: 26, zoom: 0.08, panX: -0.19, panZ: 0.09, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 75, azimuth: 54, elevation: 29, zoom: 0.09, panX: 0.11, panZ: 0.21, motionProgress: 0.000, ease: 'easeInOut' },
  { scrollPct: 100, azimuth: 54, elevation: 29, zoom: 0.09, panX: 0.48, panZ: 0.21, motionProgress: 0.000, ease: 'easeInOut' }
];

const STYLE = {
  background: '#f7f7f2',
  face: '#ebebeb',
  faceTint: 1,
  faceLift: 0.35,
  faceOpacity: 0.78,
  faceRoughness: 1,
  faceMetalness: 0,
  slab: '#ffffff',
  slabOpacity: 0.21,
  slabRoughness: 1,
  edge: '#242424',
  edgeOpacity: 0.15,
  edgeWidth: 1.05,
  edgeAngle: 30,
  glow: '#86bf40',
  glowOpacity: 0.08,
  glowWidth: 8.4,
  glowStrength: 0.65,
  glowExpansion: 0.0015,
  dotColor: '#141414',
  dotDensity: 17.05,
  dotSize: 0.0275,
  dotEdgeSoftness: 0.012,
  dotSkew: 0.5,
  dotFadedOpacity: 0.06,
  dotActiveOpacity: 0.39,
  rippleSpeed: 1.2,
  rippleFrequency: 0.35,
  rippleWidth: 0.3,
  rippleSoftness: 0.08,
  rippleOriginX: 0,
  rippleOriginZ: 0,
  hemisphere: 0.6,
  key: 1.4,
  rim: 0.5,
  exposure: 0.85,
  keyTint: '#fff6e8'
};

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

// Preserve the four legacy villa glow exclusions only. The five promoted V1
// blocks are intentionally NOT excluded: they receive normal native glow.
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

function edgeGeometryForMesh(mesh, angle, originalPath) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return null;
  }

  // Match the calibrator's existing b10 edge treatment.
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
  if (root.dataset.adamV1Booted) return;
  root.dataset.adamV1Booted = 'true';

  const canvas = root.querySelector('canvas') || root.appendChild(document.createElement('canvas'));
  const track = root.closest('.h-scroll') || document.querySelector('.h-scroll');
  if (!track) {
    console.error('[ADAM V1] No .h-scroll element found. Place the embed inside .h-scroll or ensure one exists on the page.');
    return;
  }

  const isMobile = matchMedia('(max-width: 767px)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.4 : 1.75);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: dpr < 1.5,
    powerPreference: 'high-performance',
    stencil: false
  });
  renderer.setPixelRatio(dpr);
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

  // Match calibrator site-base correction before classification.
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
      primaryBaseMesh.updateMatrix();
      primaryBaseMesh.matrixWorldNeedsUpdate = true;
    }
    for (const duplicate of baseCandidates.slice(1)) duplicate.removeFromParent();
  }

  model.updateWorldMatrix(true, true);

  const originals = new Map();
  const originalPaths = new Map();
  const solids = [];
  const flats = [];
  const contentBox = new THREE.Box3();

  model.traverse(o => {
    if (!o.isMesh) return;
    const path = pathOf(o);
    originalPaths.set(o, path);

    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    originals.set(o, {
      color: mat?.color?.clone?.() || new THREE.Color(0xffffff),
      roughness: mat?.roughness ?? 1,
      metalness: mat?.metalness ?? 0
    });
    if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
    else if (o.material) o.material = o.material.clone();

    const b = new THREE.Box3().setFromObject(o);
    const size = b.getSize(new THREE.Vector3());
    const forceNative = FORCE_NATIVE_PATHS.has(path);
    if (size.y >= FLAT_THRESHOLD || forceNative) {
      solids.push(o);
      contentBox.union(b);
    } else {
      flats.push({ mesh: o, footprint: size.x * size.z });
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

  // Reuse the accepted motion wrapper so the static roof-bar correction and
  // duplicate removal remain identical to the calibrator. Ambient motion is
  // disabled in production V1 so the scene can truly stop rendering when idle.
  const motion = createSplineMotion(model, { debug: false, unitScale: 1, ambient: false });
  motion.setProgress?.(0);
  model.updateWorldMatrix(true, true);

  // Face material: native solids include the five promoted thin meshes.
  const tint = new THREE.Color(STYLE.face);
  for (const mesh of solids) {
    const original = originals.get(mesh);
    eachMaterial(mesh, mat => {
      if (mat.color) mat.color.copy(original.color).lerp(tint, STYLE.faceTint);
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

  // Match the calibrator's supplemental rim-glow policy for thin cluster
  // architecture that is not part of the native solid edge pass.
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
  for (const line of glowLayers) {
    if (line.matrixAutoUpdate) line.scale.setScalar(expansion);
  }

  // Isometric dot overlay uses the same slab geometry as the calibrator. To
  // avoid a permanent animation loop, uTime is driven by .h-scroll progress.
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

  function computeFit() {
    const vf = camera.fov * Math.PI / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    fitDist = Math.max(radius / Math.sin(vf / 2), radius / Math.sin(hf / 2));
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width));
    const nextH = Math.max(1, Math.round(rect.height));
    if (nextW === width && nextH === height) return false;
    width = nextW;
    height = nextH;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = height > width ? 50 : 38;
    camera.updateProjectionMatrix();
    computeFit();
    edgeMat.resolution.set(width, height);
    glowMat.resolution.set(width, height);
    return true;
  }

  function readScrollPct() {
    const rect = track.getBoundingClientRect();
    const travel = rect.height - window.innerHeight;
    if (travel <= 0) return rect.top <= 0 ? 100 : 0;
    return clamp((-rect.top / travel) * 100, 0, 100);
  }

  function poseAtPct(pct) {
    const p = clamp(pct, 0, 100);
    let a = KEYFRAMES[0];
    let b = KEYFRAMES[0];
    let t = 0;

    if (p <= KEYFRAMES[0].scrollPct) {
      a = b = KEYFRAMES[0];
    } else if (p >= KEYFRAMES[KEYFRAMES.length - 1].scrollPct) {
      a = b = KEYFRAMES[KEYFRAMES.length - 1];
    } else {
      let i = 0;
      while (i < KEYFRAMES.length - 1 && p > KEYFRAMES[i + 1].scrollPct) i++;
      a = KEYFRAMES[i];
      b = KEYFRAMES[i + 1];
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

    // Scroll-driven ripple: visually alive while scrolling, zero idle render cost.
    dotUniforms.uTime.value = p * 0.08;
    root.dataset.scrollPct = p.toFixed(2);
  }

  let visible = true;
  let frameQueued = false;

  function renderNow() {
    frameQueued = false;
    if (!visible || document.hidden) return;
    resize();
    const pct = readScrollPct();
    poseAtPct(pct);
    model.updateMatrixWorld(true, true);
    renderer.render(scene, camera);
  }

  function scheduleRender() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(renderNow);
  }

  new ResizeObserver(scheduleRender).observe(root);
  addEventListener('scroll', scheduleRender, { passive: true });
  addEventListener('resize', scheduleRender, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRender(); });

  new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) scheduleRender();
  }, { rootMargin: '25% 0px' }).observe(track);

  resize();
  poseAtPct(readScrollPct());
  renderer.render(scene, camera);
  root.setAttribute('data-ready', '');

  window.__adamMasterplanV1 = {
    version: '1.0.0',
    keyframes: KEYFRAMES,
    style: STYLE,
    model,
    camera,
    scene,
    renderer,
    track,
    progress: () => readScrollPct(),
    render: scheduleRender
  };
}

function lazyInit(root) {
  const track = root.closest('.h-scroll') || document.querySelector('.h-scroll');
  if (!track) {
    init(root).catch(error => console.error('[ADAM V1] boot failed:', error));
    return;
  }

  let started = false;
  const observer = new IntersectionObserver(entries => {
    if (started || !entries.some(entry => entry.isIntersecting)) return;
    started = true;
    observer.disconnect();
    init(root).catch(error => console.error('[ADAM V1] boot failed:', error));
  }, { rootMargin: '100% 0px' });
  observer.observe(track);
}

for (const root of document.querySelectorAll('[data-adam-masterplan-v1]')) lazyInit(root);
