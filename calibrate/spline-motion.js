/* ============================================================================
   spline-motion.js  —  v3

   Verified against:
     adam_landscape_in_use.spline
     adam_landscape_in_use_fullerversion.glb  (1,310,432 bytes,
       blob e0f91b060228cbcc6fc323ccb763a907da7e5e88)

   CHANGES FROM v2
   ---------------
   1. b1 NO LONGER animates a sibling. The v2 fallback ("b1 has no mesh, so
      animate the first sibling that does") bound to GLB `Group_4`, which is
      Spline's `Group` at y=-43.2175 — a SEPARATE, NEVER-ANIMATED building.
      It is not Spline's `Group 4` (b1's child, y=-39.3094); the names collide
      only because GLTFLoader de-duplicates with numeric suffixes.
      That mis-binding is Failure A.
   2. Nodes are resolved by EXACT GLB path, not by name + position heuristics.
   3. Ambient cylinder rotation added (Cylinder_9 / Cylinder_10).
   4. b2a-outer and b2a-inner are BOTH kept. They are genuinely distinct in the
      source: the inner b2a carries five extra meshes the outer does not.
      (An earlier note of mine called them coincident duplicates — the fuller
      GLB disproves that. Both animate in Spline; both should animate here.)
   5. The inner b2 helper (`b2_1`) remains skipped — same absolute-position
      channels as outer b2 over a [0,0,0] base would double-translate by
      [-348.99, ..., +111.04].
   ========================================================================== */

export const MOTION_WINDOW = { start: 1.0, end: 1.75 };
const EASE = [0.42, 0, 0.58, 1];          // Spline easing type 4

const ROOT = 'Scene_1/Main_Group/clusters/cluster_1';

/* ---------------------------------------------------------- scroll tracks */
export const TRACKS = [
  {
    key: 'b2',
    glbPath: ROOT + '/b2',
    base: { position: [-348.9935362747192, -177.42, 111.03597424420946], scale: [1, 1, 1] },
    position: [
      { time: 1.00, value: [-348.99, -246.1, 111.04] },
      { time: 1.50, value: [-348.99, -195.7914015219736, 111.04] }
    ],
    scale: null
  },
  {
    key: 'b2a-outer',
    glbPath: ROOT + '/b2/b2a_1',
    base: { position: [0, 61.04085877031932, 0], scale: [1, 1, 1] },
    position: [
      { time: 1.50, value: [0, 10.72, 0] },
      { time: 1.75, value: [0, 62.12002005729909, 0] }
    ],
    scale: [
      { time: 1.50, value: [1, 0, 1] },
      { time: 1.75, value: [1, 1, 1] }
    ]
  },
  {
    key: 'b2a-inner',
    glbPath: ROOT + '/b2/b2_1/b2a',
    base: { position: [0, 61.04085877031932, 0], scale: [1, 1, 1] },
    position: [
      { time: 1.50, value: [0, 10.72, 0] },
      { time: 1.75, value: [0, 62.12002005729909, 0] }
    ],
    scale: [
      { time: 1.50, value: [1, 0, 1] },
      { time: 1.75, value: [1, 1, 1] }
    ]
  },
  {
    // Present but INERT until the GLB carries b1's geometry. See report.
    key: 'b1',
    glbPath: ROOT + '/building_1/b1',
    requiresGeometry: true,
    base: { position: [0, -6.18, 0], scale: [1, 1, 1] },
    position: [
      { time: 1.02, value: [0, -4.18, 0] },
      { time: 1.50, value: [0, 28.824590337556465, 0] }
    ],
    scale: [
      { time: 1.02, value: [1, 0, 1] },
      { time: 1.50, value: [1, 1, 1] }
    ]
  }
];

/* --------------------------------------------------------- ambient tracks */
/* Start-event ping-pong: 5 s out, 5 s back, looping. Rotation about each
   node's own Y axis — both sit on the cylinder axis and their hiddenMatrix
   is identity, so there is no pivot to reconstruct and no orbit involved. */
export const AMBIENT_ROTATIONS = [
  { key: 'Cylinder_10', glbPath: ROOT + '/b11/cyln_building_1/Cylinder_10',
    fromDeg: -41, toDeg: 21, durationMs: 5000 },
  { key: 'Cylinder_9',  glbPath: ROOT + '/b11/cyln_building_1/Cylinder_9',
    fromDeg: 23,  toDeg: -45, durationMs: 5000 }
];

/* ------------------------------------------------------------------ maths */
function cubicBezier (p0, p1, p2, p3) {
  const cx = 3*p0, bx = 3*(p2-p0)-cx, ax = 1-cx-bx;
  const cy = 3*p1, by = 3*(p3-p1)-cy, ay = 1-cy-by;
  const fx = t => ((ax*t+bx)*t+cx)*t, dfx = t => (3*ax*t+2*bx)*t+cx, fy = t => ((ay*t+by)*t+cy)*t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i=0;i<8;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)return fy(t);const d=dfx(t);if(Math.abs(d)<1e-6)break;t-=e/d;}
    let lo=0,hi=1;t=x;
    for (let i=0;i<20;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)break;if(e>0)hi=t;else lo=t;t=(lo+hi)/2;}
    return fy(t);
  };
}
const ease = cubicBezier(...EASE);
const lerp = (a, b, t) => a + (b - a) * t;

function sampleChannel (keys, t) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.time && t <= b.time) {
      const f = ease((t - a.time) / (b.time - a.time));
      return a.value.map((v, j) => lerp(v, b.value[j], f));
    }
  }
  return last.value;
}

const pathOf = (o) => { const a = []; let p = o; while (p) { if (p.name) a.push(p.name); p = p.parent; } return a.reverse().join('/'); };
const findByPath = (model, path) => { let hit = null; model.traverse(o => { if (!hit && pathOf(o) === path) hit = o; }); return hit; };
const hasGeometry = (o) => { let f = false; o.traverse(c => { if (c.isMesh) f = true; }); return f; };

/* ---------------------------------------------------------------- factory */
export function createSplineMotion (model, opts = {}) {
  const { debug = false, unitScale = 1, ambient = true } = opts;

  const bound = [], unresolved = [], inert = [];

  for (const track of TRACKS) {
    const node = findByPath(model, track.glbPath);
    if (!node) { unresolved.push(track.key); continue; }
    if (track.requiresGeometry && !hasGeometry(node)) {
      // Bind but do not drive: the node exists and is correctly identified,
      // it simply has no geometry in this export. Animating a substitute is
      // what produced Failure A, so we refuse to guess.
      inert.push({ key: track.key, path: track.glbPath, reason: 'no geometry under this node in the GLB' });
      continue;
    }
    node.matrixAutoUpdate = true;
    bound.push({ track, node, glbBase: { position: node.position.clone(), scale: node.scale.clone() } });
  }

  const spins = [];
  if (ambient) {
    for (const spec of AMBIENT_ROTATIONS) {
      const node = findByPath(model, spec.glbPath);
      if (!node) { unresolved.push(spec.key); continue; }
      node.matrixAutoUpdate = true;
      spins.push({ spec, node, baseRotY: node.rotation.y });
    }
  }

  if (debug) {
    console.group('[spline-motion v3]');
    for (const b of bound) console.log('scroll  ', b.track.key, '=>', pathOf(b.node));
    for (const s of spins) console.log('ambient ', s.spec.key, '=>', pathOf(s.node),
      (s.baseRotY * 180 / Math.PI).toFixed(1) + 'deg');
    for (const i of inert) console.warn('INERT   ', i.key, '-', i.reason, '(', i.path, ')');
    if (unresolved.length) console.error('UNRESOLVED', unresolved);
    console.log('skipped by design: b2_1 (inner b2 helper - would double-translate)');
    console.groupEnd();
  }

  function setProgress (p) {
    const progress = Math.max(0, Math.min(1, p));
    const t = MOTION_WINDOW.start + progress * (MOTION_WINDOW.end - MOTION_WINDOW.start);

    for (const { track, node, glbBase } of bound) {
      const pos = sampleChannel(track.position, t);
      if (pos) {
        node.position.set(
          glbBase.position.x + (pos[0] - track.base.position[0]) * unitScale,
          glbBase.position.y + (pos[1] - track.base.position[1]) * unitScale,
          glbBase.position.z + (pos[2] - track.base.position[2]) * unitScale
        );
      }
      const scl = sampleChannel(track.scale, t);
      if (scl) {
        node.scale.set(
          glbBase.scale.x * (scl[0] / (track.base.scale[0] || 1)),
          glbBase.scale.y * (scl[1] / (track.base.scale[1] || 1)),
          glbBase.scale.z * (scl[2] / (track.base.scale[2] || 1))
        );
      }
      node.updateMatrix();
      node.matrixWorldNeedsUpdate = true;
    }
    model.updateMatrixWorld(true);
  }

  /* seconds -> ping-pong rotation. 10 s full cycle per the Start-event tweens. */
  function setAmbientTime (seconds) {
    if (!spins.length) return;
    for (const { spec, node } of spins) {
      const period = (spec.durationMs / 1000) * 2;
      const phase = ((seconds % period) + period) % period / period;
      const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      const f = ease(tri);
      const deg = lerp(spec.fromDeg, spec.toDeg, f);
      node.rotation.y = deg * Math.PI / 180;
      node.updateMatrix();
      node.matrixWorldNeedsUpdate = true;
    }
    model.updateMatrixWorld(true);
  }

  function reset () {
    for (const { node, glbBase } of bound) {
      node.position.copy(glbBase.position);
      node.scale.copy(glbBase.scale);
      node.updateMatrix();
      node.matrixWorldNeedsUpdate = true;
    }
    for (const { node, baseRotY } of spins) {
      node.rotation.y = baseRotY;
      node.updateMatrix();
      node.matrixWorldNeedsUpdate = true;
    }
    model.updateMatrixWorld(true);
  }

  return {
    setProgress, setAmbientTime, reset,
    bound: bound.map(b => ({ key: b.track.key, path: pathOf(b.node) })),
    spins: spins.map(s => ({ key: s.spec.key, path: pathOf(s.node) })),
    inert, unresolved,
    hasAmbient: spins.length > 0
  };
}
