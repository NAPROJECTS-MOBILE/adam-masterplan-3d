import './adam-masterplan-v1.js?v=1.0.0';

/*
  ADAM production V1.1 config correction.
  The original V1 export had motionProgress=0 on every frame, which froze the
  actual Spline-derived building/block motion. The corrected supplied export
  keeps motion at 0 through 75% of .h-scroll, then runs the real motion engine
  from 0 -> 1 between 75% and 100% using the existing easeInOut interpolation.
*/

function applyCorrectedMotionKeyframe() {
  const api = window.__adamMasterplanV1;
  if (!api?.keyframes?.length) return false;

  const last = api.keyframes[api.keyframes.length - 1];
  if (!last || last.scrollPct !== 100) return false;

  last.motionProgress = 1.000;
  api.version = '1.1.0';
  api.render?.();
  return true;
}

if (!applyCorrectedMotionKeyframe()) {
  const timer = setInterval(() => {
    if (applyCorrectedMotionKeyframe()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 15000);
}
