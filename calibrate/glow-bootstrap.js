import * as THREE from 'three';
import { FORCE_GLOW_PATHS } from './glow-targets.js';

// The calibrator decides whether a mesh receives the shared architectural
// edge/glow pair from its world-space Y extent. Some of the user-confirmed
// architecture is deliberately very thin, so it falls below FLAT_THRESHOLD
// even though it must use the same pale-lime edge + soft glow as the rest.
//
// Temporarily patch Box3 classification only while app-v2 initializes. We do
// NOT alter geometry or real bounds: getSize() reports a synthetic Y extent
// just above the classifier threshold for explicitly whitelisted meshes. The
// original Box3 methods are restored as soon as app-v2 has finished booting.

const FORCE_Y_EXTENT = 0.100001;
const tagged = Symbol('adamForceGlowTarget');
const seen = new Set();

function objectPath(o) {
  const parts = [];
  let p = o;
  while (p) {
    if (p.name) parts.push(p.name);
    p = p.parent;
  }
  return parts.reverse().join('/');
}

const originalSetFromObject = THREE.Box3.prototype.setFromObject;
const originalGetSize = THREE.Box3.prototype.getSize;

THREE.Box3.prototype.setFromObject = function(object, precise) {
  const result = originalSetFromObject.call(this, object, precise);
  const path = object?.isMesh ? objectPath(object) : '';
  const force = !!path && FORCE_GLOW_PATHS.has(path);
  this[tagged] = force;
  if (force) seen.add(path);
  return result;
};

THREE.Box3.prototype.getSize = function(target) {
  const result = originalGetSize.call(this, target);
  if (this[tagged] && result.y < FORCE_Y_EXTENT) result.y = FORCE_Y_EXTENT;
  return result;
};

try {
  await import('./app-v2.js');
} finally {
  THREE.Box3.prototype.setFromObject = originalSetFromObject;
  THREE.Box3.prototype.getSize = originalGetSize;
  console.log(`[ADAM glow] explicit targets classified into shared glow pipeline: ${seen.size}/${FORCE_GLOW_PATHS.size}`);

  const missing = [...FORCE_GLOW_PATHS].filter(path => !seen.has(path));
  if (missing.length) console.warn('[ADAM glow] explicit target paths not encountered during classification:', missing);
}
