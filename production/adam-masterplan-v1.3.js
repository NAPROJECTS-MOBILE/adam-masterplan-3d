import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AMBIENT_DRIVERS } from '../calibrate/spline-motion.js';

/*
  ADAM production V1.3 — pre-motion ambient crossover fix
  -------------------------------------------------------
  V1.2 attempted to resolve ambient driver paths AFTER the production motion
  setup had already re-parented / detached parts of the GLB hierarchy. The
  calibrator does not do that: ambient targets are resolved while the original
  GLB hierarchy is still intact inside createSplineMotion(... ambient:true).

  V1.3 captures the exact ambient Object3D references at GLTF load time BEFORE
  production motion setup mutates hierarchy, then keeps those same references
  for the live ambient animation. No path re-resolution happens afterward.
*/

const E = [0.42, 0, 0.58, 1];
const DEG = Math.PI / 180;
const BOOLEAN_12_PATH = 'Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12';

function bez(p0, p1, p2, p3) {
  const cx = 3 * p0;
  const bx = 3 * (p2 - p0) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1;
  const by = 3 * (p2 - p1) - cy;
  const ay = 1 - cy - by;
  const fx = t => ((ax * t + bx) * t + cx) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  const fy = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = fx(t) - x;
      if (Math.abs(err) < 1e-6) return fy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const err = fx(t) - x;
      if (Math.abs(err) < 1e-6) break;
      if (err > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return fy(t);
  };
}

const ease = bez(...E);

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

function snap(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone()
  };
}

let captured = [];
let captureComplete = false;
let captureMissing = [];

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
    next.push({ driver, object, base: snap(object), capturedPath: pathOf(object) });
  }

  captured = next;
  captureMissing = missing;
  captureComplete = true;
  console.info(`[ADAM V1.3] pre-motion ambient targets captured ${captured.length}/${AMBIENT_DRIVERS.length}`,
    missing.length ? { missing } : '');
}

// Hook the first production GLTF load. The hook restores itself only AFTER it
// has captured the untouched GLB hierarchy, so lazy loading does not bypass it.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamV13CaptureBeforeMotion(...args) {
  const gltf = await originalLoadAsync.apply(this, args);
  if (!captureComplete && gltf?.scene) captureAmbientTargets(gltf.scene);
  GLTFLoader.prototype.loadAsync = originalLoadAsync;
  return gltf;
};

// Boot the existing production renderer only after the pre-load hook exists.
await import('./adam-masterplan-v1.1.js?v=1.1.0-v13-prebind');

function install(api) {
  if (!api?.model || api.__ambientV13Installed || !captureComplete) return false;
  api.__ambientV13Installed = true;

  const model = api.model;
  let running = false;
  let onscreen = true;
  let rafId = 0;

  function setAmbientTime(seconds) {
    for (const item of captured) {
      const d = item.driver;
      const o = item.object;

      // If a later calibration wrapper intentionally removed a node from the
      // model, do not resurrect it. Retained/re-parented nodes keep animating by
      // direct Object3D reference regardless of their new runtime path.
      let belongsToModel = false;
      for (let node = o; node; node = node.parent) {
        if (node === model) { belongsToModel = true; break; }
      }
      if (!belongsToModel) continue;

      const period = d.d / 500;
      const phase = (((seconds % period) + period) % period) / period;
      const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      const f = ease(tri);

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

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    // Same crossover order as the calibrator: ambient block motion first,
    // then the production scroll/camera pass may apply on its own scroll RAF.
    setAmbientTime(now * 0.001);
    api.renderer.render(api.scene, api.camera);
  }

  function start() {
    if (running || !onscreen || document.hidden) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  }

  const track = api.track || document.querySelector('.h-scroll');
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

  api.version = '1.3.0';
  api.ambient = {
    capturedCount: captured.length,
    expectedCount: AMBIENT_DRIVERS.length,
    missing: captureMissing,
    captured: captured.map(item => ({
      key: item.driver.k,
      markers: item.driver.m,
      capturedPath: item.capturedPath,
      object: item.object
    })),
    setTime: setAmbientTime,
    start,
    stop
  };

  console.info(`[ADAM V1.3] ambient crossover installed on ${captured.length}/${AMBIENT_DRIVERS.length} pre-motion targets`);
  start();
  return true;
}

if (!install(window.__adamMasterplanV1)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV1)) clearInterval(timer);
  }, 50);
  setTimeout(() => {
    clearInterval(timer);
    if (!window.__adamMasterplanV1?.__ambientV13Installed) {
      console.error('[ADAM V1.3] ambient crossover install timed out', {
        captureComplete,
        captured: captured.length,
        expected: AMBIENT_DRIVERS.length,
        missing: captureMissing
      });
    }
  }, 20000);
}
