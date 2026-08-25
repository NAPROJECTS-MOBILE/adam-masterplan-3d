import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/*
  ADAM path rail plan-space de-duplication
  ---------------------------------------
  Spline/GLB ribbon meshes are very thin extrusions. EdgesGeometry can therefore
  return the same visible plan-space rail more than once (top/bottom shell edges,
  plus coincident feature edges). On the long central corridor this made the
  strip bundle visibly denser than the source layout.

  Collapse only truly coincident X/Z segments and keep the uppermost world-Y
  copy. Distinct neighbouring ribbons remain untouched.
*/

const PLAN_QUANTIZE = 100000; // 1e-5 world-unit plan tolerance
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

let runs = 0;
let lastStats = null;
let wrapped = false;

function q(value) {
  return Math.round(value * PLAN_QUANTIZE);
}

function canonicalPlanKey(a, b) {
  let ax = q(a.x), az = q(a.z), bx = q(b.x), bz = q(b.z);
  if (ax > bx || (ax === bx && az > bz)) {
    [ax, bx] = [bx, ax];
    [az, bz] = [bz, az];
  }
  return `${ax},${az}|${bx},${bz}`;
}

function buildGeometry(segmentData) {
  const positions = new Float32Array(Math.max(1, segmentData.length) * 6);
  for (let i = 0; i < segmentData.length; i++) positions.set(segmentData[i], i * 6);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function replaceGeometry(line, geometry) {
  if (!line) return;
  const old = line.geometry;
  line.geometry = geometry;
  old?.dispose?.();
}

function dedupeEntry(entry) {
  const source = entry?.source;
  const input = entry?.segmentData;
  if (!source || !Array.isArray(input) || input.length < 2) {
    return { before:input?.length || 0, after:input?.length || 0, removed:0 };
  }

  source.updateWorldMatrix(true, false);
  const matrix = source.matrixWorld;
  const selected = new Map();

  for (const segment of input) {
    if (!segment || segment.length < 6) continue;

    _a.set(segment[0], segment[1], segment[2]).applyMatrix4(matrix);
    _b.set(segment[3], segment[4], segment[5]).applyMatrix4(matrix);

    const key = canonicalPlanKey(_a, _b);
    const worldY = (_a.y + _b.y) * 0.5;
    const previous = selected.get(key);

    // Same visible X/Z rail: retain only the upper shell edge.
    if (!previous || worldY > previous.worldY) {
      selected.set(key, { segment:[...segment], worldY });
    }
  }

  const deduped = [...selected.values()].map(item => item.segment);
  if (!deduped.length || deduped.length === input.length) {
    return { before:input.length, after:input.length, removed:0 };
  }

  entry.segmentData = deduped;
  entry.segments = deduped.length;

  const base = buildGeometry(deduped);
  replaceGeometry(entry.outer, base);
  replaceGeometry(entry.inner, base.clone());
  replaceGeometry(entry.edge, base.clone());
  replaceGeometry(entry.pulseSoft, base.clone());
  replaceGeometry(entry.pulseCore, base.clone());

  // If the independent whole-strip pulse has already initialized, keep its
  // overlays on exactly the same cleaned geometry.
  const pulseState = window.__ADAM_PATH_PULSE_RHYTHM?.overlays?.get?.(entry);
  if (pulseState) {
    replaceGeometry(pulseState.halo, entry.inner.geometry.clone());
    replaceGeometry(pulseState.core, entry.inner.geometry.clone());
  }

  return {
    before:input.length,
    after:deduped.length,
    removed:input.length - deduped.length
  };
}

function dedupeAll() {
  const entries = window.__ADAM_PATH_PULSE?.entries || window.__ADAM_PATH_RAIL_LAYERS;
  if (!Array.isArray(entries) || !entries.length) return false;

  let before = 0;
  let after = 0;
  let changedEntries = 0;
  const details = [];

  for (const entry of entries) {
    const result = dedupeEntry(entry);
    before += result.before;
    after += result.after;
    if (result.removed > 0) changedEntries++;
    details.push({
      path:entry.originalPath,
      before:result.before,
      after:result.after,
      removed:result.removed
    });
  }

  runs++;
  lastStats = {
    runs,
    ribbons:entries.length,
    changedEntries,
    before,
    after,
    removed:before - after,
    reductionPct:before ? ((before - after) / before) * 100 : 0,
    details
  };

  console.info('[ADAM path rail plan dedupe]', {
    ribbons:lastStats.ribbons,
    changedEntries:lastStats.changedEntries,
    before:lastStats.before,
    after:lastStats.after,
    removed:lastStats.removed,
    reductionPct:Number(lastStats.reductionPct.toFixed(1))
  });

  return true;
}

function wrapRebuild() {
  if (wrapped) return;
  const original = window.__ADAM_REBUILD_PATH_RAILS;
  if (typeof original !== 'function') return;

  wrapped = true;
  window.__ADAM_REBUILD_PATH_RAILS = function adamRebuildDedupedPathRails(...args) {
    const result = original.apply(this, args);
    dedupeAll();
    return result;
  };
}

function install() {
  wrapRebuild();
  dedupeAll();
}

install();

let attempts = 0;
const timer = setInterval(() => {
  install();
  if (wrapped && lastStats) clearInterval(timer);
  if (++attempts > 400) clearInterval(timer);
}, 25);

window.__ADAM_PATH_RAIL_PLAN_DEDUPE = {
  version:1,
  run:dedupeAll,
  get stats(){ return lastStats; }
};
