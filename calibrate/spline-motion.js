// ADAM calibration motion wrapper — v5.15 / remove rising Rectangle_7 duplicate
//
// The screenshot after v5.14 shows why the previous detector was too strict:
// the remaining duplicate is BELOW the accepted Rectangle_7 at rest and then
// rises upward with b2/b2a. It therefore cannot have the same complete world
// matrix as the retained block before playback.
//
// v5.15 identifies the unwanted copy by what is visually invariant instead:
//   1. it is another mesh inside cluster_1/b2;
//   2. it has the same Rectangle_7 geometry/topology;
//   3. its WORLD X/Z footprint is aligned with the retained Rectangle_7;
//   4. Y is deliberately ignored, because Y is exactly where the bad copy is
//      displaced and animated.
//
// Any matching vertical-stack twin is PHYSICALLY REMOVED from the scene graph.
// Nothing is hidden. Nearby parallel roof bars survive because their X/Z
// centres do not align with Rectangle_7. The retained Rectangle_7 is then moved
// out of the b2a hierarchy before motion evaluation so it remains static.

import * as THREE from 'three';

const V512 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';
import { createSplineMotion as createV512SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

const RECTANGLE_7_PATH = 'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7';
const CLUSTER_1_PATH = 'Scene_1/Main_Group/clusters/cluster_1';
const B2_PREFIX = 'Scene_1/Main_Group/clusters/cluster_1/b2/';

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function findByPath(model, path) {
  let hit = null;
  model.traverse(object => {
    if (!hit && pathOf(object) === path) hit = object;
  });
  return hit;
}

function forceVisible(node) {
  if (!node) return;
  node.visible = true;
  node.traverse(child => { child.visible = true; });
}

function geometryShape(geometry) {
  if (!geometry) return null;
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const size = bb ? bb.getSize(new THREE.Vector3()) : new THREE.Vector3();
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)]
    .sort((a, b) => a - b);
  return {
    positionCount: geometry.attributes?.position?.count ?? -1,
    indexCount: geometry.index?.count ?? -1,
    dims
  };
}

function close(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

function sameGeometryFamily(a, b) {
  if (!a?.geometry || !b?.geometry) return false;
  if (a.geometry === b.geometry) return true;

  const ga = geometryShape(a.geometry);
  const gb = geometryShape(b.geometry);
  if (!ga || !gb) return false;
  if (ga.positionCount !== gb.positionCount || ga.indexCount !== gb.indexCount) return false;

  const dimScale = Math.max(...ga.dims, ...gb.dims, 1);
  const dimEps = dimScale * 1e-5;
  return ga.dims.every((v, i) => close(v, gb.dims[i], dimEps));
}

function worldBox(mesh) {
  return new THREE.Box3().setFromObject(mesh);
}

function sameXZFootprint(candidate, reference) {
  const rb = worldBox(reference);
  const cb = worldBox(candidate);
  if (rb.isEmpty() || cb.isEmpty()) return false;

  const rc = rb.getCenter(new THREE.Vector3());
  const cc = cb.getCenter(new THREE.Vector3());
  const rs = rb.getSize(new THREE.Vector3());
  const cs = cb.getSize(new THREE.Vector3());

  // Relative tolerance only in plan. The bad copy may be arbitrarily displaced
  // in Y, and its Y size may also be collapsed by an animated parent state.
  const planScale = Math.max(rs.x, rs.z, cs.x, cs.z, 1e-4);
  const centreEps = Math.max(1e-5, planScale * 0.035);
  const sizeEps = Math.max(1e-5, planScale * 0.035);

  return (
    close(rc.x, cc.x, centreEps) &&
    close(rc.z, cc.z, centreEps) &&
    close(rs.x, cs.x, sizeEps) &&
    close(rs.z, cs.z, sizeEps)
  );
}

function removeVerticalRectangle7Twins(model, rectangle7, opts) {
  if (!rectangle7?.isMesh) return { removed: [], audited: [] };

  model.updateMatrixWorld(true);
  const removed = [];
  const audited = [];
  const toRemove = [];
  const refBox = worldBox(rectangle7);
  const refCenter = refBox.getCenter(new THREE.Vector3());

  model.traverse(object => {
    if (object === rectangle7 || !object.isMesh || !object.parent) return;

    const path = pathOf(object);
    if (!path.startsWith(B2_PREFIX)) return;
    if (!sameGeometryFamily(object, rectangle7)) return;

    const box = worldBox(object);
    const center = box.getCenter(new THREE.Vector3());
    const aligned = sameXZFootprint(object, rectangle7);

    audited.push({
      path,
      alignedXZ: aligned,
      deltaX: center.x - refCenter.x,
      deltaY: center.y - refCenter.y,
      deltaZ: center.z - refCenter.z
    });

    if (aligned) toRemove.push(object);
  });

  // Collect first, remove second: never mutate the tree during traverse().
  for (const twin of toRemove) {
    if (!twin.parent) continue;
    const path = pathOf(twin);
    twin.parent.remove(twin);
    removed.push(path || twin.name || '(unnamed Rectangle_7 vertical twin)');
  }

  model.updateMatrixWorld(true);

  if (opts?.debug) {
    console.group('[ADAM calibration] Rectangle_7 vertical-stack audit');
    console.table(audited);
    console.log('physically removed aligned twins:', removed);
    console.groupEnd();
  }

  return { removed, audited };
}

function attachToCluster(node, cluster, model) {
  if (!node || !cluster) return false;
  model.updateMatrixWorld(true);
  if (node.parent !== cluster) cluster.attach(node);
  forceVisible(node);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
  model.updateMatrixWorld(true);
  return true;
}

export function createSplineMotion(model, opts = {}) {
  // Capture the accepted object at the exact user-confirmed GLB path.
  const rectangle7 = findByPath(model, RECTANGLE_7_PATH);
  const cluster1 = findByPath(model, CLUSTER_1_PATH);
  const originalSourcePath = rectangle7 ? pathOf(rectangle7) : RECTANGLE_7_PATH;

  // Remove copies stacked under/over the same plan footprint BEFORE any b2/b2a
  // transform is sampled. This is the key difference from the v5.14 matrix test.
  const twinAudit = removeVerticalRectangle7Twins(model, rectangle7, opts);

  // Keep the one accepted Rectangle_7 entirely outside the animated b2a branch.
  const heldBeforeMotion = attachToCluster(rectangle7, cluster1, model);

  // Preserve the complete accepted v5.12 chain for every other object.
  const motion = createV512SplineMotion(model, opts);

  attachToCluster(rectangle7, cluster1, model);

  const baseReset = motion.reset?.bind(motion);
  if (baseReset) {
    motion.reset = () => {
      baseReset();
      attachToCluster(rectangle7, cluster1, model);
    };
  }

  motion.rectangle7HeldStatic = heldBeforeMotion;
  motion.rectangle7SourcePath = originalSourcePath;
  motion.removedRectangle7Twins = twinAudit.removed;
  motion.rectangle7TwinAudit = twinAudit.audited;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.15 Rectangle_7 cleanup');
    console.log('base motion source:', V512);
    console.log('Rectangle_7 source path:', originalSourcePath);
    console.log('physically removed Rectangle_7 vertical twins:', twinAudit.removed);
    console.log('retained Rectangle_7 held outside b2a:', heldBeforeMotion);
    console.log('retained runtime parent:', rectangle7?.parent?.name || '(none)');
    console.groupEnd();
  }

  return motion;
}
