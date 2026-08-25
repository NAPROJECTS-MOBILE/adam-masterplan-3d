import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/*
  ADAM path ribbon shell-collapse V1
  ----------------------------------
  Each retained GLB path mesh is one intended ribbon. EdgesGeometry can expose
  several near-parallel shell / bevel edges for that single ribbon, especially
  on short pieces and bends that the straight-ribbon centreline pass correctly
  leaves alone.

  This pass works INSIDE each ribbon entry only. It groups strongly overlapping,
  near-parallel rail segments and replaces each group with one averaged rail.
  Because neighbouring intended ribbons live in separate entries, they can never
  be merged together here.
*/

const PARALLEL_DOT = Math.cos(THREE.MathUtils.degToRad(3.0));
const MIN_OVERLAP_RATIO = 0.70;
const MIN_PLAN_LENGTH = 1e-4;
const MIN_MERGE_DISTANCE = 0.012;
const MAX_MERGE_DISTANCE = 0.14;
const MERGE_DISTANCE_FRACTION = 0.045;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

let wrapped = false;
let lastStats = null;
let runs = 0;

function replaceGeometry(line, geometry) {
  if (!line) return;
  const previous = line.geometry;
  line.geometry = geometry;
  previous?.dispose?.();
}

function geometryFromSegments(segments) {
  const positions = new Float32Array(Math.max(1, segments.length) * 6);
  for (let i = 0; i < segments.length; i++) positions.set(segments[i], i * 6);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function worldInfo(source, segment) {
  _a.set(segment[0], segment[1], segment[2]).applyMatrix4(source.matrixWorld);
  _b.set(segment[3], segment[4], segment[5]).applyMatrix4(source.matrixWorld);

  let dx = _b.x - _a.x;
  let dz = _b.z - _a.z;
  const length = Math.hypot(dx, dz);

  if (length < MIN_PLAN_LENGTH) {
    return {
      segment,
      a:_a.clone(),
      b:_b.clone(),
      midX:(_a.x + _b.x) * 0.5,
      midZ:(_a.z + _b.z) * 0.5,
      midY:(_a.y + _b.y) * 0.5,
      dirX:0,
      dirZ:0,
      length,
      degenerate:true
    };
  }

  dx /= length;
  dz /= length;

  // Canonical direction so opposite endpoint ordering still compares cleanly.
  let reversed = false;
  if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dz < 0)) {
    dx = -dx;
    dz = -dz;
    reversed = true;
  }

  return {
    segment,
    a:_a.clone(),
    b:_b.clone(),
    midX:(_a.x + _b.x) * 0.5,
    midZ:(_a.z + _b.z) * 0.5,
    midY:(_a.y + _b.y) * 0.5,
    dirX:dx,
    dirZ:dz,
    length,
    reversed,
    degenerate:false
  };
}

function intervalAlong(info, originX, originZ, dirX, dirZ) {
  const t0 = (info.a.x - originX) * dirX + (info.a.z - originZ) * dirZ;
  const t1 = (info.b.x - originX) * dirX + (info.b.z - originZ) * dirZ;
  return [Math.min(t0, t1), Math.max(t0, t1)];
}

function overlapRatio(seed, other) {
  const [a0, a1] = intervalAlong(seed, seed.midX, seed.midZ, seed.dirX, seed.dirZ);
  const [b0, b1] = intervalAlong(other, seed.midX, seed.midZ, seed.dirX, seed.dirZ);
  const overlap = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return overlap / Math.max(MIN_PLAN_LENGTH, Math.min(seed.length, other.length));
}

function perpendicularDistance(seed, other) {
  const mx = other.midX - seed.midX;
  const mz = other.midZ - seed.midZ;
  return Math.abs(mx * (-seed.dirZ) + mz * seed.dirX);
}

function canMerge(seed, other) {
  if (seed.degenerate || other.degenerate) return false;

  const dot = seed.dirX * other.dirX + seed.dirZ * other.dirZ;
  if (dot < PARALLEL_DOT) return false;

  if (overlapRatio(seed, other) < MIN_OVERLAP_RATIO) return false;

  const distanceLimit = THREE.MathUtils.clamp(
    Math.min(seed.length, other.length) * MERGE_DISTANCE_FRACTION,
    MIN_MERGE_DISTANCE,
    MAX_MERGE_DISTANCE
  );
  if (perpendicularDistance(seed, other) > distanceLimit) return false;

  return true;
}

function alignedLocalSegment(info, seed) {
  const segment = info.segment;
  const dot = seed.dirX * info.dirX + seed.dirZ * info.dirZ;
  // Directions are canonical, but the raw local endpoint order may be opposite.
  const rawWorldDx = info.b.x - info.a.x;
  const rawWorldDz = info.b.z - info.a.z;
  const rawDot = rawWorldDx * seed.dirX + rawWorldDz * seed.dirZ;
  if (dot >= 0 && rawDot >= 0) return segment;
  return [segment[3], segment[4], segment[5], segment[0], segment[1], segment[2]];
}

function averagedSegment(cluster, seed) {
  if (cluster.length === 1) return [...cluster[0].segment];

  const sum = [0, 0, 0, 0, 0, 0];
  for (const info of cluster) {
    const segment = alignedLocalSegment(info, seed);
    for (let i = 0; i < 6; i++) sum[i] += segment[i];
  }
  for (let i = 0; i < 6; i++) sum[i] /= cluster.length;
  return sum;
}

function collapseSegments(source, segmentData) {
  if (!source || !Array.isArray(segmentData) || segmentData.length < 2) {
    return { segments:segmentData || [], mergedGroups:0, removed:0 };
  }

  source.updateWorldMatrix(true, false);
  const infos = segmentData.map(segment => worldInfo(source, segment));
  const used = new Array(infos.length).fill(false);
  const output = [];
  let mergedGroups = 0;

  for (let i = 0; i < infos.length; i++) {
    if (used[i]) continue;
    const seed = infos[i];
    used[i] = true;

    const cluster = [seed];
    for (let j = i + 1; j < infos.length; j++) {
      if (used[j]) continue;
      if (!canMerge(seed, infos[j])) continue;
      used[j] = true;
      cluster.push(infos[j]);
    }

    if (cluster.length > 1) mergedGroups++;
    output.push(averagedSegment(cluster, seed));
  }

  return {
    segments:output,
    mergedGroups,
    removed:segmentData.length - output.length
  };
}

function applyEntry(entry) {
  const before = entry?.segmentData?.length || 0;
  if (!entry?.source || before < 2) {
    return { path:entry?.originalPath, before, after:before, removed:0, mergedGroups:0 };
  }

  const result = collapseSegments(entry.source, entry.segmentData);
  if (result.removed <= 0) {
    return { path:entry.originalPath, before, after:before, removed:0, mergedGroups:0 };
  }

  entry.segmentData = result.segments;
  entry.segments = result.segments.length;

  const base = geometryFromSegments(result.segments);
  replaceGeometry(entry.outer, base);
  replaceGeometry(entry.inner, base.clone());
  replaceGeometry(entry.edge, base.clone());
  replaceGeometry(entry.pulseSoft, base.clone());
  replaceGeometry(entry.pulseCore, base.clone());

  const independent = window.__ADAM_PATH_PULSE_RHYTHM?.overlays?.get?.(entry);
  if (independent) {
    replaceGeometry(independent.halo, entry.inner.geometry.clone());
    replaceGeometry(independent.core, entry.inner.geometry.clone());
  }

  return {
    path:entry.originalPath,
    before,
    after:result.segments.length,
    removed:result.removed,
    mergedGroups:result.mergedGroups
  };
}

function applyAll() {
  const entries = window.__ADAM_PATH_PULSE?.entries || window.__ADAM_PATH_RAIL_LAYERS;
  if (!Array.isArray(entries) || !entries.length) return false;

  const details = entries.map(applyEntry);
  runs++;
  lastStats = {
    version:1,
    runs,
    ribbons:entries.length,
    changedRibbons:details.filter(item => item.removed > 0).length,
    before:details.reduce((sum, item) => sum + item.before, 0),
    after:details.reduce((sum, item) => sum + item.after, 0),
    removed:details.reduce((sum, item) => sum + item.removed, 0),
    mergedGroups:details.reduce((sum, item) => sum + item.mergedGroups, 0),
    details
  };

  console.info('[ADAM path ribbon shell-collapse V1]', {
    ribbons:lastStats.ribbons,
    changedRibbons:lastStats.changedRibbons,
    before:lastStats.before,
    after:lastStats.after,
    removed:lastStats.removed,
    mergedGroups:lastStats.mergedGroups
  });

  return true;
}

function wrapRebuild() {
  if (wrapped) return;
  const previous = window.__ADAM_REBUILD_PATH_RAILS;
  if (typeof previous !== 'function') return;

  window.__ADAM_REBUILD_PATH_RAILS = function adamRebuildWithShellCollapse(...args) {
    const result = previous.apply(this, args);
    applyAll();
    return result;
  };
  wrapped = true;
}

function install() {
  wrapRebuild();
  applyAll();
}

install();
let attempts = 0;
const timer = setInterval(() => {
  install();
  if (wrapped && lastStats) clearInterval(timer);
  if (++attempts > 500) clearInterval(timer);
}, 25);

window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE = {
  version:1,
  run:applyAll,
  get stats(){ return lastStats; }
};
