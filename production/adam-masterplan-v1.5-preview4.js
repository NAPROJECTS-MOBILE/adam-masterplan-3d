/*
  ADAM MASTERPLAN — WEBFLOW V1.5 PREVIEW 4
  ----------------------------------------
  Keep the known-working V1.5 preview runtime as the render owner, then load
  the exact calibrator path-ribbon module BEFORE that runtime so its proven
  GLTFLoader capture sees the untouched split GLB.

  This avoids the custom preview-3 loader wrapper that could leave the Webflow
  section blank, while restoring the accepted strip edge + inner glow + halo.
*/

const DESKTOP_KEYFRAMES = [
  { scrollPct:0,   azimuth:22, elevation:27, zoom:0.04, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:38, elevation:27, zoom:0.08, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:51, elevation:28, zoom:0.08, panX:-0.19, panZ:0.17,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:51, elevation:28, zoom:0.08, panX:0.12,  panZ:0.27,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:44, elevation:28, zoom:0.08, panX:0.48,  panZ:0.35,  motionProgress:0.000, ease:'easeInOut' }
];

const MOBILE_KEYFRAMES = [
  { scrollPct:0,   azimuth:29, elevation:32, zoom:0.02, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:37, elevation:34, zoom:0.06, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:14, elevation:37, zoom:0.05, panX:-0.19, panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:29, elevation:36, zoom:0.08, panX:0.11,  panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:29, elevation:37, zoom:0.08, panX:0.48,  panZ:0.31, motionProgress:0.000, ease:'easeInOut' }
];

const root = document.querySelector('[data-adam-masterplan-v15-preview]');
if (root) {
  // The calibrator strip module resolves its LineMaterial viewport from this
  // selector. Reuse the same Webflow root rather than adding another element.
  root.setAttribute('data-scene3d', '');
}

// IMPORTANT: import the accepted strip module first. It installs the same
// one-shot GLTFLoader capture used by the working calibrator.
await import('../calibrate/path-ribbon-glow.js?v=strip-controls-restored-20260821-1602');

// Then boot the last known-visible Webflow preview runtime. It loads the split
// GLB, Material 2 setup, base-scale hook, adaptive DPR and ambient motion.
await import('./adam-masterplan-v1.5-preview.js?v=c3de4c1400092453c86e58cf4467f42f29077420');

function finish(api) {
  if (!api || api.__preview4Installed) return false;
  api.__preview4Installed = true;

  // Preview 1 closes over these arrays, so mutate them in place.
  api.desktopKeyframes.splice(0, api.desktopKeyframes.length, ...DESKTOP_KEYFRAMES);
  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...MOBILE_KEYFRAMES);

  // The strip module has already captured the source meshes during the GLB
  // load. Build its exact accepted edge/glow/halo layers now, after the model
  // and motion hierarchy are ready.
  window.__ADAM_REBUILD_PATH_RAILS?.();

  api.version = '1.5-preview4';
  api.stripStyle = window.__ADAM_PATH_RIBBON_STYLE || null;
  api.stripRails = window.__ADAM_PATH_RAIL_LAYERS || [];
  api.stripSources = window.__ADAM_PATH_RIBBON_REFS || [];

  if (root) {
    root.dataset.adamVersion = '1.5-preview4';
    root.dataset.stripRails = String(api.stripRails.length);
    root.dataset.stripSources = String(api.stripSources.length);
  }

  console.info('[ADAM V1.5 preview 4] ready', {
    desktopFrames:api.desktopKeyframes.length,
    mobileFrames:api.mobileKeyframes.length,
    stripSources:api.stripSources.length,
    stripRails:api.stripRails.length
  });
  return true;
}

if (!finish(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (finish(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);

  setTimeout(() => {
    clearInterval(timer);
    if (!window.__adamMasterplanV15Preview?.__preview4Installed) {
      console.error('[ADAM V1.5 preview 4] install timed out');
    }
  }, 20000);
}
