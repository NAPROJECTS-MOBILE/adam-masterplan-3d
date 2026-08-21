import * as THREE from 'three';

/*
  ADAM path-ribbon depth + glow-width correction
  ----------------------------------------------
  This module intentionally leaves the proven 10° ribbon geometry untouched.
  It only corrects two presentation issues:

  1. path lines must obey scene depth so buildings can occlude them;
  2. path glow must be much tighter than the building glow because thousands
     of rail segments are packed into a narrow corridor.

  The path-ribbon module owns the geometry and responds to calibrator controls.
  This wrapper runs immediately before each render, after those updates, so the
  depth policy and path-specific width scaling remain authoritative without
  duplicating or rebuilding any strip geometry.
*/

const INNER_GLOW_SCALE = 0.28;
const OUTER_GLOW_SCALE = 0.50;
const INNER_GLOW_MIN = 1.5;
const INNER_GLOW_MAX = 2.5;
const OUTER_GLOW_MIN = 2.4;
const OUTER_GLOW_MAX = 4.0;

function wrapFor(hostId, key) {
  const host = document.getElementById(hostId);
  if (!host) return null;
  return [...host.children].find(child => child?._key === key) || null;
}

function readNumber(hostId, key, fallback) {
  const input = wrapFor(hostId, key)?._input;
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function enforcePathPresentation() {
  const entries = window.__ADAM_PATH_RAIL_LAYERS;
  if (!Array.isArray(entries) || !entries.length) return;

  const globalGlowWidth = readNumber('glowCtls', 'glowWidth', 7);
  const innerWidth = clamp(globalGlowWidth * INNER_GLOW_SCALE, INNER_GLOW_MIN, INNER_GLOW_MAX);
  const outerWidth = clamp(globalGlowWidth * OUTER_GLOW_SCALE, OUTER_GLOW_MIN, OUTER_GLOW_MAX);

  for (const entry of entries) {
    const outer = entry?.outer;
    const inner = entry?.inner;
    const edge = entry?.edge;

    if (outer?.material) {
      outer.material.depthTest = true;
      outer.material.depthWrite = false;
      outer.material.linewidth = outerWidth;
      outer.renderOrder = 2;
    }

    if (inner?.material) {
      inner.material.depthTest = true;
      inner.material.depthWrite = false;
      inner.material.linewidth = innerWidth;
      inner.renderOrder = 3;
    }

    if (edge?.material) {
      edge.material.depthTest = true;
      edge.material.depthWrite = false;
      edge.renderOrder = 4;
    }
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamPathRibbonDepthRender(scene, camera) {
  enforcePathPresentation();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_PATH_RIBBON_PRESENTATION_SYNC = enforcePathPresentation;
