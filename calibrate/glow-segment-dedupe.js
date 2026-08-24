import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/*
  ADAM architectural glow — world-space segment dedupe
  -----------------------------------------------------
  Diagnostic / corrective pass based on measured GLB topology:

    total expanded edge segments : 1602
    unique segments              : 1526
    coincident duplicates        :   76 (4.7%)

  This module removes ONLY coincident architectural glow segments. It does not
  change LineMaterial colour, width, opacity, blending, caps, camera, materials,
  edges, path ribbons or scene styling.

  Inner architectural glow and outer architectural halo are deduped separately,
  so the intentional two-layer glow treatment remains intact.

  Load this module BEFORE rim-glow-filter.js. The rim-glow wrapper then creates
  / syncs any supplemental layers first and calls through to this render wrapper,
  ensuring the dedupe sees the complete architectural glow set for that frame.
*/

const SOURCE = new WeakMap();
let lastSignature = '';
let lastStats = null;

const Q = 1e4;
const va = new THREE.Vector3();
const vb = new THREE.Vector3();

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function isArchitecturalGlow(line) {
  if (!line?.isLineSegments2 || !line.material || !line.geometry) return false;
  if (line.material.blending !== THREE.AdditiveBlending) return false;
  const parentPath = line.parent ? pathOf(line.parent) : '';
  return parentPath.includes('Scene_1/Main_Group/clusters/');
}

function layerKind(line) {
  return line.userData?.adamSupplementalOuterGlow ? 'outer' : 'inner';
}

function sourceFor(line) {
  let source = SOURCE.get(line);
  if (source) return source;

  const geometry = line.geometry;
  const start = geometry.getAttribute('instanceStart');
  const end = geometry.getAttribute('instanceEnd');
  if (!start || !end || start.count !== end.count) return null;

  const positions = new Float32Array(start.count * 6);
  for (let i = 0; i < start.count; i++) {
    const o = i * 6;
    positions[o] = start.getX(i);
    positions[o + 1] = start.getY(i);
    positions[o + 2] = start.getZ(i);
    positions[o + 3] = end.getX(i);
    positions[o + 4] = end.getY(i);
    positions[o + 5] = end.getZ(i);
  }

  source = {
    geometry,
    positions,
    sourceGeometryUuid: geometry.uuid,
    generatedGeometry: null
  };
  SOURCE.set(line, source);
  return source;
}

function restoreSource(line) {
  const source = sourceFor(line);
  if (!source) return null;

  if (line.geometry !== source.geometry) {
    source.generatedGeometry?.dispose?.();
    source.generatedGeometry = null;
    line.geometry = source.geometry;
  }
  return source;
}

function pointKey(v) {
  return `${Math.round(v.x * Q)},${Math.round(v.y * Q)},${Math.round(v.z * Q)}`;
}

function segmentKey(line, positions, offset) {
  va.set(positions[offset], positions[offset + 1], positions[offset + 2]).applyMatrix4(line.matrixWorld);
  vb.set(positions[offset + 3], positions[offset + 4], positions[offset + 5]).applyMatrix4(line.matrixWorld);

  const a = pointKey(va);
  const b = pointKey(vb);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function sceneGlowLines(scene) {
  const lines = [];
  scene.traverse(object => {
    if (isArchitecturalGlow(object)) lines.push(object);
  });
  return lines;
}

function signatureFor(lines) {
  return lines
    .map(line => {
      const src = sourceFor(line);
      return `${line.id}:${src?.sourceGeometryUuid || line.geometry?.uuid}:${layerKind(line)}`;
    })
    .sort()
    .join(';');
}

function buildFilteredGeometry(positions, keptIndices) {
  const filtered = new Float32Array(keptIndices.length * 6);
  for (let n = 0; n < keptIndices.length; n++) {
    const sourceOffset = keptIndices[n] * 6;
    filtered.set(positions.subarray(sourceOffset, sourceOffset + 6), n * 6);
  }
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(filtered);
  return geometry;
}

function dedupe(scene, force = false) {
  // matrixWorld is needed because the measured duplicates occur across distinct
  // meshes / instances, not merely inside one local LineSegmentsGeometry.
  scene.updateMatrixWorld(true);

  const lines = sceneGlowLines(scene);
  const signature = signatureFor(lines);
  if (!force && signature === lastSignature) return lastStats;
  lastSignature = signature;

  // Re-expand any previously filtered lines before recalculating the global
  // registry. This makes rebuilds deterministic when rim-glow or edge angle
  // changes replace / add line objects.
  for (const line of lines) restoreSource(line);
  scene.updateMatrixWorld(true);

  const seen = {
    inner: new Map(),
    outer: new Map()
  };

  let total = 0;
  let kept = 0;
  let removed = 0;
  let affectedLines = 0;
  const duplicateGroups = new Map();

  for (const line of lines) {
    const source = sourceFor(line);
    if (!source) continue;

    const kind = layerKind(line);
    const registry = seen[kind];
    const segmentCount = source.positions.length / 6;
    const keptIndices = [];

    total += segmentCount;

    for (let i = 0; i < segmentCount; i++) {
      const key = segmentKey(line, source.positions, i * 6);
      const owner = registry.get(key);

      if (!owner) {
        registry.set(key, { line, index:i, parentPath:pathOf(line.parent) });
        keptIndices.push(i);
        kept++;
        continue;
      }

      removed++;
      const groupKey = `${kind}:${key}`;
      const group = duplicateGroups.get(groupKey) || {
        kind,
        owner:owner.parentPath,
        duplicates:[]
      };
      group.duplicates.push(pathOf(line.parent));
      duplicateGroups.set(groupKey, group);
    }

    if (keptIndices.length !== segmentCount) {
      affectedLines++;
      const filtered = buildFilteredGeometry(source.positions, keptIndices);
      source.generatedGeometry = filtered;
      line.geometry = filtered;
      line.computeLineDistances?.();
    }
  }

  lastStats = {
    lines:lines.length,
    totalSegments:total,
    keptSegments:kept,
    removedSegments:removed,
    affectedLines,
    duplicateGroups:duplicateGroups.size,
    innerUnique:seen.inner.size,
    outerUnique:seen.outer.size
  };

  console.info('[ADAM glow segment dedupe]', lastStats);
  if (duplicateGroups.size) {
    console.debug('[ADAM glow segment dedupe] duplicate ownership', [...duplicateGroups.values()]);
  }

  return lastStats;
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamGlowSegmentDedupeRender(scene, camera) {
  dedupe(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_GLOW_SEGMENT_DEDUPE = {
  version:1,
  run:scene => dedupe(scene, true),
  stats:() => lastStats
};
