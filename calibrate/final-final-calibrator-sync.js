/* ADAM calibrator — sync to current final website state */

const $ = id => document.getElementById(id);
const raf = () => new Promise(resolve => requestAnimationFrame(resolve));

const FINAL = {
  dotDensity:24.95,
  dotFadedOpacity:0,
  mobileFrame5:{ azimuth:44, panX:0.50 },
  strip:{
    edgeAngle:10,
    edgeColor:'#cccccc',
    edgeOpacity:0.67,
    edgeWidth:0.25,
    glowColor:'#84c534',
    glowOpacity:0.076,
    glowWidth:1.30,
    haloOpacity:0.030,
    haloWidth:1.20
  },
  pulse:{
    pulseSpeed:8.05,
    pulseWidth:0.85,
    pulseStrength:0.76,
    pulseStagger:0.42
  },
  runtime:{
    scrollSmoothing:0.90,
    rippleDirectionSwitchPct:63.6,
    straightRibbonCentrelines:true
  }
};

let applying = false;
let rippleUniforms = [];

function setValue(id, value, eventName = 'input') {
  const input = $(id);
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event(eventName, { bubbles:true }));
}

function directInputs(selector) {
  const host = document.querySelector(selector);
  if (!host) return [];
  return [...host.children]
    .map(wrap => wrap.querySelector(':scope > input'))
    .filter(Boolean);
}

function applyDotSettings() {
  const inputs = directInputs('#dotCtls');
  if (inputs[1]) {
    inputs[1].value = String(FINAL.dotDensity);
    inputs[1].dispatchEvent(new Event('input', { bubbles:true }));
  }
  if (inputs[5]) {
    inputs[5].value = String(FINAL.dotFadedOpacity);
    inputs[5].dispatchEvent(new Event('input', { bubbles:true }));
  }
}

function applyStripSettings() {
  setValue('pathEdgeAngle', FINAL.strip.edgeAngle);
  setValue('pathEdgeColor', FINAL.strip.edgeColor);
  setValue('pathEdgeOpacity', FINAL.strip.edgeOpacity);
  setValue('pathEdgeWidth', FINAL.strip.edgeWidth);
  setValue('pathGlowColor', FINAL.strip.glowColor);
  setValue('pathGlowOpacity', FINAL.strip.glowOpacity);
  setValue('pathGlowWidth', FINAL.strip.glowWidth);
  setValue('pathHaloOpacity', FINAL.strip.haloOpacity);
  setValue('pathHaloWidth', FINAL.strip.haloWidth);

  setValue('pathPulseSpeed', FINAL.pulse.pulseSpeed);
  setValue('pathPulseWidth', FINAL.pulse.pulseWidth);
  setValue('pathPulseStrength', FINAL.pulse.pulseStrength);
  setValue('pathPulseStagger', FINAL.pulse.pulseStagger);

  const style = window.__ADAM_PATH_RIBBON_STYLE;
  if (style) {
    Object.assign(style, {
      edgeColor:FINAL.strip.edgeColor,
      edgeOpacity:FINAL.strip.edgeOpacity,
      edgeWidth:FINAL.strip.edgeWidth,
      glowColor:FINAL.strip.glowColor,
      glowOpacity:FINAL.strip.glowOpacity,
      glowWidth:FINAL.strip.glowWidth,
      haloOpacity:FINAL.strip.haloOpacity,
      haloWidth:FINAL.strip.haloWidth,
      edgesVisible:true,
      glowVisible:true,
      pulseEnabled:true,
      pulseSpeed:FINAL.pulse.pulseSpeed,
      pulseWidth:FINAL.pulse.pulseWidth,
      pulseStrength:FINAL.pulse.pulseStrength,
      pulseStagger:FINAL.pulse.pulseStagger,
      __adamFlowV3DefaultsApplied:true,
      __adamIndependentPulseDefaultsApplied:true
    });
  }

  window.__ADAM_REBUILD_PATH_RAILS?.();
  window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
}

async function applyMobileFrame5() {
  const mobile = $('responsiveMobileBtn');
  const desktop = $('responsiveDesktopBtn');
  if (!mobile || !desktop) return;

  const wasMobile = mobile.classList.contains('on');
  if (!wasMobile) mobile.click();
  await raf();

  const frames = [...document.querySelectorAll('#kfrow button')];
  frames[frames.length - 1]?.click();
  await raf();

  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')];
  if (cam[0]) {
    cam[0].value = String(FINAL.mobileFrame5.azimuth);
    cam[0].dispatchEvent(new Event('input', { bubbles:true }));
  }
  if (cam[3]) {
    cam[3].value = String(FINAL.mobileFrame5.panX);
    cam[3].dispatchEvent(new Event('input', { bubbles:true }));
  }

  await raf();
  if (!wasMobile) desktop.click();
}

function discoverRippleUniforms() {
  rippleUniforms = [];
  const candidates = [
    window.__adamMasterplanV15Preview?.scene,
    window.__ADAM_CALIBRATOR_API?.scene,
    window.__adamCalibrator?.scene
  ].filter(Boolean);

  for (const scene of candidates) {
    scene.traverse?.(object => {
      const uniforms = object?.material?.uniforms;
      if (uniforms?.uRippleSpeed && uniforms?.uRippleSoft && uniforms?.uDotColor) rippleUniforms.push(uniforms);
    });
    if (rippleUniforms.length) break;
  }
}

function applyRippleDirection() {
  if (!rippleUniforms.length) discoverRippleUniforms();
  const pct = Number($('scrollScrub')?.value || 0);
  const speed = pct >= FINAL.runtime.rippleDirectionSwitchPct ? 1.25 : -1.25;
  for (const uniforms of rippleUniforms) uniforms.uRippleSpeed.value = speed;
}

function enrichExport() {
  const out = $('out');
  if (!out?.value) return;
  const marker = '// Website-only runtime / geometry state.';
  const base = out.value.split(`\n\n${marker}`)[0];
  out.value = `${base}\n\n${marker}\nconst PATH_GEOMETRY_STATE = ${JSON.stringify({ straightRibbonCentrelines:true }, null, 2)};\n\nconst SCROLL_RUNTIME_STYLE = ${JSON.stringify({ smoothing:0.90, rippleDirectionSwitchPct:63.6 }, null, 2)};`;
}

async function applyFinalState() {
  if (applying) return;
  applying = true;
  try {
    applyDotSettings();
    applyStripSettings();
    await applyMobileFrame5();
    window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
    applyRippleDirection();
    enrichExport();
  } finally {
    applying = false;
  }
}

async function install() {
  while (
    !$('responsiveMobileBtn') ||
    !$('pathEdgeColor') ||
    !$('pathPulseSpeed') ||
    !document.querySelector('#dotCtls input')
  ) await raf();

  await applyFinalState();

  $('scrollScrub')?.addEventListener('input', applyRippleDirection);
  window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
  window.__ADAM_BEFORE_RENDER_HOOKS.push(applyRippleDirection);

  const copy = $('copyBtn');
  if (copy && !copy.dataset.finalFinalSync) {
    copy.dataset.finalFinalSync = 'true';
    const original = copy.onclick;
    copy.onclick = async function(event) {
      if (original) await original.call(this, event);
      enrichExport();
      try { await navigator.clipboard.writeText($('out').value); } catch {}
    };
  }

  const reset = $('resetBtn');
  if (reset && !reset.dataset.finalFinalSync) {
    reset.dataset.finalFinalSync = 'true';
    const original = reset.onclick;
    reset.onclick = async function(event) {
      if (original) await original.call(this, event);
      await raf();
      await applyFinalState();
    };
  }

  window.__ADAM_FINAL_FINAL_CALIBRATOR = { version:1, state:FINAL, apply:applyFinalState, enrichExport };

  const status = $('status');
  if (status) status.textContent += '\nfinal website state synced · straight-ribbon centreline cleanup active';
}

install();
