import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/*
  ADAM architectural glow — inverted-hull prototype
  -------------------------------------------------
  Replaces visible architectural fat-line glow with a continuous mesh shell.
  The existing native LineSegments2 glow remains in the scene ONLY as a hidden
  live style source, so the calibrator's approved Glow controls continue to
  control colour / opacity / width without changing app-v2's state model.

  Path ribbons are not touched.
  Crisp 1px architecture edges are not touched.
*/

const BASE_LINE_PX = 7;
const BASE_INNER_WORLD = 0.014;
const HALO_WIDTH_MULTIPLIER = 2.15;
const HALO_OPACITY_MULTIPLIER = 0.30;
const HALO_WHITE_MIX = 0.10;
const WELD_TOLERANCE = 1e-4;

const NO_HULL_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3'
]);

const hullGeoCache = new Map();
const hullEntries = new Map();
const haloWhite = new THREE.Color(0xffffff);
let initialized = false;
let nativeGlowTemplate = null;
let lastSummary = '';

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function sourcePathOf(mesh) {
  return mesh.userData?.adamHullSourcePath || pathOf(mesh);
}

function isForced(path) {
  return FORCE_GLOW_PATHS.has(path);
}

function isExcluded(path) {
  return NO_HULL_GLOW_PATHS.has(path) && !isForced(path);
}

function isEligibleSource(mesh) {
  if (!mesh?.isMesh || mesh.isLineSegments2) return false;
  if (mesh.userData?.adamGlowHull) return false;
  if (!mesh.geometry?.attributes?.position) return false;
  const path = pathOf(mesh);
  return isForced(path) || path.includes('Scene_1/Main_Group/clusters/');
}

function isNativeArchitecturalGlow(line) {
  if (!line?.isLineSegments2 || !line.material) return false;
  if (line.material.blending !== THREE.AdditiveBlending) return false;
  const parentPath = line.parent ? pathOf(line.parent) : '';
  return parentPath.includes('Scene_1/Main_Group/clusters/');
}

function hullGeometryFor(geometry) {
  const cached = hullGeoCache.get(geometry.uuid);
  if (cached) return cached;

  const copy = geometry.clone();
  // Normal expansion on hard-edge split vertices cracks boxes open. Weld the
  // coincident positions first, then build one averaged normal per corner.
  const welded = mergeVertices(copy, WELD_TOLERANCE);
  welded.deleteAttribute('normal');
  welded.computeVertexNormals();
  welded.computeBoundingSphere();
  welded.computeBoundingBox();
  hullGeoCache.set(geometry.uuid, welded);
  return welded;
}

function makeHullMaterial() {
  return new THREE.ShaderMaterial({
    uniforms:{
      uColor:{ value:new THREE.Color('#b9e222') },
      uOpacity:{ value:0.018 },
      uWidth:{ value:BASE_INNER_WORLD }
    },
    vertexShader:`
      uniform float uWidth;
      void main() {
        vec3 p = position;
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = (instanceMatrix * vec4(p, 1.0)).xyz;
          n = normalize(mat3(instanceMatrix) * n);
        #endif
        vec3 viewNormal = normalize(normalMatrix * n);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xyz += viewNormal * uWidth;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader:`
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    side:THREE.BackSide,
    transparent:true,
    depthTest:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
    toneMapped:false
  });
}

function copyTransform(source, target) {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  if (!source.matrixAutoUpdate) target.matrix.copy(source.matrix);
}

function createHullObject(source, geometry, material, kind) {
  let hull;
  if (source.isInstancedMesh) {
    hull = new THREE.InstancedMesh(geometry, material, source.count);
    hull.instanceMatrix.copy(source.instanceMatrix);
    hull.instanceMatrix.needsUpdate = true;
    if (source.instanceColor) {
      hull.instanceColor = source.instanceColor.clone();
      hull.instanceColor.needsUpdate = true;
    }
  } else {
    hull = new THREE.Mesh(geometry, material);
  }

  hull.name = `ADAM_${kind}_HULL`;
  hull.userData.adamGlowHull = true;
  hull.userData.adamGlowHullKind = kind;
  hull.userData.adamHullSourcePath = pathOf(source);
  hull.frustumCulled = false;
  hull.renderOrder = kind === 'halo' ? 1 : 2;
  copyTransform(source, hull);
  return hull;
}

function installSource(source) {
  if (hullEntries.has(source.uuid)) return;
  const path = pathOf(source);
  if (isExcluded(path)) return;

  const geometry = hullGeometryFor(source.geometry);
  const haloMat = makeHullMaterial();
  const innerMat = makeHullMaterial();
  const halo = createHullObject(source, geometry, haloMat, 'halo');
  const inner = createHullObject(source, geometry, innerMat, 'inner');

  // Siblings, not children: this avoids accidental double transforms and lets
  // InstancedMesh hulls carry the same instanceMatrix explicitly.
  const parent = source.parent;
  if (!parent) {
    haloMat.dispose();
    innerMat.dispose();
    return;
  }
  parent.add(halo, inner);

  hullEntries.set(source.uuid, { source, path, halo, inner, haloMat, innerMat });
}

function syncInstanceState(entry) {
  const { source, halo, inner } = entry;
  copyTransform(source, halo);
  copyTransform(source, inner);

  if (source.isInstancedMesh && halo.isInstancedMesh && inner.isInstancedMesh) {
    // Spline motion may alter instance matrices. Keep hulls locked to the source.
    halo.count = inner.count = source.count;
    halo.instanceMatrix.copy(source.instanceMatrix);
    inner.instanceMatrix.copy(source.instanceMatrix);
    halo.instanceMatrix.needsUpdate = true;
    inner.instanceMatrix.needsUpdate = true;
  }
}

function findAndHideFatGlow(scene) {
  nativeGlowTemplate = null;
  scene.traverse(object => {
    if (!isNativeArchitecturalGlow(object)) return;
    if (!nativeGlowTemplate && !object.userData?.adamSupplementalOuterGlow) {
      nativeGlowTemplate = object;
    }
    object.visible = false;
  });
}

function glowEnabled() {
  const button = document.getElementById('tGlow');
  return button ? button.classList.contains('on') : true;
}

function syncStyles() {
  if (!nativeGlowTemplate?.material) return;
  const src = nativeGlowTemplate.material;
  const linePx = Math.max(0.01, Number(src.linewidth || BASE_LINE_PX));
  const innerWidth = BASE_INNER_WORLD * (linePx / BASE_LINE_PX);
  const innerOpacity = Number(src.opacity ?? 0.018);
  const visible = glowEnabled();

  for (const entry of hullEntries.values()) {
    syncInstanceState(entry);

    entry.innerMat.uniforms.uColor.value.copy(src.color || new THREE.Color('#b9e222'));
    entry.innerMat.uniforms.uOpacity.value = innerOpacity;
    entry.innerMat.uniforms.uWidth.value = innerWidth;

    entry.haloMat.uniforms.uColor.value
      .copy(src.color || new THREE.Color('#b9e222'))
      .lerp(haloWhite, HALO_WHITE_MIX);
    entry.haloMat.uniforms.uOpacity.value = innerOpacity * HALO_OPACITY_MULTIPLIER;
    entry.haloMat.uniforms.uWidth.value = innerWidth * HALO_WIDTH_MULTIPLIER;

    entry.inner.visible = visible;
    entry.halo.visible = visible;
  }
}

function install(scene) {
  if (initialized) return;
  const sources = [];
  scene.traverse(object => {
    if (isEligibleSource(object)) sources.push(object);
  });
  for (const source of sources) installSource(source);
  initialized = true;

  const normal = [...hullEntries.values()].filter(e => !e.source.isInstancedMesh).length;
  const instanced = [...hullEntries.values()].filter(e => e.source.isInstancedMesh).length;
  const summary = `${hullEntries.size}/${normal}/${instanced}`;
  if (summary !== lastSummary) {
    lastSummary = summary;
    console.info(
      `[ADAM hull glow] installed ${hullEntries.size} sources ` +
      `(${normal} Mesh, ${instanced} InstancedMesh); welded geometries=${hullGeoCache.size}`
    );
  }
}

function sync(scene) {
  install(scene);
  findAndHideFatGlow(scene);
  syncStyles();
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamArchitecturalHullGlowRender(scene, camera) {
  sync(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_ARCHITECTURAL_HULL_GLOW = {
  version:1,
  entries:hullEntries,
  geometryCache:hullGeoCache,
  widths:{ baseInnerWorld:BASE_INNER_WORLD, haloMultiplier:HALO_WIDTH_MULTIPLIER },
  exclusions:NO_HULL_GLOW_PATHS
};
