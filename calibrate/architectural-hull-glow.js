import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/*
  ADAM architectural glow — inverted-hull prototype V2
  ----------------------------------------------------
  Replaces visible architectural fat-line glow with a continuous mesh shell.

  IMPORTANT V2 FIX:
  BufferGeometryUtils.mergeVertices() hashes every vertex attribute. Calling it
  on the original GLB geometry therefore does NOT weld hard-edge split vertices
  when their normals / UVs differ. V2 first creates a POSITION-ONLY geometry,
  then welds coincident positions, then recomputes one averaged normal field.
  That is required for a genuinely continuous inverted hull at box corners.

  Existing native LineSegments2 glow stays only as a hidden live style source,
  so the calibrator's Glow controls continue to drive colour / opacity / width.
  Path ribbons and crisp 1px architecture edges are untouched.
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

function positionOnlyGeometry(source) {
  const g = new THREE.BufferGeometry();
  const position = source.getAttribute('position');
  g.setAttribute('position', position.clone());

  // Preserve triangle topology while intentionally dropping normal/uv/tangent/
  // colour attributes so mergeVertices hashes POSITION ONLY.
  if (source.index) g.setIndex(source.index.clone());

  return g;
}

function hullGeometryFor(geometry) {
  const cached = hullGeoCache.get(geometry.uuid);
  if (cached) return cached;

  const positionOnly = positionOnlyGeometry(geometry);
  const before = positionOnly.getAttribute('position')?.count || 0;
  const welded = mergeVertices(positionOnly, WELD_TOLERANCE);
  positionOnly.dispose();

  // One shared averaged normal field across the welded topology is the core of
  // the hull approach: hard-edge GLB normal splits must not survive here.
  welded.computeVertexNormals();
  welded.normalizeNormals();
  welded.computeBoundingSphere();
  welded.computeBoundingBox();

  const after = welded.getAttribute('position')?.count || 0;
  welded.userData.adamHullWeld = {
    sourceUuid:geometry.uuid,
    before,
    after,
    merged:Math.max(0, before - after),
    tolerance:WELD_TOLERANCE
  };

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
          // Correct for the overwhelmingly uniform instance transforms used by
          // this GLB. Parent non-uniform scale is handled by normalMatrix below.
          n = normalize(mat3(instanceMatrix) * n);
        #endif
        vec3 viewNormal = normalize(normalMatrix * n);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // View-space expansion gives a stable world-unit shell thickness without
        // origin-based scale inflation.
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

  const parent = source.parent;
  if (!parent) {
    haloMat.dispose();
    innerMat.dispose();
    return;
  }
  parent.add(halo, inner);
  hullEntries.set(source.uuid, { source, path, halo, inner, haloMat, innerMat });
}

function syncSourceState(entry) {
  const { source, halo, inner } = entry;
  copyTransform(source, halo);
  copyTransform(source, inner);

  if (source.isInstancedMesh && halo.isInstancedMesh && inner.isInstancedMesh) {
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
    if (!nativeGlowTemplate) nativeGlowTemplate = object;
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
    syncSourceState(entry);

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
  let before = 0, after = 0;
  for (const geometry of hullGeoCache.values()) {
    before += geometry.userData.adamHullWeld?.before || 0;
    after += geometry.userData.adamHullWeld?.after || 0;
  }

  const summary = `${hullEntries.size}/${normal}/${instanced}/${before}/${after}`;
  if (summary !== lastSummary) {
    lastSummary = summary;
    console.info(
      `[ADAM hull glow V2] sources=${hullEntries.size} (${normal} Mesh, ${instanced} InstancedMesh); ` +
      `geometry cache=${hullGeoCache.size}; welded vertices ${before} -> ${after} ` +
      `(merged ${Math.max(0, before-after)})`
    );
  }
}

function sync(scene) {
  install(scene);
  findAndHideFatGlow(scene);
  syncStyles();
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamArchitecturalHullGlowV2Render(scene, camera) {
  sync(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_ARCHITECTURAL_HULL_GLOW = {
  version:2,
  entries:hullEntries,
  geometryCache:hullGeoCache,
  widths:{ baseInnerWorld:BASE_INNER_WORLD, haloMultiplier:HALO_WIDTH_MULTIPLIER },
  exclusions:NO_HULL_GLOW_PATHS
};
