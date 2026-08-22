import * as BASE from './config.js?m2split-base-20260822-1249';
import { M2_SPLIT_MODEL_URL } from './m2split-model-url.js?v=20260822-1249';

// Calibrator-only config wrapper. Everything except MODEL_URL is inherited
// unchanged from the approved calibrator config.
export const MODEL_URL = M2_SPLIT_MODEL_URL;
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
