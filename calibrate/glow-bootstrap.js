import * as THREE from 'three';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=65-20260820-0157';

/*
  ADAM explicit-glow bootstrap
  ----------------------------
  app-v2 creates the correct two-part architectural treatment (inner pale-lime
  edge + wider additive lime glow) only for meshes it classifies as `solids`.
  That classifier normally uses world-space Y height, so thin/rotated building
  pieces can fall into the `flats` bucket and never get the native edge/glow pair.

  This bootstrap runs BEFORE app-v2 and changes classification only for the
  exact whitelisted GLB paths. Geometry and real transforms are untouched.
  During app-v2's initial Box3 classification pass, a whitelisted mesh reports
  a synthetic Y size just above FLAT_THRESHOLD. app-v2 therefore builds the
  exact SAME edgeMat + glowMat pair on it as every other building.

  The query strings deliberately bust GitHub Pages/browser module caches.

  Once app-v2 has finished booting, Box3 is restored immediately.
*/

const FORCE_MIN_Y = 0.100001; // config FLAT_THRESHOLD is 0.1
const FORCE_TAG = Symbol('adam-force-native-glow');
const matched = new Set();

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

const originalSetFromObject = THREE.Box3.prototype.setFromObject;
const originalGetSize = THREE.Box3.prototype.getSize;

THREE.Box3.prototype.setFromObject = function(object, precise) {
  const result = originalSetFromObject.call(this, object, precise);
  const path = object?.isMesh ? pathOf(object) : '';
  const force = !!path && FORCE_GLOW_PATHS.has(path);
  this[FORCE_TAG] = force;
  if (force) matched.add(path);
  return result;
};

THREE.Box3.prototype.getSize = function(target) {
  const result = originalGetSize.call(this, target);
  if (this[FORCE_TAG] && result.y < FORCE_MIN_Y) result.y = FORCE_MIN_Y;
  return result;
};

try {
  await import('./app-v2.js?v=cal-511-remove-b2-duplicates-20260820-1102');
} finally {
  THREE.Box3.prototype.setFromObject = originalSetFromObject;
  THREE.Box3.prototype.getSize = originalGetSize;

  console.info(
    `[ADAM native glow] ${matched.size}/${FORCE_GLOW_PATHS.size} explicit paths ` +
    'were forced through the normal building edge + glow pipeline.'
  );

  const missing = [...FORCE_GLOW_PATHS].filter(path => !matched.has(path));
  if (missing.length) {
    console.warn('[ADAM native glow] whitelist paths not encountered before motion re-parenting:', missing);
  }
}
