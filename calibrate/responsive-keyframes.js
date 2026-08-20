/*
  ADAM calibrator — responsive desktop/mobile keyframes
  -----------------------------------------------------
  Adds a device editing layer without changing app-v2's renderer internals.

  Behaviour:
  - Desktop remains the authoritative starting timeline.
  - Mobile starts as an exact clone of Desktop.
  - Until Mobile is edited, Desktop frame edits continue to mirror to Mobile.
  - Switching to Mobile loads an independent keyframe set into the existing
    calibrator controls and automatically enables the portrait viewport.
  - "Copy desktop → mobile" can re-sync Mobile at any time.
  - Export becomes DESKTOP_KEYFRAMES + MOBILE_KEYFRAMES + shared STYLE.

  Materials/lighting remain global and shared, exactly as in app-v2.
*/

const $ = id => document.getElementById(id);
const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

let mode = 'desktop';
let mobileDirty = false;
let suppress = false;
let modes = { desktop: [], mobile: [] };

function cloneFrames(frames) {
  return frames.map(frame => ({ ...frame }));
}

function keyframeButtons() {
  return [...document.querySelectorAll('#kfrow button')];
}

function activeIndex() {
  const buttons = keyframeButtons();
  const index = buttons.findIndex(button => button.classList.contains('on'));
  return index >= 0 ? index : 0;
}

function stopPlayback() {
  const play = $('playBtn');
  if (play?.textContent?.includes('Pause')) play.click();
}

function readCurrentFrame() {
  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')].map(input => Number(input.value));
  const motion = document.querySelector('#motionCtls input[type="range"]');
  const pct = document.querySelector('#scrollKeyframeCtl .keyframe-pct-number');
  const ease = document.querySelector('#scrollKeyframeCtl .keyframe-ease');

  return {
    scrollPct: Number(pct?.value ?? 0),
    azimuth: Number(cam[0] ?? 0),
    elevation: Number(cam[1] ?? 0),
    zoom: Number(cam[2] ?? 0.1),
    panX: Number(cam[3] ?? 0),
    panZ: Number(cam[4] ?? 0),
    motionProgress: Number(motion?.value ?? 0),
    ease: ease?.value || 'easeInOut'
  };
}

function snapshotCurrentMode() {
  stopPlayback();
  const buttons = keyframeButtons();
  if (!buttons.length) return [];

  const selected = activeIndex();
  const frames = [];

  // Selection + syncUI are synchronous in app-v2, so each click exposes the
  // selected frame's exact values in the existing controls.
  for (let i = 0; i < buttons.length; i++) {
    keyframeButtons()[i]?.click();
    frames.push(readCurrentFrame());
  }

  keyframeButtons()[Math.min(selected, keyframeButtons().length - 1)]?.click();
  return frames;
}

function setInput(input, value, eventName = 'input') {
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function writeSelectedFrame(frame, setPct = true) {
  if (setPct) {
    setInput(document.querySelector('#scrollKeyframeCtl .keyframe-pct-number'), frame.scrollPct, 'change');
  }

  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')];
  [frame.azimuth, frame.elevation, frame.zoom, frame.panX, frame.panZ].forEach((value, index) => {
    setInput(cam[index], value, 'input');
  });

  setInput(document.querySelector('#motionCtls input[type="range"]'), frame.motionProgress ?? 0, 'input');
  const ease = document.querySelector('#scrollKeyframeCtl .keyframe-ease');
  if (ease) {
    ease.value = frame.ease || 'easeInOut';
    ease.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function loadFrames(frames) {
  if (!frames?.length) return;
  suppress = true;
  stopPlayback();

  const selected = Math.min(activeIndex(), frames.length - 1);

  // Reduce the live app timeline to one frame, then rebuild the requested mode
  // in sorted order. This uses app-v2's own add/delete handlers so all control
  // state and playhead behaviour stay native to the calibrator.
  while (keyframeButtons().length > 1) {
    const buttons = keyframeButtons();
    buttons[buttons.length - 1]?.click();
    $('deleteKFBtn')?.click();
  }

  keyframeButtons()[0]?.click();
  writeSelectedFrame(frames[0], true);

  for (let i = 1; i < frames.length; i++) {
    setInput($('scrollScrub'), frames[i].scrollPct, 'input');
    $('addKFBtn')?.click();
    writeSelectedFrame(frames[i], true);
  }

  keyframeButtons()[selected]?.click();
  suppress = false;
}

function serialiseFrames(constName, frames) {
  const body = frames.map((k, i) =>
    `  // ${String(i + 1).padStart(2, '0')} @ ${Number(Number(k.scrollPct).toFixed(1))}% of .h-scroll\n` +
    `  { scrollPct: ${Number(Number(k.scrollPct).toFixed(1))}, azimuth: ${Number(k.azimuth).toFixed(0)}, elevation: ${Number(k.elevation).toFixed(0)}, ` +
    `zoom: ${Number(k.zoom).toFixed(2)}, panX: ${Number(k.panX).toFixed(2)}, panZ: ${Number(k.panZ).toFixed(2)}, ` +
    `motionProgress: ${Number(k.motionProgress ?? 0).toFixed(3)}, ease: '${k.ease || 'easeInOut'}' }`
  ).join(',\n');
  return `const ${constName} = [\n${body}\n];`;
}

function currentStyleBlock() {
  const value = $('out')?.value || '';
  const marker = 'const STYLE = ';
  const index = value.indexOf(marker);
  if (index >= 0) return value.slice(index).trim();
  return '// STYLE unavailable — use the current calibrator style export.';
}

function serialiseResponsive() {
  return `${serialiseFrames('DESKTOP_KEYFRAMES', modes.desktop)}\n\n` +
    `${serialiseFrames('MOBILE_KEYFRAMES', modes.mobile)}\n\n` +
    `// Shared across desktop + mobile. Camera/timeline can differ; scene materials remain global.\n` +
    `${currentStyleBlock()}`;
}

function updateExportPreview() {
  const out = $('out');
  if (out) out.value = serialiseResponsive();
}

function updateModeUI() {
  $('responsiveDesktopBtn')?.classList.toggle('on', mode === 'desktop');
  $('responsiveMobileBtn')?.classList.toggle('on', mode === 'mobile');

  const frame = $('frame');
  frame?.classList.toggle('portrait', mode === 'mobile');
  frame?.classList.toggle('responsive-mobile-edit', mode === 'mobile');

  const portrait = $('tPortrait');
  if (portrait) {
    portrait.disabled = mode === 'mobile';
    portrait.classList.toggle('on', mode === 'mobile');
  }

  const badge = $('responsiveModeStatus');
  if (badge) {
    badge.textContent = mode === 'mobile'
      ? `Editing MOBILE · ${modes.mobile.length} frames${mobileDirty ? ' · custom' : ' · synced'}`
      : `Editing DESKTOP · ${modes.desktop.length} frames`;
  }
}

function saveActiveFrameFromControls() {
  if (suppress) return;
  const index = activeIndex();
  if (!modes[mode][index]) return;
  modes[mode][index] = readCurrentFrame();

  if (mode === 'mobile') {
    mobileDirty = true;
  } else if (!mobileDirty) {
    modes.mobile = cloneFrames(modes.desktop);
  }

  updateModeUI();
  setTimeout(updateExportPreview, 0);
}

function refreshModeSnapshot(structureChanged = false) {
  if (suppress) return;
  modes[mode] = snapshotCurrentMode();
  if (mode === 'mobile') {
    mobileDirty = true;
  } else if (!mobileDirty) {
    modes.mobile = cloneFrames(modes.desktop);
  }
  updateModeUI();
  updateExportPreview();
}

function switchMode(nextMode) {
  if (nextMode === mode) return;
  modes[mode] = snapshotCurrentMode();

  if (nextMode === 'mobile' && !mobileDirty) {
    modes.mobile = cloneFrames(modes.desktop);
  }

  mode = nextMode;
  loadFrames(modes[mode]);
  updateModeUI();
  updateExportPreview();
}

function addResponsiveUI() {
  if ($('responsiveDesktopBtn')) return;

  const keyframeHeading = [...document.querySelectorAll('#panel h2')]
    .find(heading => heading.textContent.trim() === 'Keyframe');
  if (!keyframeHeading) return;

  const heading = document.createElement('h2');
  heading.textContent = 'Responsive framing';

  const box = document.createElement('div');
  box.className = 'responsive-keyframe-box';
  box.innerHTML = `
    <div class="row tog responsive-mode-row">
      <button id="responsiveDesktopBtn" class="on">Desktop frames</button>
      <button id="responsiveMobileBtn">Mobile frames</button>
    </div>
    <button class="btn ghost responsive-sync-btn" id="responsiveSyncBtn">Copy desktop → mobile</button>
    <div class="responsive-mode-status" id="responsiveModeStatus"></div>
    <p class="responsive-hint">Mobile starts as a duplicate of Desktop. Switch to Mobile and adjust its camera/timing slightly without changing Desktop. Materials and lighting stay shared.</p>
  `;

  keyframeHeading.before(heading, box);

  $('responsiveDesktopBtn').onclick = () => switchMode('desktop');
  $('responsiveMobileBtn').onclick = () => switchMode('mobile');
  $('responsiveSyncBtn').onclick = () => {
    if (mode === 'desktop') modes.desktop = snapshotCurrentMode();
    modes.mobile = cloneFrames(modes.desktop);
    mobileDirty = false;
    if (mode === 'mobile') loadFrames(modes.mobile);
    updateModeUI();
    updateExportPreview();
  };
}

async function install() {
  // app-v2 is imported by glow-bootstrap; wait until its generated controls and
  // keyframe buttons exist before layering responsive editing on top.
  while (!keyframeButtons().length || !document.querySelector('#camCtls input')) {
    await waitFrame();
  }

  addResponsiveUI();
  modes.desktop = snapshotCurrentMode();
  modes.mobile = cloneFrames(modes.desktop);

  const keyframeHosts = [
    $('camCtls'), $('motionCtls'), $('scrollKeyframeCtl')
  ].filter(Boolean);

  for (const host of keyframeHosts) {
    host.addEventListener('input', saveActiveFrameFromControls);
    host.addEventListener('change', saveActiveFrameFromControls);
  }

  for (const id of ['addKFBtn', 'deleteKFBtn', 'copyPrevBtn']) {
    $(id)?.addEventListener('click', () => setTimeout(() => refreshModeSnapshot(true), 0));
  }

  // Re-export both device timelines. app-v2's normal syncUI can still update the
  // textarea between edits; our listeners restore the responsive export after
  // keyframe changes and immediately before Copy.
  const copy = $('copyBtn');
  if (copy) {
    copy.textContent = 'Copy DESKTOP + MOBILE + STYLE';
    copy.onclick = async () => {
      modes[mode] = snapshotCurrentMode();
      if (mode === 'desktop' && !mobileDirty) modes.mobile = cloneFrames(modes.desktop);
      const text = serialiseResponsive();
      $('out').value = text;
      try {
        await navigator.clipboard.writeText(text);
        $('status').textContent += '\nresponsive export copied · desktop + mobile';
      } catch {
        $('out').select();
      }
    };
  }

  mode = 'desktop';
  updateModeUI();
  updateExportPreview();
}

install();
