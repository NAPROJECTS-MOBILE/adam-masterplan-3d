/*
  ADAM MASTERPLAN — WEBFLOW V1.5 PREVIEW 5
  ----------------------------------------
  Keeps the visible Preview 4 setup, including the proven calibrator strip-glow
  capture, but remaps .h-scroll progress so animation begins the instant the
  section starts entering the viewport.

  Progress mapping:
  - 0% when the section top first reaches the viewport bottom
  - 100% when the section bottom reaches the viewport bottom

  Optional smoothing:
  - data-scroll-smoothing="0.90" retains 90% of the previous progress and
    advances 10% toward the current scroll target per animation frame.
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
if (root) root.setAttribute('data-scene3d', '');

// Preserve Preview 4's proven strip-glow path exactly: capture on GLTFLoader
// before the base runtime touches the hierarchy, then rebuild once ready.
await import('../calibrate/path-ribbon-glow.js?v=strip-controls-restored-20260821-1602');
await import('./adam-masterplan-v1.5-preview.js?v=c3de4c1400092453c86e58cf4467f42f29077420');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nativeRAF = window.requestAnimationFrame.bind(window);
const scrollSmoothing = clamp(Number(root?.dataset?.scrollSmoothing || 0), 0, 0.99);
let smoothedEntryProgress = null;

function rawEntryProgressForRect(rect) {
  const height = Math.max(1, rect.height);
  return clamp((window.innerHeight - rect.top) / height, 0, 1);
}

function entryProgressForRect(rect) {
  const target = rawEntryProgressForRect(rect);
  if (scrollSmoothing <= 0) return target;

  if (smoothedEntryProgress == null) {
    smoothedEntryProgress = target;
  } else {
    smoothedEntryProgress += (target - smoothedEntryProgress) * (1 - scrollSmoothing);
  }
  return smoothedEntryProgress;
}

function syntheticRectForLegacyReader(realRect) {
  // Preview 1's internal reader expects:
  //   progress = -rect.top / (rect.height - viewportHeight)
  // Feed it a synthetic top that yields our entry-based progress while keeping
  // the real height. Only the preview render callback sees this temporary rect.
  const progress = entryProgressForRect(realRect);
  const travel = Math.max(1, realRect.height - window.innerHeight);
  const top = -progress * travel;
  const bottom = top + realRect.height;

  return {
    x:realRect.x,
    y:top,
    top,
    bottom,
    left:realRect.left,
    right:realRect.right,
    width:realRect.width,
    height:realRect.height,
    toJSON() {
      return {
        x:this.x, y:this.y, top:this.top, bottom:this.bottom,
        left:this.left, right:this.right, width:this.width, height:this.height
      };
    }
  };
}

function installEntryProgress(api) {
  if (!api?.track || !api?.performance || api.__entryProgressInstalled) return false;
  api.__entryProgressInstalled = true;

  const track = api.track;
  const realGetBoundingClientRect = track.getBoundingClientRect.bind(track);

  // Wrap only the base preview's own RAF chain. During that callback we replace
  // the track rect just long enough for its private readScrollPct() call. Webflow
  // and unrelated scripts continue seeing the real geometry at all other times.
  const scheduleWrapped = callback => nativeRAF(now => {
    const previousRAF = window.requestAnimationFrame;
    const previousGetRect = track.getBoundingClientRect;

    window.requestAnimationFrame = next => scheduleWrapped(next);
    track.getBoundingClientRect = () => syntheticRectForLegacyReader(realGetBoundingClientRect());

    try {
      callback(now);
    } finally {
      track.getBoundingClientRect = previousGetRect;
      window.requestAnimationFrame = previousRAF;
    }
  });

  const restartWrappedLoop = () => {
    api.performance.stop();
    smoothedEntryProgress = null;

    const previousRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => scheduleWrapped(callback);
    try {
      api.performance.start();
    } finally {
      window.requestAnimationFrame = previousRAF;
    }
  };

  restartWrappedLoop();

  // The base runtime pauses itself offscreen. Re-wrap whenever it comes back so
  // entry-progress remains authoritative after scrolling away and returning.
  const visibilityObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    setTimeout(restartWrappedLoop, 0);
  }, { rootMargin:'25% 0px' });
  visibilityObserver.observe(track);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(restartWrappedLoop, 0);
  });

  api.entryProgress = () => entryProgressForRect(realGetBoundingClientRect()) * 100;
  api.rawEntryProgress = () => rawEntryProgressForRect(realGetBoundingClientRect()) * 100;
  api.entryProgressMode = 'section-enters-viewport';
  api.scrollSmoothing = scrollSmoothing;

  if (root) {
    root.dataset.scrollProgressMode = 'entry';
    root.dataset.scrollSmoothingActive = scrollSmoothing.toFixed(2);
  }
  return true;
}

function finish(api) {
  if (!api || api.__preview5Installed) return false;
  api.__preview5Installed = true;

  // Base preview closes over these arrays, so mutate them in-place.
  api.desktopKeyframes.splice(0, api.desktopKeyframes.length, ...DESKTOP_KEYFRAMES);
  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...MOBILE_KEYFRAMES);

  window.__ADAM_REBUILD_PATH_RAILS?.();
  installEntryProgress(api);

  api.version = '1.5-preview5';
  api.stripStyle = window.__ADAM_PATH_RIBBON_STYLE || null;
  api.stripRails = window.__ADAM_PATH_RAIL_LAYERS || [];
  api.stripSources = window.__ADAM_PATH_RIBBON_REFS || [];

  if (root) {
    root.dataset.adamVersion = '1.5-preview5';
    root.dataset.stripRails = String(api.stripRails.length);
    root.dataset.stripSources = String(api.stripSources.length);
  }

  console.info('[ADAM V1.5 preview 5] ready', {
    desktopFrames:api.desktopKeyframes.length,
    mobileFrames:api.mobileKeyframes.length,
    progressMode:'section enters viewport',
    scrollSmoothing,
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
    if (!window.__adamMasterplanV15Preview?.__preview5Installed) {
      console.error('[ADAM V1.5 preview 5] install timed out');
    }
  }, 20000);
}
