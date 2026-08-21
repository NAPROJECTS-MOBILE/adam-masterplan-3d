import * as THREE from 'three';

/*
  Diagnostic only. Does not touch path geometry, materials, visibility, depth,
  camera, motion, or any calibrator styling.

  The remaining tiny spur-end artefacts are too small/non-pickable for Three's
  normal raycaster. When Click identify is ON, this probe finds the nearest
  already-rendered path rail in SCREEN SPACE instead, so a click near the dot is
  enough to identify its source mesh.
*/

let lastRenderer = null;
let lastCamera = null;

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamNearestPathProbeRender(scene, camera) {
  lastRenderer = this;
  lastCamera = camera;
  return previousRender.call(this, scene, camera);
};

function shortPath(path) {
  return String(path || '').replace('Scene_1/Main_Group/paths/', '');
}

function screenPoint(attribute, index, matrixWorld, camera, rect, out) {
  out.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  out.applyMatrix4(matrixWorld).project(camera);
  return {
    x: rect.left + (out.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - out.y) * 0.5 * rect.height,
    z: out.z
  };
}

function pointSegmentDistanceSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-9) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = px - qx;
  const dy = py - qy;
  return dx * dx + dy * dy;
}

function nearestRail(clientX, clientY) {
  const entries = window.__ADAM_PATH_RAIL_LAYERS;
  const canvas = lastRenderer?.domElement;
  if (!Array.isArray(entries) || !entries.length || !canvas || !lastCamera) return null;

  const rect = canvas.getBoundingClientRect();
  const v = new THREE.Vector3();
  let best = null;

  for (const entry of entries) {
    const line = entry?.edge;
    const start = line?.geometry?.attributes?.instanceStart;
    const end = line?.geometry?.attributes?.instanceEnd;
    if (!line || !start || !end) continue;

    line.updateWorldMatrix(true, false);
    const count = Math.min(start.count, end.count);

    for (let i = 0; i < count; i++) {
      const a = screenPoint(start, i, line.matrixWorld, lastCamera, rect, v);
      const b = screenPoint(end, i, line.matrixWorld, lastCamera, rect, v);

      // Segments entirely outside the camera depth range cannot be what the
      // user is seeing, so ignore them before doing the 2D distance check.
      if ((a.z < -1 && b.z < -1) || (a.z > 1 && b.z > 1)) continue;

      const d2 = pointSegmentDistanceSq(clientX, clientY, a.x, a.y, b.x, b.y);
      if (!best || d2 < best.distanceSq) {
        best = {
          entry,
          distanceSq:d2,
          distancePx:Math.sqrt(d2),
          sourcePath:line.userData?.adamPathRailSource || ''
        };
      }
    }
  }

  return best;
}

function nearestIdentifyFromClick(event) {
  const button = document.getElementById('pathRailIdentifyBtn');
  if (!button?.classList.contains('on')) return;

  const canvas = lastRenderer?.domElement;
  if (!canvas || event.target !== canvas) return;

  const best = nearestRail(event.clientX, event.clientY);
  const probe = document.getElementById('pathRibbonProbe');
  if (!best) {
    if (probe) probe.textContent = 'Nearest probe: no rendered path rail data available.';
    return;
  }

  const rows = window.__ADAM_PATH_RAIL_AUDIT_ROWS?.() || [];
  const row = rows.find(item => item.fullPath === best.sourcePath);
  const label = shortPath(best.sourcePath);
  const dist = best.distancePx.toFixed(1);

  console.info('[ADAM nearest path probe]', {
    distancePx:best.distancePx,
    sourcePath:best.sourcePath,
    audit:row || null
  });

  if (probe) {
    probe.textContent = row
      ? `NEAREST: ${label} · ${dist}px away · rails ${row.rails} · segs ${row.segments} · centre offset ${row.centreOffset} · shared geometry ×${row.geometrySharedBy}`
      : `NEAREST: ${label} · ${dist}px away · ${best.sourcePath}`;
  }
}

// Register after the original click-identify handler. If its raycast misses,
// this screen-space result becomes the final diagnostic text shown to the user.
setTimeout(() => document.addEventListener('click', nearestIdentifyFromClick, true), 0);

window.__ADAM_NEAREST_PATH_RAIL = nearestRail;
