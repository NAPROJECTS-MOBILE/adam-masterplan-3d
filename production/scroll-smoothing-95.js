/*
  ADAM masterplan — 95% scroll smoothing + velocity lead
  ------------------------------------------------------
  Keeps Webflow/native scrolling untouched. The 3D masterplan still uses the
  same 95% previous-value / 5% catch-up smoothing, but its smoothing target is
  predicted forward by the theoretical 19-frame EMA lag.

  For steady scrolling:
      lagFrames = KEEP / (1 - KEEP) = 0.95 / 0.05 = 19

  A 4 percentage-point clamp prevents hard wheel / trackpad flicks from pushing
  the camera implausibly ahead of the real Webflow timeline.
*/

const KEEP = 0.95;
const CATCH_UP = 1 - KEEP;
const LEAD_FRAMES = KEEP / CATCH_UP; // 19 frames: cancels steady-state EMA lag
const MAX_LEAD = 0.04;                // max +/-4% of section progress
const nativeRAF = window.requestAnimationFrame.bind(window);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let installed = false;
let smoothedProgress = null;
let previousRawProgress = null;
let currentLead = 0;
let currentPredictedTarget = 0;

function rawEntryProgress(rect) {
  const height = Math.max(1, rect.height);
  return clamp((window.innerHeight - rect.top) / height, 0, 1);
}

function predictedEntryProgress(rect) {
  const raw = rawEntryProgress(rect);

  if (previousRawProgress == null) {
    previousRawProgress = raw;
    currentLead = 0;
    currentPredictedTarget = raw;
    return raw;
  }

  const velocityPerFrame = raw - previousRawProgress;
  previousRawProgress = raw;

  currentLead = clamp(velocityPerFrame * LEAD_FRAMES, -MAX_LEAD, MAX_LEAD);
  currentPredictedTarget = clamp(raw + currentLead, 0, 1);
  return currentPredictedTarget;
}

function smoothedEntryProgress(rect) {
  const target = predictedEntryProgress(rect);
  if (smoothedProgress == null) smoothedProgress = target;
  else smoothedProgress += (target - smoothedProgress) * CATCH_UP;
  return smoothedProgress;
}

function syntheticRect(realRect) {
  const progress = smoothedEntryProgress(realRect);
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

function install(api) {
  if (installed || !api?.track || !api?.performance) return false;

  const track = api.track;
  const realGetRect = track.getBoundingClientRect.bind(track);

  const scheduleWrapped = callback => nativeRAF(now => {
    const previousRAF = window.requestAnimationFrame;
    const previousGetRect = track.getBoundingClientRect;

    window.requestAnimationFrame = next => scheduleWrapped(next);
    track.getBoundingClientRect = () => syntheticRect(realGetRect());

    try {
      callback(now);
    } finally {
      track.getBoundingClientRect = previousGetRect;
      window.requestAnimationFrame = previousRAF;
    }
  });

  const restart = () => {
    api.performance.stop();
    smoothedProgress = null;
    previousRawProgress = null;
    currentLead = 0;

    const previousRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => scheduleWrapped(callback);
    try {
      api.performance.start();
    } finally {
      window.requestAnimationFrame = previousRAF;
    }
  };

  restart();

  const visibilityObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) setTimeout(restart, 0);
  }, { rootMargin:'25% 0px' });
  visibilityObserver.observe(track);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(restart, 0);
  });

  api.scrollSmoothing = KEEP;
  api.scrollLeadFrames = LEAD_FRAMES;
  api.scrollLeadMax = MAX_LEAD * 100;
  api.smoothedEntryProgress = () => (smoothedProgress ?? rawEntryProgress(realGetRect())) * 100;
  api.rawEntryProgress = () => rawEntryProgress(realGetRect()) * 100;
  api.predictedEntryProgress = () => currentPredictedTarget * 100;
  api.scrollLeadPct = () => currentLead * 100;

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) {
    root.dataset.scrollSmoothingActive = KEEP.toFixed(2);
    root.dataset.scrollLeadFrames = LEAD_FRAMES.toFixed(1);
    root.dataset.scrollLeadMax = (MAX_LEAD * 100).toFixed(1);
  }

  installed = true;
  console.info('[ADAM scroll smoothing] active with velocity lead', {
    keep:KEEP,
    catchUp:CATCH_UP,
    leadFrames:LEAD_FRAMES,
    maxLeadPct:MAX_LEAD * 100
  });
  return true;
}

if (!install(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
