import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/*
  ADAM horizontal corridor centreline cleanup
  -------------------------------------------
  The source GLB contains thin extruded ribbon meshes. EdgesGeometry exposes
  several longitudinal shell/bevel edges per ribbon, which makes the main
  horizontal corridor look like it has far more strips than it really does.

  This pass identifies every long, near-horizontal path ribbon in WORLD plan
  space and replaces only its generated rail geometry with one top-surface
  centreline per source ribbon. Vertical/branching route pieces are left alone.
*/

const HORIZONTAL_RATIO = 4.0;   // world X extent must dominate world Z extent
const MIN_WORLD_LENGTH = 2.0;   // ignore tiny decorative fragments
const GROUP_TOLERANCE_REL = 1e-6;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _corner = new THREE.Vector3();

let wrapped = false;
let lastStats = null;

function replaceGeometry(line, geometry) {
  if (!line) return;
  const previous = line.geometry;
  line.geometry = geometry;
  previous?.dispose?.();
}

function worldPlanExtents(source) {
  source.updateWorldMatrix(true, false);
  source.geometry.computeBoundingBox();
  const local = source.geometry.boundingBox;
  if (!local) return null;

  _box.makeEmpty();
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        _corner.set(
          ix ? local.max.x : local.min.x,
          iy ? local.max.y : local.min.y,
          iz ? local.max.z : local.min.z
        ).applyMatrix4(source.matrixWorld);
        _box.expandByPoint(_corner);
      }
    }
  }
  _box.getSize(_size);
  return { x:Math.abs(_size.x), z:Math.abs(_size.z) };
}

function isHorizontalCorridor(entry) {
  const source = entry?.source;
  if (!source?.geometry?.attributes?.position) return false;
  const ext = worldPlanExtents(source);
  if (!ext) return false;
  return ext.x >= MIN_WORLD_LENGTH && ext.x >= Math.max(0.001, ext.z) * HORIZONTAL_RATIO;
}

function localAxisInfo(source) {
  source.updateWorldMatrix(true, false);
  source.geometry.computeBoundingBox();
  const box = source.geometry.boundingBox;
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  const ext = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)];

  // Find the local axis that maps most strongly to world vertical Y.
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
  if (!isHorizontalCorridor(entry)) return null;

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

  return {
    path:entry.originalPath,
    before,
    after:segments.length,
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

  console.info('[ADAM horizontal corridor centreline fix]', lastStats);
  return true;
}

function wrapRebuild() {
  if (wrapped) return;
  const original = window.__ADAM_REBUILD_PATH_RAILS;
  if (typeof original !== 'function') return;

  window.__ADAM_REBUILD_PATH_RAILS = function adamRebuildWithHorizontalCentrelines(...args) {
    const result = original.apply(this, args);
    applyCentrelineFix();
    return result;
  };
  wrapped = true;
}

function install() {
  wrapRebuild();
  applyCentrelineFix();
}

install();
let attempts = 0;
const timer = setInterval(() => {
  install();
  if (wrapped && lastStats) clearInterval(timer);
  if (++attempts > 400) clearInterval(timer);
}, 25);

window.__ADAM_CENTRAL_PATH_CENTRELINES = {
  version:2,
  run:applyCentrelineFix,
  get stats(){ return lastStats; }
};
