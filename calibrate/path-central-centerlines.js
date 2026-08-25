import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import './path-ribbon-shell-collapse.js?v=shell-collapse-v1-20260825-2332';

/*
  ADAM long straight path centreline cleanup V3
  ----------------------------------------------
  Thin extruded ribbon meshes expose several shell/bevel edges through
  EdgesGeometry. For long straight route pieces that makes one intended ribbon
  look like several parallel strips.

  V3 detects long STRAIGHT ribbons in world X/Z using a simple 2D PCA, so the
  cleanup works regardless of whether the ribbon runs horizontally, vertically
  or diagonally in plan. Short junctions / bends are left untouched.
*/

const MIN_WORLD_LENGTH = 2.0;
const MIN_PLAN_ASPECT = 4.0;
const GROUP_TOLERANCE_REL = 1e-6;

const _world = new THREE.Vector3();

let wrapped = false;
let lastStats = null;

function replaceGeometry(line, geometry) {
  if (!line) return;
  const previous = line.geometry;
  line.geometry = geometry;
  previous?.dispose?.();
}

function straightnessInfo(source) {
  const position = source?.geometry?.attributes?.position;
  if (!position || position.count < 4) return null;

  source.updateWorldMatrix(true, false);

  let meanX = 0;
  let meanZ = 0;
  for (let i = 0; i < position.count; i++) {
    _world.fromBufferAttribute(position, i).applyMatrix4(source.matrixWorld);
    meanX += _world.x;
    meanZ += _world.z;
  }
  meanX /= position.count;
  meanZ /= position.count;

  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (let i = 0; i < position.count; i++) {
    _world.fromBufferAttribute(position, i).applyMatrix4(source.matrixWorld);
    const dx = _world.x - meanX;
    const dz = _world.z - meanZ;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }
  xx /= position.count;
  xz /= position.count;
  zz /= position.count;

  const trace = xx + zz;
  const root = Math.sqrt(Math.max(0, (xx - zz) * (xx - zz) + 4 * xz * xz));
  const lambda1 = Math.max(0, (trace + root) * 0.5);
  const lambda2 = Math.max(1e-12, (trace - root) * 0.5);

  let dirX = xz;
  let dirZ = lambda1 - xx;
  if (Math.abs(dirX) + Math.abs(dirZ) < 1e-9) {
    dirX = 1;
    dirZ = 0;
  }
  const invLen = 1 / Math.max(1e-9, Math.hypot(dirX, dirZ));
  dirX *= invLen;
  dirZ *= invLen;

  let minAlong = Infinity;
  let maxAlong = -Infinity;
  for (let i = 0; i < position.count; i++) {
    _world.fromBufferAttribute(position, i).applyMatrix4(source.matrixWorld);
    const along = (_world.x - meanX) * dirX + (_world.z - meanZ) * dirZ;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
  }

  const length = Math.max(0, maxAlong - minAlong);
  const aspect = Math.sqrt(lambda1 / lambda2);
  return { length, aspect, dirX, dirZ };
}

function isLongStraightRibbon(entry) {
  const info = straightnessInfo(entry?.source);
  if (!info) return false;
  return info.length >= MIN_WORLD_LENGTH && info.aspect >= MIN_PLAN_ASPECT;
}

function localAxisInfo(source) {
  source.updateWorldMatrix(true, false);
  source.geometry.computeBoundingBox();
  const box = source.geometry.boundingBox;
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  const ext = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)];

  const e = source.matrixWorld.elements;
  const worldYContribution = [Math.abs(e[1]), Math.abs(e[5]), Math.abs(e[9])];
  let verticalAxis = 0;
  if (worldYContribution[1] > worldYContribution[verticalAxis]) verticalAxis = 1;
  if (worldYContribution[2] > worldYContribution[verticalAxis]) verticalAxis = 2;

  const planar = [0, 1, 2].filter(axis => axis !== verticalAxis);
  const lengthAxis = ext[planar[0]] >= ext[planar[1]] ? planar[0] : planar[1];
  const lateralAxis = planar[0] === lengthAxis ? planar[1] : planar[0];
  const verticalSign = [e[1], e[5], e[9]][verticalAxis] >= 0 ? 1 : -1;

  return { verticalAxis, lengthAxis, lateralAxis, verticalSign, lengthExtent:ext[lengthAxis] };
}

function valueAt(position, index, axis) {
  if (axis === 0) return position.getX(index);
  if (axis === 1) return position.getY(index);
  return position.getZ(index);
}

function makeLocalPoint(values, axes) {
  const p = [0, 0, 0];
  p[axes.lengthAxis] = values.length;
  p[axes.lateralAxis] = values.lateral;
  p[axes.verticalAxis] = values.vertical;
  return p;
}

function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) * 0.5;
}

function centrelineSegments(source) {
  const position = source?.geometry?.attributes?.position;
  const axes = localAxisInfo(source);
  if (!position || !axes || position.count < 2 || axes.lengthExtent <= 0) return [];

  const tolerance = Math.max(1e-4, axes.lengthExtent * GROUP_TOLERANCE_REL);
  const groups = new Map();

  for (let i = 0; i < position.count; i++) {
    const s = valueAt(position, i, axes.lengthAxis);
    const lateral = valueAt(position, i, axes.lateralAxis);
    const vertical = valueAt(position, i, axes.verticalAxis);
    const key = Math.round(s / tolerance);

    let group = groups.get(key);
    if (!group) {
      group = { length:[], lateral:[], vertical:[] };
      groups.set(key, group);
    }
    group.length.push(s);
    group.lateral.push(lateral);
    group.vertical.push(vertical);
  }

  const points = [];
  for (const group of groups.values()) {
    const length = median(group.length);
    const lateral = median(group.lateral);
    const vertical = axes.verticalSign > 0
      ? Math.max(...group.vertical)
      : Math.min(...group.vertical);
    points.push(makeLocalPoint({ length, lateral, vertical }, axes));
  }

  points.sort((a, b) => a[axes.lengthAxis] - b[axes.lengthAxis]);
  if (points.length < 2) return [];

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    segments.push([a[0], a[1], a[2], b[0], b[1], b[2]]);
  }
  return segments;
}

function geometryFromSegments(segments) {
  const positions = new Float32Array(Math.max(1, segments.length) * 6);
  for (let i = 0; i < segments.length; i++) positions.set(segments[i], i * 6);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function fixEntry(entry) {
  if (!isLongStraightRibbon(entry)) return null;

  const before = entry.segmentData?.length || 0;
  const segments = centrelineSegments(entry.source);
  if (!segments.length) return { path:entry.originalPath, before, after:before, changed:false };

  entry.segmentData = segments;
  entry.segments = segments.length;

  const base = geometryFromSegments(segments);
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

  const info = straightnessInfo(entry.source);
  return {
    path:entry.originalPath,
    before,
    after:segments.length,
    length:Number(info?.length?.toFixed?.(3) || 0),
    aspect:Number(info?.aspect?.toFixed?.(2) || 0),
    changed:true
  };
}

function applyCentrelineFix() {
  const entries = window.__ADAM_PATH_PULSE?.entries || window.__ADAM_PATH_RAIL_LAYERS;
  if (!Array.isArray(entries) || !entries.length) return false;

  const details = entries.map(fixEntry).filter(Boolean);
  if (!details.length) return false;

  lastStats = {
    targetRibbons:details.length,
    changedRibbons:details.filter(item => item.changed).length,
    before:details.reduce((sum, item) => sum + item.before, 0),
    after:details.reduce((sum, item) => sum + item.after, 0),
    details
  };

  console.info('[ADAM long straight path centreline fix V3]', lastStats);
  return true;
}

function wrapRebuild() {
  if (wrapped) return;
  const original = window.__ADAM_REBUILD_PATH_RAILS;
  if (typeof original !== 'function') return;

  window.__ADAM_REBUILD_PATH_RAILS = function adamRebuildWithStraightCentrelines(...args) {
    const result = original.apply(this, args);
    applyCentrelineFix();
    window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE?.run?.();
    return result;
  };
  wrapped = true;
}

function install() {
  wrapRebuild();
  applyCentrelineFix();
  window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE?.run?.();
}

install();
let attempts = 0;
const timer = setInterval(() => {
  install();
  if (wrapped && lastStats) clearInterval(timer);
  if (++attempts > 400) clearInterval(timer);
}, 25);

const api = {
  version:3.1,
  run(){
    const result = applyCentrelineFix();
    window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE?.run?.();
    return result;
  },
  get stats(){ return lastStats; }
};

window.__ADAM_PATH_STRAIGHT_CENTRELINES = api;
window.__ADAM_CENTRAL_PATH_CENTRELINES = api;
