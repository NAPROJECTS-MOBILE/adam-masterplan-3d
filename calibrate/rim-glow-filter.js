import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/*
  ADAM supplemental architecture edges — EDGE ONLY
  -------------------------------------------------
  Architectural glow is now owned by architectural-hull-glow.js.

  This helper does one job only:
  - ensure every eligible architecture mesh has the approved crisp 1px edge.

  It deliberately creates NO supplemental inner glow and NO outer halo.
  Path ribbons remain independent.
*/

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function isGlowLine(object) {
  return object?.isLineSegments2 && object.material?.blending === THREE.AdditiveBlending;
}

function isSupplementalEdge(object) {
  return !!object?.userData?.adamSupplementalRimEdge;
}

function isNativeEdge(object) {
  return object?.isLineSegments2 && !isGlowLine(object) && !isSupplementalEdge(object);
}

function isEligibleClusterMesh(object) {
  if (!object?.isMesh || object.isLineSegments2) return false;
  if (object.userData?.adamGlowHull) return false;
  if (!object.geometry?.attributes?.position) return false;
  const path = pathOf(object);
  return FORCE_GLOW_PATHS.has(path) || path.includes('Scene_1/Main_Group/clusters/');
}

function makeLineGeometry(mesh, thresholdAngle = 30) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return null;
  }
  const arr = new Float32Array(pos.count * 3);
  arr.set(pos.array);
  edges.dispose();
  const geo = new LineSegmentsGeometry();
  geo.setPositions(arr);
  return geo;
}

function directNativeEdgeChildren(mesh) {
  return mesh.children.filter(isNativeEdge);
}

function findNativeEdgeTemplate(scene) {
  let template = null;
  scene.traverse(object => {
    if (template || !isNativeEdge(object) || !object.parent) return;
    template = object;
  });
  return template;
}

const supplementalEdges = new Set();
let edgeTemplateIdentity = null;
let lastLogSignature = '';

function destroySupplementalEdges() {
  for (const line of supplementalEdges) {
    line.removeFromParent();
    line.geometry?.dispose?.();
    line.material?.dispose?.();
  }
  supplementalEdges.clear();
}

function cloneEdgeMaterial(template) {
  const mat = template.material.clone();
  mat.depthTest = true;
  mat.transparent = true;
  mat.toneMapped = false;
  return mat;
}

function addEdgeLine(mesh, geometry, template, instanceMatrix = null) {
  const line = new LineSegments2(geometry, cloneEdgeMaterial(template));
  line.userData.adamSupplementalRimEdge = true;
  line.frustumCulled = false;
  line.renderOrder = template.renderOrder || 3;
  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
  }
  mesh.add(line);
  supplementalEdges.add(line);
  return 1;
}

function addEdgeLayer(mesh, template) {
  const geometry = makeLineGeometry(mesh, 30);
  if (!geometry) return 0;

  let made = 0;
  if (mesh.isInstancedMesh) {
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      made += addEdgeLine(mesh, geometry.clone(), template, matrix.clone());
    }
    geometry.dispose();
  } else {
    made += addEdgeLine(mesh, geometry, template);
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

function rebuildSupplementalEdges(scene, edgeTemplate) {
  destroySupplementalEdges();

  let eligible = 0;
  let added = 0;
  let forcedResolved = 0;

  scene.traverse(mesh => {
    if (!isEligibleClusterMesh(mesh)) return;
    eligible++;
    if (FORCE_GLOW_PATHS.has(pathOf(mesh))) forcedResolved++;
    if (!directNativeEdgeChildren(mesh).length) {
      added += addEdgeLayer(mesh, edgeTemplate);
    }
  });

  const signature = `${eligible}/${added}/${forcedResolved}`;
  if (signature !== lastLogSignature) {
    lastLogSignature = signature;
    console.info(
      `[ADAM edge-only supplement] eligible=${eligible}; supplemental edges=${added}; ` +
      `forced targets=${forcedResolved}/${FORCE_GLOW_PATHS.size}`
    );
  }
}

function syncArchitecturalEdges(scene) {
  const edgeTemplate = findNativeEdgeTemplate(scene);
  if (!edgeTemplate) return;

  if (edgeTemplate !== edgeTemplateIdentity) {
    edgeTemplateIdentity = edgeTemplate;
    rebuildSupplementalEdges(scene, edgeTemplate);
  }

  for (const line of supplementalEdges) {
    if (!line.parent) continue;
    copyEdgeStyle(edgeTemplate, line);
  }
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamEdgeOnlySupplementRender(scene, camera) {
  syncArchitecturalEdges(scene);
  return originalRender.call(this, scene, camera);
};

window.__ADAM_FORCE_GLOW_PATHS = FORCE_GLOW_PATHS;
window.__ADAM_EDGE_SUPPLEMENTAL = supplementalEdges;
