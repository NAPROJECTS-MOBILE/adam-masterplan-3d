import './adam-masterplan-v1.1.js?v=1.1.0';
import { AMBIENT_DRIVERS } from '../calibrate/spline-motion.js';

/*
  ADAM production V1.2 — restore calibrator block motion.
  V1 disabled ambient motion for performance, which froze the majority of the
  visible moving building/block targets. This module restores the same ambient
  driver maths used by the calibrator, but runs it only while .h-scroll is
  visible and the document is active.
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
    let lo = 0, hi = 1;
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

function find(model, path) {
  let hit = null;
  model.traverse(object => {
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

function installAmbient(api) {
  if (!api?.model || api.__ambientV12Installed) return false;
  api.__ambientV12Installed = true;

  const model = api.model;
  const bound = [];
  const unresolved = [];

  for (const driver of AMBIENT_DRIVERS) {
    let object = find(model, driver.path || driver.parentOf);
    if (driver.parentOf && object) object = object.parent;
    if (!object) {
      unresolved.push(driver.k);
      continue;
    }
    object.matrixAutoUpdate = true;
    bound.push({ driver, object, base: snap(object) });
  }

  function setAmbientTime(seconds) {
    for (const item of bound) {
      const d = item.driver;
      const o = item.object;
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

  let onscreen = true;
  let running = false;
  let rafId = 0;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
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

  api.version = '1.2.0';
  api.ambient = {
    boundCount: bound.length,
    expectedCount: AMBIENT_DRIVERS.length,
    unresolved,
    setTime: setAmbientTime,
    start,
    stop
  };

  console.info(`[ADAM V1.2] ambient block drivers bound ${bound.length}/${AMBIENT_DRIVERS.length}`, unresolved.length ? { unresolved } : '');
  start();
  return true;
}

if (!installAmbient(window.__adamMasterplanV1)) {
  const timer = setInterval(() => {
    if (installAmbient(window.__adamMasterplanV1)) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 20000);
}
