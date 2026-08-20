import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MODEL_URL, FLAT_THRESHOLD, START_POSE, PRESETS, CAM, LIGHT, FACE, SLAB, EDGE, GLOW, DOTS } from './config.js';
import { createSplineMotion } from './spline-motion.js';
import { FORCE_GLOW_PATHS } from './glow-targets.js';

const $ = id => document.getElementById(id);
const setStatus = s => $('status').textContent = s;

// Four cluster anchors on the Webflow .h-scroll scale.
// 0–25, 25–50 and 50–75 interpolate; 75–100 holds cluster 4 unless another
// keyframe is inserted. Camera values start identical so the user can calibrate
// each cluster pose explicitly.
const seededFrames = [
  { scrollPct:0,  motionProgress:0 },
  { scrollPct:25, motionProgress:0.027 },
  { scrollPct:50, motionProgress:0.667 },
  { scrollPct:75, motionProgress:1 }
];
const state = {
  keyframes: seededFrames.map(k => ({ ...START_POSE, ...k })),
  style: { ...PRESETS['Official Light'] },
  preset: 'Official Light'
};
let active = 0, playing = false, playT = 0, previewScrollPct = 0, animateDots = true;

const root = document.querySelector('[data-scene3d]');
const canvas = root.querySelector('[data-scene3d-canvas]');
const frameEl = $('frame');

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);

const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a9a, .6);
const keyLight = new THREE.DirectionalLight(0xfff6e8, 1.4);
const rimLight = new THREE.DirectionalLight(0xc8f542, .5);
scene.add(hemi, keyLight, rimLight);

setStatus('loading fuller model…');
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync(MODEL_URL);
const model = gltf.scene;

const strip = [];
model.traverse(o => { if (o.isCamera || o.isLight) strip.push(o); });
strip.forEach(o => o.parent && o.parent.remove(o));

const glbPathOf = object => {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
};

/* ------------------------------------------------------- level site base */
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

const solids = [], flats = [];
const originals = new Map();
const contentBox = new THREE.Box3();
const forcedGlowResolved = new Set();

model.traverse(o => {
  if (!o.isMesh) return;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  originals.set(o, {
    color: mat?.color?.clone?.() || new THREE.Color(0xffffff),
    roughness: mat?.roughness ?? 1,
    metalness: mat?.metalness ?? 0
  });
  if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
  else o.material = o.material.clone();

  const path = glbPathOf(o);
  const forceGlow = FORCE_GLOW_PATHS.has(path);
  if (forceGlow) forcedGlowResolved.add(path);

  const b = new THREE.Box3().setFromObject(o);
  const s = b.getSize(new THREE.Vector3());

  if (s.y >= FLAT_THRESHOLD || forceGlow) {
    solids.push(o);
    contentBox.union(b);
  } else {
    flats.push({ mesh:o, footprint:s.x * s.z });
  }
});

console.info(`[ADAM glow] native edge/glow targets resolved ${forcedGlowResolved.size}/${FORCE_GLOW_PATHS.size}`);
const unresolvedForcedGlow = [...FORCE_GLOW_PATHS].filter(path => !forcedGlowResolved.has(path));
if (unresolvedForcedGlow.length) console.warn('[ADAM glow] unresolved forced paths:', unresolvedForcedGlow);

if (!solids.length) contentBox.setFromObject(model);
flats.sort((a,b) => b.footprint - a.footprint);
const slabMesh = primaryBaseMesh || flats[0]?.mesh || null;
const pathMeshes = flats
  .map(f => f.mesh)
  .filter(m => m !== slabMesh && m.parent);

const size = contentBox.getSize(new THREE.Vector3());
const centre = contentBox.getCenter(new THREE.Vector3());
const sphere = new THREE.Sphere();
contentBox.getBoundingSphere(sphere);
const radius = sphere.radius;

model.position.sub(centre);
scene.add(model);
model.updateWorldMatrix(true, true);

keyLight.position.set(.45, 1, .55).multiplyScalar(radius);
rimLight.position.set(-.7, .35, -.6).multiplyScalar(radius);

/* ----------------------------------------------------------- Spline motion */
const motion = createSplineMotion(model, { debug:true, unitScale:1, ambient:true });

/* ------------------------------------------------------- moving edge layers */
const edgeMat = new LineMaterial({ linewidth:1, transparent:true, depthTest:true });
const glowMat = new LineMaterial({
  linewidth:3, transparent:true, depthTest:true, depthWrite:false,
  blending:THREE.AdditiveBlending
});
edgeMat.toneMapped = glowMat.toneMapped = false;

let edgeLayers = [], glowLayers = [];

function clearEdgeLayers() {
  for (const l of [...edgeLayers, ...glowLayers]) {
    if (l.parent) l.parent.remove(l);
    l.geometry.dispose();
  }
  edgeLayers = [];
  glowLayers = [];
}

function isB10Prism(mesh) {
  if (mesh.parent?.name !== 'b10') return false;
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (!bb) return false;
  return (bb.max.z - bb.min.z) > 10;
}

function edgeGeometryForMesh(mesh, angle) {
  const eg = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = eg.attributes.position;

  let arr;
  if (isB10Prism(mesh)) {
    const bb = mesh.geometry.boundingBox;
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

  eg.dispose();
  const geo = new LineSegmentsGeometry();
  geo.setPositions(arr);
  return geo;
}

function addLocalEdgePair(mesh, angle, instanceMatrix = null) {
  const geo = edgeGeometryForMesh(mesh, angle);
  const edge = new LineSegments2(geo, edgeMat);
  const glow = new LineSegments2(geo.clone(), glowMat);
  edge.frustumCulled = glow.frustumCulled = false;
  edge.renderOrder = 3;
  glow.renderOrder = 2;

  if (instanceMatrix) {
    edge.matrixAutoUpdate = glow.matrixAutoUpdate = false;
    edge.matrix.copy(instanceMatrix);
    glow.matrix.copy(instanceMatrix);
  }

  mesh.add(edge, glow);
  edgeLayers.push(edge);
  glowLayers.push(glow);
}

function rebuildEdges(angle) {
  clearEdgeLayers();
  const im = new THREE.Matrix4();
  for (const mesh of solids) {
    if (mesh.isInstancedMesh) {
      for (let i=0;i<mesh.count;i++) {
        mesh.getMatrixAt(i, im);
        addLocalEdgePair(mesh, angle, im.clone());
      }
    } else {
      addLocalEdgePair(mesh, angle);
    }
  }
}

rebuildEdges(state.style.edgeAngle);

/* ------------------------------------------------------------- dot overlay */
const dotUniforms = {
  uTime:{value:0}, uDotColor:{value:new THREE.Color()}, uSpacing:{value:1},
  uDotSize:{value:.05}, uEdgeSoft:{value:.01}, uSkew:{value:.5},
  uFadedOpacity:{value:.1}, uActiveOpacity:{value:.5},
  uRippleSpeed:{value:1}, uRippleFrequency:{value:.35},
  uRippleWidth:{value:.3}, uRippleSoft:{value:.08},
  uRippleOrigin:{value:new THREE.Vector2()}, uAnimate:{value:1}
};

const dotMaterial = new THREE.ShaderMaterial({
  uniforms:dotUniforms,
  transparent:true, depthWrite:false, depthTest:true, toneMapped:false,
  polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1,
  vertexShader:`varying vec3 vWorld;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`uniform float uTime,uSpacing,uDotSize,uEdgeSoft,uSkew,uFadedOpacity,uActiveOpacity,uRippleSpeed,uRippleFrequency,uRippleWidth,uRippleSoft,uAnimate;uniform vec2 uRippleOrigin;uniform vec3 uDotColor;varying vec3 vWorld;void main(){vec2 p=vWorld.xz;vec2 iso=vec2(p.x+p.y*uSkew,p.y*0.8660254);vec2 cell=fract(iso/uSpacing)-0.5;float d=length(cell);float dotMask=1.0-smoothstep(uDotSize,uDotSize+max(uEdgeSoft,0.0005),d);if(dotMask<0.001)discard;float dist=length(p-uRippleOrigin);float wave=0.5+0.5*sin(dist*uRippleFrequency-uTime*uRippleSpeed);float low=clamp(0.5-uRippleWidth*0.5,0.0,1.0);float high=clamp(0.5+uRippleWidth*0.5,0.0,1.0);float ripple=smoothstep(low-uRippleSoft,low+uRippleSoft,wave)*(1.0-smoothstep(high-uRippleSoft,high+uRippleSoft,wave));ripple=mix(0.0,ripple,uAnimate);float alpha=mix(uFadedOpacity,uActiveOpacity,ripple)*dotMask;if(alpha<0.001)discard;gl_FragColor=vec4(uDotColor,alpha);}`
});

let dotOverlay = null;
if (slabMesh) {
  dotOverlay = new THREE.Mesh(slabMesh.geometry, dotMaterial);
  dotOverlay.matrixAutoUpdate = false;
  dotOverlay.matrix.copy(slabMesh.matrixWorld);
  dotOverlay.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, .004, 0));
  dotOverlay.frustumCulled = false;
  dotOverlay.renderOrder = 1;
  scene.add(dotOverlay);
}

const boundsHelper = new THREE.Box3Helper(
  contentBox.clone().translate(centre.clone().negate()), 0x00ff88
);
boundsHelper.visible = false;
const grid = new THREE.GridHelper(radius * 4, 24, 0x444444, 0x262626);
grid.visible = false;
scene.add(boundsHelper, grid);

/* ------------------------------------------------------------- appearance */
const tmpColor = new THREE.Color();
function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else fn(mesh.material);
}

function applyStyle() {
  const s = state.style;
  scene.background = new THREE.Color(s.background);
  hemi.intensity = s.hemisphere;
  keyLight.intensity = s.key;
  keyLight.color.set(s.keyTint);
  rimLight.intensity = s.rim;
  renderer.toneMappingExposure = s.exposure;

  const tint = tmpColor.set(s.face);
  for (const m of solids) {
    const o = originals.get(m);
    eachMaterial(m, mat => {
      if (mat.color) mat.color.copy(o.color).lerp(tint, s.faceTint);
      if ('roughness' in mat) mat.roughness = s.faceRoughness;
      if ('metalness' in mat) mat.metalness = s.faceMetalness;
      mat.transparent = true;
      mat.opacity = s.faceOpacity;
      mat.depthWrite = true;
      mat.depthTest = true;
      mat.needsUpdate = true;
    });
  }

  if (slabMesh) {
    slabMesh.renderOrder = -20;
    eachMaterial(slabMesh, mat => {
      if (mat.color) mat.color.set(s.slab);
      if ('roughness' in mat) mat.roughness = s.slabRoughness;
      mat.transparent = true;
      mat.opacity = s.slabOpacity;
      mat.depthTest = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    });
  }

  edgeMat.color.set(s.edge);
  edgeMat.opacity = s.edgeOpacity;
  edgeMat.linewidth = s.edgeWidth;
  glowMat.color.set(s.glow);
  glowMat.opacity = s.glowOpacity * s.glowStrength;
  glowMat.linewidth = s.glowWidth;

  const expansion = 1 + s.glowExpansion;
  for (const l of glowLayers) if (l.matrixAutoUpdate) l.scale.setScalar(expansion);

  dotUniforms.uDotColor.value.set(s.dotColor);
  dotUniforms.uSpacing.value = 2 / Math.max(.05, s.dotDensity);
  dotUniforms.uDotSize.value = s.dotSize;
  dotUniforms.uEdgeSoft.value = s.dotEdgeSoftness;
  dotUniforms.uSkew.value = s.dotSkew;
  dotUniforms.uFadedOpacity.value = s.dotFadedOpacity;
  dotUniforms.uActiveOpacity.value = s.dotActiveOpacity;
  dotUniforms.uRippleSpeed.value = s.rippleSpeed;
  dotUniforms.uRippleFrequency.value = s.rippleFrequency;
  dotUniforms.uRippleWidth.value = s.rippleWidth;
  dotUniforms.uRippleSoft.value = s.rippleSoftness;
  dotUniforms.uRippleOrigin.value.set(s.rippleOriginX, s.rippleOriginZ);
  dotUniforms.uAnimate.value = animateDots ? 1 : 0;
}

/* --------------------------------------------------------------- camera */
let fitDist = radius * 3;
function computeFit() {
  const vf = camera.fov * Math.PI / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  fitDist = Math.max(radius / Math.sin(vf / 2), radius / Math.sin(hf / 2));
}

function resize() {
  const r = root.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = h > w ? 50 : 38;
  camera.updateProjectionMatrix();
  computeFit();
  edgeMat.resolution.set(w, h);
  glowMat.resolution.set(w, h);
}
new ResizeObserver(resize).observe(root);
resize();

const look = new THREE.Vector3();
const lerp = (a,b,t) => a + (b-a) * t;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const camEase = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

function poseAt(k) {
  const az = k.azimuth * Math.PI / 180;
  const el = k.elevation * Math.PI / 180;
  look.set(k.panX * size.x, 0, k.panZ * size.z);
  const d = fitDist * k.zoom;
  camera.position.set(
    look.x + Math.sin(az) * Math.cos(el) * d,
    look.y + Math.sin(el) * d,
    look.z + Math.cos(az) * Math.cos(el) * d
  );
  camera.lookAt(look);
}

function applyScrollTimeline(scrollPct) {
  const K = state.keyframes;
  const pct = clamp(scrollPct, 0, 100);
  if (!K.length) return;
  if (K.length === 1 || pct <= K[0].scrollPct) {
    poseAt(K[0]);
    motion.setProgress(K[0].motionProgress ?? 0);
    return;
  }

  const last = K[K.length - 1];
  if (pct >= last.scrollPct) {
    poseAt(last);
    motion.setProgress(last.motionProgress ?? 0);
    return;
  }

  let i = 0;
  while (i < K.length - 1 && pct > K[i + 1].scrollPct) i++;
  const a = K[i], b = K[i + 1];
  const span = Math.max(0.0001, b.scrollPct - a.scrollPct);
  const raw = clamp((pct - a.scrollPct) / span, 0, 1);
  const f = camEase(raw);

  poseAt({
    azimuth:lerp(a.azimuth,b.azimuth,f),
    elevation:lerp(a.elevation,b.elevation,f),
    zoom:lerp(a.zoom,b.zoom,f),
    panX:lerp(a.panX,b.panX,f),
    panZ:lerp(a.panZ,b.panZ,f)
  });
  motion.setProgress(lerp(a.motionProgress ?? 0, b.motionProgress ?? 0, raw));
}

function showSelectedFrame() {
  playing = false;
  const frame = state.keyframes[active];
  if (!frame) return;
  previewScrollPct = frame.scrollPct;
  poseAt(frame);
  motion.setProgress(frame.motionProgress ?? 0);
}

/* ---------------------------------------------------------------- controls */
function build(host, specs, get, onChange) {
  host.innerHTML = '';
  for (const sp of specs) {
    const [k,label] = sp;
    const wrap = document.createElement('div');
    let input;

    if (sp[2] === 'color') {
      wrap.className = 'ctl color';
      wrap.innerHTML = `<label>${label}</label>`;
      input = document.createElement('input');
      input.type = 'color';
      input.oninput = () => { get()[k] = input.value; onChange(); syncUI(); };
    } else {
      wrap.className = 'ctl';
      wrap.innerHTML = `<label>${label}<span data-v></span></label>`;
      input = document.createElement('input');
      Object.assign(input, { type:'range', min:sp[2], max:sp[3], step:sp[4] });
      input.oninput = () => { get()[k] = parseFloat(input.value); onChange(); syncUI(); };
    }

    wrap.appendChild(input);
    wrap._input = input;
    wrap._key = k;
    wrap._get = get;
    wrap._isColor = sp[2] === 'color';
    host.appendChild(wrap);
  }
}

const getKF = () => state.keyframes[active];
const getStyle = () => state.style;
const onStyle = () => applyStyle();
const onEdge = () => { rebuildEdges(state.style.edgeAngle); applyStyle(); };
const onKeyframeEdit = () => showSelectedFrame();
const MOTION = [['motionProgress','Spline reveal progress',0,1,.001]];

const hosts = [
  [$('camCtls'), CAM, getKF, onKeyframeEdit],
  [$('motionCtls'), MOTION, getKF, onKeyframeEdit],
  [$('lightCtls'), LIGHT, getStyle, onStyle],
  [$('faceCtls'), FACE, getStyle, onStyle],
  [$('slabCtls'), SLAB, getStyle, onStyle],
  [$('edgeCtls'), EDGE, getStyle, onEdge],
  [$('glowCtls'), GLOW, getStyle, onStyle],
  [$('dotCtls'), DOTS, getStyle, onStyle]
];
hosts.forEach(([h,s,g,c]) => build(h,s,g,c));

const kfrow = $('kfrow');
const scrollKFHost = $('scrollKeyframeCtl');
const scrollKFWrap = document.createElement('div');
scrollKFWrap.className = 'ctl';
scrollKFWrap.innerHTML = '<label>Keyframe scroll position<span data-v></span></label>';
const scrollKFInput = document.createElement('input');
Object.assign(scrollKFInput, { type:'range', min:0, max:100, step:.1 });
scrollKFWrap.appendChild(scrollKFInput);
scrollKFHost.appendChild(scrollKFWrap);

function clampKeyframePct(index, value) {
  const prev = index > 0 ? state.keyframes[index - 1].scrollPct + 0.1 : 0;
  const next = index < state.keyframes.length - 1 ? state.keyframes[index + 1].scrollPct - 0.1 : 100;
  return clamp(value, prev, next);
}

scrollKFInput.oninput = () => {
  const next = clampKeyframePct(active, parseFloat(scrollKFInput.value));
  state.keyframes[active].scrollPct = next;
  showSelectedFrame();
  renderKeyframeButtons();
  syncUI();
};

function renderKeyframeButtons() {
  kfrow.innerHTML = '';
  state.keyframes.forEach((k,i) => {
    const b = document.createElement('button');
    b.textContent = `${String(i + 1).padStart(2,'0')} · ${Number(k.scrollPct.toFixed(1))}%`;
    b.onclick = () => {
      active = i;
      showSelectedFrame();
      syncUI();
    };
    kfrow.appendChild(b);
  });
}

$('addKFBtn').onclick = () => {
  const current = state.keyframes[active];
  const next = state.keyframes[active + 1];
  let insertAt = active + 1;
  let pct;

  if (next) {
    pct = (current.scrollPct + next.scrollPct) / 2;
  } else if (current.scrollPct < 100) {
    pct = (current.scrollPct + 100) / 2;
  } else {
    const prev = state.keyframes[active - 1];
    pct = prev ? (prev.scrollPct + current.scrollPct) / 2 : 50;
    insertAt = active;
  }

  // New keyframes intentionally start clean. Use Copy previous when you want
  // the prior camera/reveal pose as the starting point for this new timestamp.
  const fresh = {
    ...START_POSE,
    scrollPct: Number(pct.toFixed(1)),
    motionProgress: 0
  };

  state.keyframes.splice(insertAt, 0, fresh);
  active = insertAt;
  showSelectedFrame();
  renderKeyframeButtons();
  syncUI();
};

$('deleteKFBtn').onclick = () => {
  if (state.keyframes.length <= 1) return;
  state.keyframes.splice(active, 1);
  active = Math.max(0, Math.min(active, state.keyframes.length - 1));
  showSelectedFrame();
  renderKeyframeButtons();
  syncUI();
};

$('copyPrevBtn').onclick = () => {
  if (active > 0) {
    const pct = state.keyframes[active].scrollPct;
    state.keyframes[active] = { ...state.keyframes[active - 1], scrollPct:pct };
    showSelectedFrame();
    syncUI();
  }
};

$('playBtn').onclick = () => {
  if (playing) {
    playing = false;
  } else {
    playing = true;
    playT = 0;
    previewScrollPct = 0;
  }
  syncUI();
};

$('scrollScrub').oninput = e => {
  playing = false;
  previewScrollPct = parseFloat(e.target.value);
  syncUI();
};

for (const b of $('quarterJumps').querySelectorAll('[data-pct]')) {
  b.onclick = () => {
    playing = false;
    previewScrollPct = parseFloat(b.dataset.pct);
    syncUI();
  };
}

Object.keys(PRESETS).forEach(name => {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => {
    state.style = { ...PRESETS[name] };
    state.preset = name;
    rebuildEdges(state.style.edgeAngle);
    applyStyle();
    syncUI();
  };
  $('presetRow').appendChild(b);
});

const toggle = (id,fn,on=false) => {
  const b = $(id);
  if (on) b.classList.add('on');
  b.onclick = () => { b.classList.toggle('on'); fn(b.classList.contains('on')); };
};

toggle('tPortrait', v => { frameEl.classList.toggle('portrait', v); requestAnimationFrame(resize); });
toggle('tGround', v => { if (slabMesh) slabMesh.visible = v; pathMeshes.forEach(m => m.visible = v); }, true);
toggle('tEdges', v => edgeLayers.forEach(l => l.visible = v), true);
toggle('tGlow', v => glowLayers.forEach(l => l.visible = v), true);
toggle('tDots', v => { if (dotOverlay) dotOverlay.visible = v; }, true);
toggle('tBounds', v => boundsHelper.visible = v);
toggle('tGrid', v => grid.visible = v);
toggle('tAnimate', v => { animateDots = v; dotUniforms.uAnimate.value = v ? 1 : 0; }, true);

function serialise() {
  const K = state.keyframes.map((k,i) =>
    `  // ${String(i + 1).padStart(2,'0')} @ ${Number(k.scrollPct.toFixed(1))}% of .h-scroll\n` +
    `  { scrollPct: ${Number(k.scrollPct.toFixed(1))}, azimuth: ${k.azimuth.toFixed(0)}, elevation: ${k.elevation.toFixed(0)}, ` +
    `zoom: ${k.zoom.toFixed(2)}, panX: ${k.panX.toFixed(2)}, panZ: ${k.panZ.toFixed(2)}, ` +
    `motionProgress: ${(k.motionProgress ?? 0).toFixed(3)} }`
  ).join(',\n');
  return `const KEYFRAMES = [\n${K}\n];\n\n// Production: feed 0–100% .h-scroll progress into applyScrollTimeline().\nstyle = ${JSON.stringify(state.style,null,2)};`;
}

$('copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(serialise()); setStatus('copied to clipboard'); }
  catch { $('out').select(); setStatus('select the textarea and copy manually'); }
};

$('resetBtn').onclick = () => {
  state.style = { ...PRESETS[state.preset] };
  rebuildEdges(state.style.edgeAngle);
  applyStyle();
  syncUI();
};

function syncUI() {
  [...kfrow.children].forEach((b,i) => b.classList.toggle('on', i === active && !playing));
  $('copyPrevBtn').disabled = active === 0;
  $('deleteKFBtn').disabled = state.keyframes.length <= 1;

  for (const [host] of hosts) {
    for (const wrap of host.children) {
      const v = wrap._get()[wrap._key];
      if (wrap._isColor) wrap._input.value = v;
      else {
        wrap._input.value = v;
        wrap.querySelector('[data-v]').textContent = Math.abs(v) < 10 ? (+v).toFixed(2) : (+v).toFixed(0);
      }
    }
  }

  scrollKFInput.value = state.keyframes[active].scrollPct;
  scrollKFWrap.querySelector('[data-v]').textContent = `${Number(state.keyframes[active].scrollPct.toFixed(1))}%`;
  $('scrollScrub').value = previewScrollPct;
  $('scrollPctReadout').textContent = `${Number(previewScrollPct.toFixed(1))}%`;
  $('playBtn').textContent = playing ? '❚❚ Pause' : '▶ Play 0–100%';
  for (const b of $('quarterJumps').querySelectorAll('[data-pct]')) {
    b.classList.toggle('on', Math.abs(parseFloat(b.dataset.pct) - previewScrollPct) < 0.05);
  }

  $('out').value = serialise();
  const mapped = motion.bound.map(b => b.key).join(', ');
  const spinning = motion.spins.map(s => s.key).join(', ');
  const inert = motion.inert.map(i => i.key).join(', ');
  setStatus(
    `fuller model · ${solids.length} solid / ${flats.length} flat · forced glow ${forcedGlowResolved.size}/${FORCE_GLOW_PATHS.size}\n` +
    `selected frame ${String(active + 1).padStart(2,'0')} @ ${Number(state.keyframes[active].scrollPct.toFixed(1))}% · scroll preview ${Number(previewScrollPct.toFixed(1))}%\n` +
    `keyframes ${state.keyframes.map(k => Number(k.scrollPct.toFixed(1)) + '%').join(' / ')}\n` +
    `Spline reveal mapped: ${mapped || 'none'}\n` +
    `ambient: ${spinning || 'none'}${inert ? ` · inert: ${inert}` : ''}`
  );
}

renderKeyframeButtons();
applyStyle();
showSelectedFrame();
syncUI();

let lastDot = 0;
(function loop(now) {
  requestAnimationFrame(loop);

  const seconds = now * .001;
  if (motion.hasAmbient) motion.setAmbientTime(seconds);

  if (animateDots && now - lastDot >= 33) {
    dotUniforms.uTime.value = seconds;
    lastDot = now;
  }

  if (playing) {
    playT += .0022;
    if (playT >= 1) {
      playT = 1;
      playing = false;
    }
    previewScrollPct = playT * 100;
    applyScrollTimeline(previewScrollPct);
    if (!playing) syncUI();
    else {
      $('scrollScrub').value = previewScrollPct;
      $('scrollPctReadout').textContent = `${Math.round(previewScrollPct)}%`;
    }
  } else {
    applyScrollTimeline(previewScrollPct);
  }

  renderer.render(scene, camera);
})(0);
