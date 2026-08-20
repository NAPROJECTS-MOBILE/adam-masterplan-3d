import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

// Exact five thin architectural meshes that already follow the normal
// Building Material controls. They should also receive the normal EDGE layer,
// but must not be reclassified as solids or receive any supplemental glow.
const EDGE_ONLY_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

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
  return !!object?.userData?.adamFiveFaceEdge;
}

function isNativeEdge(object) {
  return object?.isLineSegments2 && !isGlowLine(object) && !isSupplementalEdge(object);
}

function directNativeEdgeChildren(mesh) {
  return mesh.children.filter(isNativeEdge);
}

function currentEdgeAngle() {
  const controls = [...document.querySelectorAll('#edgeCtls .ctl')];
  const value = Number(controls[3]?.querySelector('input')?.value);
  return Number.isFinite(value) ? value : 30;
}

function makeLineGeometry(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const position = edges.attributes.position;
  if (!position || position.count < 2) {
    edges.dispose();
    return null;
  }

  const positions = new Float32Array(position.count * 3);
  positions.set(position.array);
  edges.dispose();

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

const supplementalEdges = new Set();
let lastNativeTemplate = null;
let lastResolvedSignature = '';

function destroySupplementalEdges() {
  for (const line of supplementalEdges) {
    line.removeFromParent();
    line.geometry?.dispose?.();
  }
  supplementalEdges.clear();
}

function addEdge(mesh, template, angle, instanceMatrix = null) {
  const geometry = makeLineGeometry(mesh, angle);
  if (!geometry) return 0;

  const line = new LineSegments2(geometry, template.material);
  line.userData.adamFiveFaceEdge = true;
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

function rebuild(scene, template) {
  destroySupplementalEdges();

  const angle = currentEdgeAngle();
  const resolved = [];
  let added = 0;

  scene.traverse(mesh => {
    if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return;
    const path = pathOf(mesh);
    if (!EDGE_ONLY_PATHS.has(path)) return;

    resolved.push(path);
    if (directNativeEdgeChildren(mesh).length) return;

    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        added += addEdge(mesh, template, angle, matrix.clone());
      }
    } else {
      added += addEdge(mesh, template, angle);
    }
  });

  const signature = resolved.sort().join('|');
  if (signature !== lastResolvedSignature) {
    lastResolvedSignature = signature;
    console.info(`[ADAM five-face edges] resolved ${resolved.length}/${EDGE_ONLY_PATHS.size}; added ${added} edge layer(s)`);
    const missing = [...EDGE_ONLY_PATHS].filter(path => !resolved.includes(path));
    if (missing.length) console.warn('[ADAM five-face edges] unresolved targets:', missing);
  }
}

function findNativeEdgeTemplate(scene) {
  let template = null;
  scene.traverse(object => {
    if (!template && isNativeEdge(object) && object.parent?.isMesh) template = object;
  });
  return template;
}

function syncFiveFaceEdges(scene) {
  const template = findNativeEdgeTemplate(scene);
  if (!template) return;

  // Native rebuildEdges() replaces the native line objects whenever Edge angle
  // changes. Rebuild these five at the same time so they track that control too.
  if (template !== lastNativeTemplate) {
    lastNativeTemplate = template;
    rebuild(scene, template);
  }

  // Share the native LineMaterial directly, and mirror its visibility so Edge
  // colour/opacity/width/resolution and the Edges view toggle stay identical.
  for (const line of supplementalEdges) {
    if (line.parent) line.visible = template.visible;
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  syncFiveFaceEdges(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_FIVE_FACE_EDGE_PATHS = [...EDGE_ONLY_PATHS];
window.__ADAM_FIVE_FACE_EDGES = supplementalEdges;
