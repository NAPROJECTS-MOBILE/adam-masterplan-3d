/*
  ADAM calibrator — add keyframe at the exact .h-scroll preview percentage.

  Workflow:
    1. Set the top .h-scroll progress scrubber to the timestamp you want.
    2. Click Add keyframe.
    3. The new keyframe is created at that exact percentage.
    4. Use Copy previous if you want to inherit the prior pose, then edit it.

  app-v2 keeps keyframes chronologically sorted, so this wrapper selects the
  frame immediately before the requested timestamp before invoking the native
  Add handler. It then moves the newly-created frame from the temporary midpoint
  to the exact requested percentage using the app's own keyframe-position input.
*/

const EPS = 0.049;

function pctFromButton(button) {
  const match = button?.textContent?.match(/([0-9]+(?:\.[0-9]+)?)%/);
  return match ? parseFloat(match[1]) : NaN;
}

function install() {
  const add = document.getElementById('addKFBtn');
  const scrub = document.getElementById('scrollScrub');
  const row = document.getElementById('kfrow');
  const keyframePctInput = document.querySelector('#scrollKeyframeCtl input[type="range"]');

  if (!add || !scrub || !row || !keyframePctInput || typeof add.onclick !== 'function') {
    requestAnimationFrame(install);
    return;
  }

  if (add.dataset.addAtScrubInstalled === '1') return;
  add.dataset.addAtScrubInstalled = '1';

  const nativeAdd = add.onclick;

  add.onclick = event => {
    const desired = Math.max(0, Math.min(100, parseFloat(scrub.value) || 0));
    const buttons = [...row.querySelectorAll('button')];
    const frames = buttons
      .map((button, index) => ({ button, index, pct: pctFromButton(button) }))
      .filter(frame => Number.isFinite(frame.pct));

    // Never create two timeline keys at exactly the same percentage. If one
    // already exists, selecting it is the least surprising behaviour.
    const existing = frames.find(frame => Math.abs(frame.pct - desired) <= EPS);
    if (existing) {
      existing.button.click();
      return;
    }

    // Normal 0–100 timeline: find the chronological frame directly before the
    // chosen timestamp so the app inserts the new key in the correct segment.
    const previous = [...frames].reverse().find(frame => frame.pct < desired);

    if (previous) {
      previous.button.click();
    } else if (frames.length) {
      // The normal calibrator starts at 0%, so this branch is only relevant if
      // the user later moves/deletes that first anchor. Keep native behaviour
      // rather than inventing a different timestamp.
      frames[0].button.click();
    }

    nativeAdd.call(add, event);

    // The native Add handler has now selected its new keyframe. Reposition it
    // to the exact percentage chosen on the top .h-scroll scrubber.
    keyframePctInput.value = String(desired);
    keyframePctInput.dispatchEvent(new Event('input', { bubbles:true }));
  };

  console.info('[ADAM keyframes] Add keyframe now uses the exact .h-scroll preview percentage');
}

install();
