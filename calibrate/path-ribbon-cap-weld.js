import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/*
  ADAM path ribbon cap-weld V1
  ----------------------------
  After shell-collapse, some ribbons still contain several perfectly collinear
  segments. LineSegments2 gives each segment its own cap, which can show as a
  small bright dot at internal joins. Weld only collinear touching neighbours
  into longer segments. Real corners and route endpoints remain untouched.
*/

const COS_TOLERANCE = Math.cos(1.5 * Math.PI / 180);
let wrapped = false;
let stats = null;

function geometryFromSegments(segments) {
  const positions = new Float32Array(Math.max(1, segments.length) * 6);
  for (let i = 0; i < segments.length; i++) positions.set(segments[i], i * 6);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function replaceGeometry(line, geometry) {
  if (!line) return;
  const previous = line.geometry;
  line.geometry = geometry;
  previous?.dispose?.();
}

function point(segment, end) {
  const i = end ? 3 : 0;
  return [segment[i], segment[i + 1], segment[i + 2]];
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function direction(segment) {
  const dx = segment[3] - segment[0];
  const dy = segment[4] - segment[1];
  const dz = segment[5] - segment[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-12) return null;
  return [dx / len, dy / len, dz / len];
}

function parallel(a, b) {
  const da = direction(a);
  const db = direction(b);
  if (!da || !db) return false;
  return Math.abs(da[0] * db[0] + da[1] * db[1] + da[2] * db[2]) >= COS_TOLERANCE;
}

function bboxTolerance(source) {
  source?.geometry?.computeBoundingBox?.();
  const box = source?.geometry?.boundingBox;
  if (!box) return 1e-5;
  const dx = box.max.x - box.min.x;
  const dy = box.max.y - box.min.y;
  const dz = box.max.z - box.min.z;
  return Math.max(1e-5, Math.hypot(dx, dy, dz) * 2e-5);
}

function tryMerge(a, b, tolerance2) {
  if (!parallel(a, b)) return null;

  const a0 = point(a, false);
  const a1 = point(a, true);
  const b0 = point(b, false);
  const b1 = point(b, true);

  if (dist2(a1, b0) <= tolerance2) return [...a0, ...b1];
  if (dist2(a1, b1) <= tolerance2) return [...a0, ...b0];
  if (dist2(a0, b1) <= tolerance2) return [...b0, ...a1];
  if (dist2(a0, b0) <= tolerance2) return [...b1, ...a1];
  return null;
}

function weldSegments(source, input) {
  if (!Array.isArray(input) || input.length < 2) return input || [];

  const tolerance = bboxTolerance(source);
  const tolerance2 = tolerance * tolerance;
  const segments = input.map(segment => [...segment]);

  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const merged = tryMerge(segments[i], segments[j], tolerance2);
        if (!merged) continue;
        segments[i] = merged;
        segments.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }

  return segments;
}

function applyEntry(entry) {
  const before = entry?.segmentData?.length || 0;
  if (!entry?.source || before < 2) return { before, after:before };

  const welded = weldSegments(entry.source, entry.segmentData);
  if (welded.length === before) return { before, after:before };

  entry.segmentData = welded;
  entry.segments = welded.length;

  const base = geometryFromSegments(welded);
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

  return { before, after:welded.length };
}

function applyAll() {
  const entries = window.__ADAM_PATH_PULSE?.entries || window.__ADAM_PATH_RAIL_LAYERS;
  if (!Array.isArray(entries) || !entries.length) return false;

  let before = 0;
  let after = 0;
  let changed = 0;
  for (const entry of entries) {
    const result = applyEntry(entry);
    before += result.before;
    after += result.after;
    if (result.after < result.before) changed++;
  }

  stats = { ribbons:entries.length, changedRibbons:changed, before, after, welded:before - after };
  console.info('[ADAM path ribbon cap-weld V1]', stats);
  return true;
}

function wrapRebuild() {
  if (wrapped) return;
  const previous = window.__ADAM_REBUILD_PATH_RAILS;
  if (typeof previous !== 'function') return;

  window.__ADAM_REBUILD_PATH_RAILS = function adamRebuildWithCapWeld(...args) {
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
  if (wrapped && stats) clearInterval(timer);
  if (++attempts > 500) clearInterval(timer);
}, 25);

window.__ADAM_PATH_RIBBON_CAP_WELD = {
  version:1,
  run:applyAll,
  get stats(){ return stats; }
};
