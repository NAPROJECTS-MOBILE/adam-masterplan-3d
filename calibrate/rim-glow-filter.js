import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/*
  ADAM edge + rim-glow policy
  ---------------------------
  The model contains a number of thin/rotated site-strip meshes that app-v2
  classifies as `flats`. Those meshes used to miss the normal architecture edge
  pass, and some only received a single supplemental glow line.

  This layer now treats every real mesh under Main_Group/clusters as an
  architectural edge/glow candidate (the primary site slab lives outside that
  subtree and is therefore left alone):

    1. if a mesh has no native app-v2 edge, add a matching supplemental edge;
    2. if a mesh has no native app-v2 glow, add a matching inner glow;
    3. add a SECOND, wider/fainter halo around every glow-eligible mesh;
    4. keep all supplemental layers local to the source mesh so motion follows;
    5. mirror app-v2 colour, opacity, width, resolution and visibility live;
    6. preserve the four previously confirmed no-rim-glow villa exclusions.

  The result is a tighter architectural core plus a soft outer bloom rather than
  one chunky neon stroke, which is materially closer to the original Spline feel.
*/
export const NO_RIM_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3'
]);

const HALO_WIDTH_MULTIPLIER = 2.15;
const HALO_OPACITY_MULTIPLIER = 0.30;
const HALO_WHITE_MIX = 0.10;
const haloWhite = new THREE.Color(0xffffff);

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function isForced(path) { return FORCE_GLOW_PATHS.has(path); }
function isExcluded(path) { return NO_RIM_GLOW_PATHS.has(path) && !isForced(path); }
function isGlowLine(object) {
  return object?.isLineSegments2 && object.material?.blending === THREE.AdditiveBlending;
}
function isSupplementalInnerGlow(object) { return !!object?.userData?.adamSupplementalRimGlow; }
function isSupplementalOuterGlow(object) { return !!object?.userData?.adamSupplementalOuterGlow; }
function isSupplementalEdge(object) { return !!object?.userData?.adamSupplementalRimEdge; }
function isAnySupplemental(object) {
  return isSupplementalInnerGlow(object) || isSupplementalOuterGlow(object) || isSupplementalEdge(object);
}
function isNativeGlow(object) { return isGlowLine(object) && !isAnySupplemental(object); }
function isNativeEdge(object) {
  return object?.isLineSegments2 && !isGlowLine(object) && !isAnySupplemental(object);
}
function isEligibleClusterMesh(object) {
  if (!object?.isMesh || object.isLineSegments2) return false;
  if (!object.geometry?.attributes?.position) return false;
  const path = pathOf(object);
  return isForced(path) || path.includes('Scene_1/Main_Group/clusters/');
}

function makeLineGeometry(mesh, thresholdAngle = 30) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) { edges.dispose(); return null; }
  const arr = new Float32Array(pos.count * 3);
  arr.set(pos.array);
  edges.dispose();
  const geo = new LineSegmentsGeometry();
  geo.setPositions(arr);
  return geo;
}

function directNativeGlowChildren(mesh) {
  return mesh.children.filter(isNativeGlow);
}
function directNativeEdgeChildren(mesh) {
  return mesh.children.filter(isNativeEdge);
}
function findNativeGlowTemplate(scene) {
  let template = null;
  scene.traverse(object => {
    if (template || !isNativeGlow(object) || !object.parent) return;
    if (isExcluded(pathOf(object.parent))) return;
    template = object;
  });
  return template;
}
function findNativeEdgeTemplate(scene) {
  let template = null;
  scene.traverse(object => {
    if (template || !isNativeEdge(object) || !object.parent) return;
    template = object;
  });
  return template;
}

// Keep the historical explicit glow exclusions enforced even when app-v2
// rebuilds its native line layers after an edge-angle edit.
const originalUpdateMatrixWorld = LineSegments2.prototype.updateMatrixWorld;
LineSegments2.prototype.updateMatrixWorld = function updateMatrixWorld(force) {
  originalUpdateMatrixWorld.call(this, force);
  if (!isGlowLine(this) || !this.parent) return;
  if (isExcluded(pathOf(this.parent))) this.visible = false;
};

const supplementalInnerGlow = new Set();
const supplementalOuterGlow = new Set();
const supplementalEdges = new Set();
let glowTemplateIdentity = null;
let edgeTemplateIdentity = null;
let lastLogSignature = '';

function destroySet(set) {
  for (const line of set) {
    line.removeFromParent();
    line.geometry?.dispose?.();
    line.material?.dispose?.();
  }
  set.clear();
}
function destroySupplemental() {
  destroySet(supplementalInnerGlow);
  destroySet(supplementalOuterGlow);
  destroySet(supplementalEdges);
}

function cloneGlowMaterial(template) {
  const mat = template.material.clone();
  mat.blending = THREE.AdditiveBlending;
  mat.depthTest = true;
  mat.depthWrite = false;
  mat.transparent = true;
  mat.toneMapped = false;
  return mat;
}
function cloneEdgeMaterial(template) {
  const mat = template.material.clone();
  mat.depthTest = true;
  mat.transparent = true;
  mat.toneMapped = false;
  return mat;
}

function addLineForMesh(mesh, geometry, materialFactory, marker, targetSet, renderOrder, instanceMatrix = null) {
  const line = new LineSegments2(geometry, materialFactory());
  line.userData[marker] = true;
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
  }
  mesh.add(line);
  targetSet.add(line);
  return 1;
}

function addLayer(mesh, template, kind) {
  const geometry = makeLineGeometry(mesh, 30);
  if (!geometry) return 0;

  const isEdge = kind === 'edge';
  const isOuter = kind === 'outer';
  const targetSet = isEdge ? supplementalEdges : (isOuter ? supplementalOuterGlow : supplementalInnerGlow);
  const marker = isEdge ? 'adamSupplementalRimEdge' : (isOuter ? 'adamSupplementalOuterGlow' : 'adamSupplementalRimGlow');
  const materialFactory = isEdge
    ? () => cloneEdgeMaterial(template)
    : () => cloneGlowMaterial(template);
  const renderOrder = isEdge ? (template.renderOrder || 3) : (isOuter ? 1 : (template.renderOrder || 2));

  let made = 0;
  if (mesh.isInstancedMesh) {
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      made += addLineForMesh(
        mesh,
        geometry.clone(),
        materialFactory,
        marker,
        targetSet,
        renderOrder,
        matrix.clone()
      );
    }
    geometry.dispose();
  } else {
    made += addLineForMesh(mesh, geometry, materialFactory, marker, targetSet, renderOrder);
  }
  return made;
}

function copyEdgeStyle(template, line) {
  const src = template.material;
  const dst = line.material;
  if (src.color && dst.color) dst.color.copy(src.color);
  if ('opacity' in src) dst.opacity = src.opacity;
  if ('linewidth' in src) dst.linewidth = src.linewidth;
  if (src.resolution && dst.resolution) dst.resolution.copy(src.resolution);
  line.visible = template.visible;
}

function copyInnerGlowStyle(template, line) {
  const src = template.material;
  const dst = line.material;
  if (src.color && dst.color) dst.color.copy(src.color);
  if ('opacity' in src) dst.opacity = src.opacity;
  if ('linewidth' in src) dst.linewidth = src.linewidth;
  if (src.resolution && dst.resolution) dst.resolution.copy(src.resolution);
  line.visible = template.visible;
}

function copyOuterGlowStyle(template, line) {
  const src = template.material;
  const dst = line.material;
  if (src.color && dst.color) {
    dst.color.copy(src.color).lerp(haloWhite, HALO_WHITE_MIX);
  }
  if ('opacity' in src) dst.opacity = src.opacity * HALO_OPACITY_MULTIPLIER;
  if ('linewidth' in src) {
    dst.linewidth = Math.max(src.linewidth + 1.5, src.linewidth * HALO_WIDTH_MULTIPLIER);
  }
  if (src.resolution && dst.resolution) dst.resolution.copy(src.resolution);
  line.visible = template.visible;
}

function rebuildSupplemental(scene, glowTemplate, edgeTemplate) {
  destroySupplemental();

  let edgesAdded = 0;
  let innerAdded = 0;
  let outerAdded = 0;
  let eligible = 0;
  let excluded = 0;
  let forcedResolved = 0;

  scene.traverse(mesh => {
    if (!isEligibleClusterMesh(mesh)) return;
    eligible++;

    const path = pathOf(mesh);
    if (isForced(path)) forcedResolved++;

    // Every cluster/path mesh gets an edge, irrespective of the glow blacklist.
    if (!directNativeEdgeChildren(mesh).length) {
      edgesAdded += addLayer(mesh, edgeTemplate, 'edge');
    }

    if (isExcluded(path)) {
      excluded++;
      for (const glow of directNativeGlowChildren(mesh)) glow.visible = false;
      return;
    }

    // Missing native glow gets a normal inner line, matching app-v2 exactly.
    if (!directNativeGlowChildren(mesh).length) {
      innerAdded += addLayer(mesh, glowTemplate, 'inner');
    }

    // Every glow-eligible mesh gets a second broad, low-alpha halo.
    outerAdded += addLayer(mesh, glowTemplate, 'outer');
  });

  const signature = `${eligible}/${edgesAdded}/${innerAdded}/${outerAdded}/${excluded}/${forcedResolved}`;
  if (signature !== lastLogSignature) {
    lastLogSignature = signature;
    console.info(
      `[ADAM edge+halo] eligible meshes=${eligible}; supplemental edges=${edgesAdded}; ` +
      `inner glow=${innerAdded}; outer halo=${outerAdded}; excluded glow=${excluded}; ` +
      `forced targets=${forcedResolved}/${FORCE_GLOW_PATHS.size}`
    );
  }
}

function syncArchitecturalLines(scene) {
  const glowTemplate = findNativeGlowTemplate(scene);
  const edgeTemplate = findNativeEdgeTemplate(scene);
  if (!glowTemplate || !edgeTemplate) return;

  if (glowTemplate !== glowTemplateIdentity || edgeTemplate !== edgeTemplateIdentity) {
    glowTemplateIdentity = glowTemplate;
    edgeTemplateIdentity = edgeTemplate;
    rebuildSupplemental(scene, glowTemplate, edgeTemplate);
  }

  for (const line of supplementalEdges) {
    if (!line.parent) continue;
    copyEdgeStyle(edgeTemplate, line);
  }

  for (const line of supplementalInnerGlow) {
    if (!line.parent) continue;
    const excluded = isExcluded(pathOf(line.parent));
    line.visible = excluded ? false : glowTemplate.visible;
    if (!excluded) copyInnerGlowStyle(glowTemplate, line);
  }

  for (const line of supplementalOuterGlow) {
    if (!line.parent) continue;
    const excluded = isExcluded(pathOf(line.parent));
    line.visible = excluded ? false : glowTemplate.visible;
    if (!excluded) copyOuterGlowStyle(glowTemplate, line);
  }
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  syncArchitecturalLines(scene);
  return originalRender.call(this, scene, camera);
};

window.__ADAM_NO_RIM_GLOW_PATHS = NO_RIM_GLOW_PATHS;
window.__ADAM_FORCE_GLOW_PATHS = FORCE_GLOW_PATHS;
window.__ADAM_RIM_GLOW_SUPPLEMENTAL = supplementalInnerGlow;
window.__ADAM_OUTER_GLOW_SUPPLEMENTAL = supplementalOuterGlow;
window.__ADAM_EDGE_SUPPLEMENTAL = supplementalEdges;
