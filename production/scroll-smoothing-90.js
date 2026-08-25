/*
  ADAM masterplan — 90% scroll smoothing
  --------------------------------------
  Keeps Webflow/native scroll untouched. Only the 3D masterplan's internal
  .h-scroll progress is eased: 90% previous value + 10% new target per frame.
*/

const KEEP = 0.90;
const CATCH_UP = 1 - KEEP;
const nativeRAF = window.requestAnimationFrame.bind(window);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let installed = false;
let smoothedProgress = null;

function rawEntryProgress(rect) {
  const height = Math.max(1, rect.height);
  return clamp((window.innerHeight - rect.top) / height, 0, 1);
}

function smoothedEntryProgress(rect) {
  const target = rawEntryProgress(rect);
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
  api.smoothedEntryProgress = () => (smoothedProgress ?? rawEntryProgress(realGetRect())) * 100;
  api.rawEntryProgress = () => rawEntryProgress(realGetRect()) * 100;

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.scrollSmoothingActive = KEEP.toFixed(2);

  installed = true;
  console.info('[ADAM scroll smoothing] active', { keep:KEEP, catchUp:CATCH_UP });
  return true;
}

if (!install(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
