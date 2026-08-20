/*
  ADAM calibrator — keyframe add unlock

  Keeps the existing app-v2 keyframe implementation untouched, but removes the
  practical four-frame ceiling caused by Add keyframe doing nothing whenever
  the playhead is already sitting on an existing keyframe.

  Behaviour:
    - if the current playhead is free, use the app's original add handler;
    - if it collides with an existing keyframe, choose the midpoint of the next
      available timeline gap (falling back to the previous/largest gap);
    - after a frame is successfully added, invoke the app's existing
      "Copy previous" action so the new frame starts from the prior camera and
      motion values while preserving its new scroll position.
*/

const STEP = 0.1;
const EPS = 0.05;

function pctFromButton(button) {
  const match = button?.textContent?.match(/·\s*([0-9.]+)%/);
  return match ? Number(match[1]) : NaN;
}

function keyframePercents() {
  return [...document.querySelectorAll('#kfrow button')]
    .map(pctFromButton)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function midpoint(a, b) {
  return Number(((a + b) / 2).toFixed(1));
}

function chooseFreePct(current, points) {
  if (!points.some(p => Math.abs(p - current) < EPS)) return current;

  const collisionIndex = points.findIndex(p => Math.abs(p - current) < EPS);
  const here = points[collisionIndex];
  const next = collisionIndex < points.length - 1 ? points[collisionIndex + 1] : 100;
  if (next - here >= STEP * 2) return midpoint(here, next);

  const prev = collisionIndex > 0 ? points[collisionIndex - 1] : 0;
  if (here - prev >= STEP * 2) return midpoint(prev, here);

  const boundaries = [0, ...points, 100].sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i], b = boundaries[i + 1];
    const gap = b - a;
    if (gap < STEP * 2) continue;
    if (!best || gap > best.gap) best = { a, b, gap };
  }
  return best ? midpoint(best.a, best.b) : null;
}

function install() {
  const add = document.getElementById('addKFBtn');
  const scrub = document.getElementById('scrollScrub');
  const copyPrev = document.getElementById('copyPrevBtn');

  if (!add || !scrub || typeof add.onclick !== 'function') {
    requestAnimationFrame(install);
    return;
  }
  if (add.dataset.keyframeUnlockInstalled === '1') return;

  const originalAdd = add.onclick;
  add.dataset.keyframeUnlockInstalled = '1';

  add.onclick = () => {
    const beforeCount = keyframePercents().length;
    const current = Number(scrub.value);
    const freePct = chooseFreePct(current, keyframePercents());

    if (freePct == null) return;

    if (Math.abs(freePct - current) >= EPS) {
      scrub.value = String(freePct);
      scrub.dispatchEvent(new Event('input', { bubbles: true }));
    }

    originalAdd();

    const afterCount = keyframePercents().length;
    if (afterCount > beforeCount && copyPrev && !copyPrev.disabled) {
      copyPrev.click();
    }
  };
}

install();
