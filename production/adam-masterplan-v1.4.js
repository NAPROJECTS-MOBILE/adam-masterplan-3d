import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AMBIENT_DRIVERS } from '../calibrate/spline-motion.js';

/*
  ADAM production V1.4 — mobile smoothness + adaptive sharpness
  --------------------------------------------------------------
  Goals:
  - Keep the V1.3 pre-motion ambient target capture that is known to match the
    working block motion.
  - Prevent duplicate WebGL draws while scrolling by making one render owner.
  - Raise mobile sharpness from the old fixed DPR 1.4 and adapt DPR downward
    only when a device cannot sustain smooth frames.
  - Pause the continuous draw loop while the .h-scroll section is offscreen or
    the document is hidden.

  The legacy V1 scroll handler still updates camera / scroll motion state. Its
  renderer.render() calls are intercepted and coalesced into this module's
  single visible-section draw loop, so the GPU is not asked to draw the scene
  twice on scroll frames.
*/

const DEG = Math.PI / 180;
const BOOLEAN_12_PATH = 'Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12';

function cubicBezier(p0, p1, p2, p3) {
  const cx = 3 * p0;
  const bx = 3 * (p2 - p0) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1;
  const by = 3 * (p2 - p1) - cy;
  const ay = 1 - cy - by;
  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleDX = t => (3 * ax * t + 2 * bx) * t + cx;
  const sampleY = t => ((ay * t + by) * t + cy) * t;

  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;

    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return sampleY(t);
      const slope = sampleDX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }

    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) break;
      if (error > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

const ambientEase = cubicBezier(0.42, 0, 0.58, 1);

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function findByPath(root, path) {
  let hit = null;
  root?.traverse?.(object => {
    if (!hit && pathOf(object) === path) hit = object;
  });
  return hit;
}

function snapshot(object) {
  return {
    position: object.position.clone(),
    scale: object.scale.clone()
  };
}

let captured = [];
let captureMissing = [];
let captureComplete = false;

function captureAmbientTargets(root) {
  const next = [];
  const missing = [];

  for (const driver of AMBIENT_DRIVERS) {
    let object = findByPath(root, driver.path || driver.parentOf);
    if (driver.parentOf && object) object = object.parent;

    if (!object) {
      missing.push({ key: driver.k, path: driver.path || driver.parentOf });
      continue;
    }

    object.matrixAutoUpdate = true;
    next.push({
      driver,
      object,
      base: snapshot(object),
      capturedPath: pathOf(object)
    });
  }

  captured = next;
  captureMissing = missing;
  captureComplete = true;
  console.info(
    `[ADAM V1.4] pre-motion ambient targets captured ${captured.length}/${AMBIENT_DRIVERS.length}`,
    missing.length ? { missing } : ''
  );
}

// Capture targets from the untouched GLB before the production motion wrapper
// performs any hierarchy cleanup/re-parenting. This preserves the V1.3 fix.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamV14CaptureBeforeMotion(...args) {
  const gltf = await originalLoadAsync.apply(this, args);
  if (!captureComplete && gltf?.scene) captureAmbientTargets(gltf.scene);
  GLTFLoader.prototype.loadAsync = originalLoadAsync;
  return gltf;
};

// V1.1 gives us the corrected final scroll-motion keyframe without importing
// V1.3's second animation/render RAF.
await import('./adam-masterplan-v1.1.js?v=1.1.0-v14');

function install(api) {
  if (!api?.model || api.__v14Installed || !captureComplete) return false;
  api.__v14Installed = true;

  const model = api.model;
  const renderer = api.renderer;
  const scene = api.scene;
  const camera = api.camera;
  const track = api.track || document.querySelector('.h-scroll');
  const root = document.querySelector('[data-adam-masterplan-v1]');
  const isMobile = matchMedia('(max-width: 767px)').matches;
  const deviceDpr = Math.max(1, window.devicePixelRatio || 1);

  // Keep the original renderer function privately. Legacy V1 scroll renders
  // are turned into no-ops; this V1.4 loop is the only WebGL draw owner.
  const rawRender = renderer.render.bind(renderer);
  renderer.render = () => {};

  let running = false;
  let onscreen = true;
  let rafId = 0;
  let lastNow = 0;
  let frameSamples = [];
  let framesSinceDprChange = 0;

  const mobileMinDpr = Math.min(deviceDpr, 1.35);
  const mobileMaxDpr = Math.min(deviceDpr, 1.75);
  let activeDpr = isMobile ? Math.min(deviceDpr, 1.65) : renderer.getPixelRatio();

  function applyDpr(next) {
    const clamped = isMobile
      ? Math.max(mobileMinDpr, Math.min(mobileMaxDpr, next))
      : next;
    if (Math.abs(clamped - activeDpr) < 0.01) return;

    activeDpr = Number(clamped.toFixed(2));
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setPixelRatio(activeDpr);
    renderer.setSize(size.x, size.y, false);
    if (root) root.dataset.adamDpr = activeDpr.toFixed(2);
    frameSamples.length = 0;
    framesSinceDprChange = 0;
    console.info(`[ADAM V1.4] mobile DPR -> ${activeDpr.toFixed(2)}`);
  }

  // The legacy core starts mobile at DPR 1.4. Raise it immediately for a
  // sharper image, then let the frame-time governor decide if it must fall.
  if (isMobile) {
    activeDpr = renderer.getPixelRatio();
    applyDpr(Math.min(deviceDpr, 1.65));
  }

  function setAmbientTime(seconds) {
    for (const item of captured) {
      const d = item.driver;
      const o = item.object;

      let belongsToModel = false;
      for (let node = o; node; node = node.parent) {
        if (node === model) {
          belongsToModel = true;
          break;
        }
      }
      if (!belongsToModel) continue;

      const period = d.d / 500;
      const phase = (((seconds % period) + period) % period) / period;
      const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      const f = ambientEase(tri);

      if (d.p) {
        let y = d.preserveY ? item.base.position.y : d.p[1] + d.dp[1] * f;
        if ((d.path || '') === BOOLEAN_12_PATH) y += 2;
        o.position.set(
          d.p[0] + d.dp[0] * f,
          y,
          d.p[2] + d.dp[2] * f
        );
      }

      if (d.r) {
        o.rotation.set(
          (d.r[0] + d.dr[0] * f) * DEG,
          (d.r[1] + d.dr[1] * f) * DEG,
          (d.r[2] + d.dr[2] * f) * DEG
        );
      }

      if (d.level) o.rotation.set(0, 0, 0);

      if (d.s) {
        o.scale.set(
          d.s[0] + d.ds[0] * f,
          d.s[1] + d.ds[1] * f,
          d.s[2] + d.ds[2] * f
        );
      }

      o.updateMatrix();
      o.matrixWorldNeedsUpdate = true;
    }
    model.updateMatrixWorld(true);
  }

  function updateAdaptiveDpr(now) {
    if (!isMobile || !lastNow) return;
    const dt = now - lastNow;

    // Ignore tab resumes / large browser scheduling gaps; they are not GPU
    // performance measurements and would incorrectly force resolution down.
    if (dt > 4 && dt < 80) frameSamples.push(dt);
    if (frameSamples.length > 90) frameSamples.shift();
    framesSinceDprChange++;

    if (frameSamples.length < 60 || framesSinceDprChange < 120) return;

    const avg = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;

    // Sustained ~48fps or worse: shed a little resolution. Sustained ~60fps:
    // cautiously give quality back. Hysteresis prevents visible oscillation.
    if (avg > 20.5 && activeDpr > mobileMinDpr + 0.02) {
      applyDpr(activeDpr - 0.10);
    } else if (avg < 16.9 && activeDpr < mobileMaxDpr - 0.02 && framesSinceDprChange > 240) {
      applyDpr(activeDpr + 0.05);
    }
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    updateAdaptiveDpr(now);
    setAmbientTime(now * 0.001);

    // Scroll/camera transforms are updated by the existing lightweight V1
    // scroll handler. This is the only actual WebGL draw on the frame.
    rawRender(scene, camera);
    lastNow = now;
  }

  function start() {
    if (running || !onscreen || document.hidden) return;
    running = true;
    lastNow = 0;
    frameSamples.length = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    lastNow = 0;
    frameSamples.length = 0;
  }

  if (track) {
    new IntersectionObserver(entries => {
      onscreen = entries.some(entry => entry.isIntersecting);
      if (onscreen) start();
      else stop();
    }, { rootMargin: '25% 0px' }).observe(track);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  api.version = '1.4.0';
  api.performance = {
    mode: 'single-draw-adaptive-dpr',
    mobile: isMobile,
    get dpr() { return activeDpr; },
    minDpr: isMobile ? mobileMinDpr : renderer.getPixelRatio(),
    maxDpr: isMobile ? mobileMaxDpr : renderer.getPixelRatio(),
    setDpr: value => applyDpr(Number(value)),
    start,
    stop
  };
  api.ambient = {
    capturedCount: captured.length,
    expectedCount: AMBIENT_DRIVERS.length,
    missing: captureMissing,
    setTime: setAmbientTime
  };

  if (root) {
    root.dataset.adamVersion = '1.4.0';
    root.dataset.adamDpr = activeDpr.toFixed(2);
  }

  console.info(
    `[ADAM V1.4] single-draw loop installed; ambient ${captured.length}/${AMBIENT_DRIVERS.length}; DPR ${activeDpr.toFixed(2)}`
  );
  start();
  return true;
}

if (!install(window.__adamMasterplanV1)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV1)) clearInterval(timer);
  }, 50);

  setTimeout(() => {
    clearInterval(timer);
    if (!window.__adamMasterplanV1?.__v14Installed) {
      console.error('[ADAM V1.4] install timed out', {
        captureComplete,
        captured: captured.length,
        expected: AMBIENT_DRIVERS.length,
        missing: captureMissing
      });
    }
  }, 20000);
}
