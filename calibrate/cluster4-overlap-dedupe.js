import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  Cluster 4 overlap de-duplication
  --------------------------------
  Spline contains two visible Rectangle meshes in cluster 4 / Group 2 and an
  extra overlapping Rectangle pair elsewhere in the exported hierarchy. Those
  stacked meshes fight the face-material controls because one copy can retain
  the global Building material while the other receives Object Material 2.

  Keep the two Group_2 meshes as the authoritative render objects:
    - Group_2/Rectangle_2 remains eligible for Object Material 2.
    - Group_2/Rectangle_3 remains a normal Building-material object.

  Before app-v2 classifies/builds edge layers, suppress ONLY other Rectangle
  meshes whose world-space bounds and geometry counts match one of those two
  authoritative meshes at the same location. No broad name-only hiding.
*/

const AUTHORITATIVE_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_3'
];

const GROUP_2_PREFIX = 'Scene_1/Main_Group/clusters/cluster_4_/Group_2/';
const suppressed = [];

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function worldBox(mesh) {
  return new THREE.Box3().setFromObject(mesh);
}

function boxSignature(mesh) {
  const box = worldBox(mesh);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const posCount = mesh.geometry?.attributes?.position?.count ?? -1;
  const indexCount = mesh.geometry?.index?.count ?? -1;
  return { box, centre, size, posCount, indexCount };
}

function maxAbs3(v) {
  return Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
}

function nearVec(a, b, tolerance) {
  return Math.abs(a.x - b.x) <= tolerance &&
         Math.abs(a.y - b.y) <= tolerance &&
         Math.abs(a.z - b.z) <= tolerance;
}

function sameRenderedBlock(a, b) {
  if (a.posCount !== b.posCount) return false;
  if (a.indexCount !== b.indexCount) return false;

  const scale = Math.max(1, maxAbs3(a.size), maxAbs3(b.size));
  const tolerance = scale * 1e-4;
  return nearVec(a.centre, b.centre, tolerance) &&
         nearVec(a.size, b.size, tolerance);
}

function suppressExactOverlaps(root) {
  suppressed.length = 0;
  root?.updateWorldMatrix?.(true, true);

  const allMeshes = [];
  const byPath = new Map();
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const path = pathOf(object);
    allMeshes.push({ mesh:object, path });
    byPath.set(path, object);
  });

  const authorities = AUTHORITATIVE_PATHS
    .map(path => ({ path, mesh:byPath.get(path) }))
    .filter(entry => entry.mesh)
    .map(entry => ({ ...entry, sig:boxSignature(entry.mesh) }));

  if (authorities.length !== AUTHORITATIVE_PATHS.length) {
    const found = new Set(authorities.map(entry => entry.path));
    console.warn('[ADAM cluster4 dedupe] authoritative rectangle missing:',
      AUTHORITATIVE_PATHS.filter(path => !found.has(path)));
  }

  for (const candidate of allMeshes) {
    if (AUTHORITATIVE_PATHS.includes(candidate.path)) continue;
    if (candidate.path.startsWith(GROUP_2_PREFIX)) continue;
    if (!/^Rectangle(?:_\d+)?$/.test(candidate.mesh.name || '')) continue;

    const sig = boxSignature(candidate.mesh);
    const match = authorities.find(authority => sameRenderedBlock(sig, authority.sig));
    if (!match) continue;

    candidate.mesh.visible = false;
    candidate.mesh.userData.adamSuppressedDuplicate = true;
    candidate.mesh.userData.adamDuplicateOf = match.path;
    suppressed.push({
      duplicatePath:candidate.path,
      authoritativePath:match.path
    });
  }

  if (suppressed.length) {
    console.info('[ADAM cluster4 dedupe] suppressed exact overlapping rectangle duplicate(s):', suppressed);
  } else {
    console.warn('[ADAM cluster4 dedupe] no exact overlapping rectangle duplicates were found; nothing was hidden.');
  }
}

// Load this module before Object Material 2 and app-v2. The suppression happens
// immediately after GLTF parsing, before the rest of the calibrator classifies
// meshes or creates edge/glow children, so hidden duplicates cannot leak a
// second material/edge render on top of the authoritative blocks.
const previousLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCluster4DedupeLoad(...args) {
  try {
    const gltf = await previousLoadAsync.apply(this, args);
    suppressExactOverlaps(gltf?.scene);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = previousLoadAsync;
  }
};

window.__ADAM_CLUSTER4_SUPPRESSED_DUPLICATES = suppressed;
window.__ADAM_CLUSTER4_DEDUPE_TARGETS = AUTHORITATIVE_PATHS;
