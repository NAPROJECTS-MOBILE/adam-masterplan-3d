import * as BASE from './config.js?m2split-base-20260822-1249';

// Calibrator-only config wrapper. Everything except MODEL_URL is inherited
// unchanged from the approved calibrator config.
//
// This now points at the actual split GLB committed under /model rather than
// rebuilding that transform in-browser.
export const MODEL_URL = './model/adam_landscape_in_use_fullerversion_m2split.glb?v=55bb022db8f5017432b8767fac5f1a9cf6db0375';
export const FLAT_THRESHOLD = BASE.FLAT_THRESHOLD;
export const PRESETS = BASE.PRESETS;
export const START_POSE = BASE.START_POSE;
export const CAM = BASE.CAM;
export const LIGHT = BASE.LIGHT;
export const FACE = BASE.FACE;
export const SLAB = BASE.SLAB;
export const EDGE = BASE.EDGE;
export const GLOW = BASE.GLOW;
export const DOTS = BASE.DOTS;
