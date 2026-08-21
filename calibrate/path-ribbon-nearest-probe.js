import * as THREE from 'three';

/*
  Diagnostic only. Does not touch path geometry, materials, visibility, depth,
  camera, motion, or any calibrator styling.

  The scene canvas can sit underneath non-interactive layout layers, so browser
  pointer events do NOT reliably have the canvas as event.target. This probe
  therefore identifies by pointer COORDINATES inside the rendered canvas rect,
  not by DOM hit target. While Click identify is ON it also previews the nearest
  path rail on hover, so the tiny remaining spur ends do not need to be directly
  clickable at all.
*/

let lastRenderer = null;
let lastCamera = null;
let hoverFrame = 0;
let hoverEvent = null;

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

function canvasRect() {
  const canvas = lastRenderer?.domElement;
  return canvas?.getBoundingClientRect?.() || null;
}

function insideCanvas(clientX, clientY) {
  const rect = canvasRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  return clientX >= rect.left && clientX <= rect.right &&
         clientY >= rect.top && clientY <= rect.bottom;
}

function identifyEnabled() {
  return !!document.getElementById('pathRailIdentifyBtn')?.classList.contains('on');
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

function showHover(clientX, clientY) {
  if (!identifyEnabled() || !insideCanvas(clientX, clientY)) return;
  const best = nearestRail(clientX, clientY);
  const probe = document.getElementById('pathRibbonProbe');
  if (!best || !probe) return;
  probe.textContent = `HOVER: ${shortPath(best.sourcePath)} · ${best.distancePx.toFixed(1)}px from pointer · press/click here to lock details`;
}

function onPointerMove(event) {
  if (!identifyEnabled() || !insideCanvas(event.clientX, event.clientY)) return;
  hoverEvent = { x:event.clientX, y:event.clientY };
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    const p = hoverEvent;
    hoverEvent = null;
    if (p) showHover(p.x, p.y);
  });
}

function nearestIdentifyFromPointer(event) {
  if (!identifyEnabled()) return;

  // IMPORTANT: do not inspect event.target here. The visible scene may be under
  // a frame/overlay with pointer-events routed elsewhere. Coordinates are the
  // authoritative test for whether the user pressed inside the rendered scene.
  if (!insideCanvas(event.clientX, event.clientY)) return;

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

// Capture phase means this works even when another scene/layout element owns the
// actual DOM hit. pointerdown fires earlier and more reliably than click here.
document.addEventListener('pointermove', onPointerMove, true);
document.addEventListener('pointerdown', nearestIdentifyFromPointer, true);

window.__ADAM_NEAREST_PATH_RAIL = nearestRail;
