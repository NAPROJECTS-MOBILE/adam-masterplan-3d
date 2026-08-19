/* ============================================================================
   spline-motion.js — scroll reveal motion recovered from adam_landscape_in_use.spline

   Camera is deliberately NOT handled here.

   Verified against the FULLER GLB hierarchy:
   - GLB keeps the same Spline local transforms.
   - Main Group scale 0.22 survives in the GLB, so local unitScale is 1.
   - The nested b2 helper must NOT receive the outer b2 absolute track.
   - BOTH b2a groups survived export and contain different geometry subtrees.
     They are spatially coincident and must animate together.
   ========================================================================== */

export const MOTION_WINDOW = { start: 1.0, end: 1.75 };
const EASE = [0.42, 0, 0.58, 1];

export const TRACKS = [
  {
    key: 'b1',
    splineId: '8d97aeff-d026-4fa4-9c5d-91f5f4e910ab',
    path: 'Scene 1/Main Group/clusters/cluster 1/building 1/b1',
    base: { position: [0, -6.18, 0], scale: [1, 1, 1] },
    position: [
      { time: 1.02, value: [0, -4.18, 0] },
      { time: 1.50, value: [0, 28.824590337556465, 0] }
    ],
    scale: [
      { time: 1.02, value: [1, 0, 1] },
      { time: 1.50, value: [1, 1, 1] }
    ]
  },
  {
    key: 'b2',
    splineId: '043b5ab9-1b76-426d-9155-eb5d32019ba9',
    path: 'Scene 1/Main Group/clusters/cluster 1/b2',
    base: { position: [-348.9935362747192, -177.42, 111.03597424420946], scale: [1, 1, 1] },
    position: [
      { time: 1.00, value: [-348.99, -246.1, 111.04] },
      { time: 1.50, value: [-348.99, -195.7914015219736, 111.04] }
    ],
    scale: null
  },
  {
    key: 'b2a-outer',
    splineId: '03e42968-4e61-4fab-8ab6-87860b0a7b28',
    path: 'Scene 1/Main Group/clusters/cluster 1/b2/b2a',
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
    splineId: 'f0d8e632-0e28-453a-8d01-94ef701fab6d',
    path: 'Scene 1/Main Group/clusters/cluster 1/b2/b2/b2a',
    base: { position: [0, 61.04085877031932, 0], scale: [1, 1, 1] },
    position: [
      { time: 1.50, value: [0, 10.72, 0] },
      { time: 1.75, value: [0, 62.12002005729909, 0] }
    ],
    scale: [
      { time: 1.50, value: [1, 0, 1] },
      { time: 1.75, value: [1, 1, 1] }
    ]
  }
];

export const SKIPPED = [
  {
    splineId: '13a2a82b-4f53-4a9d-a72f-a945afc7c00f',
    path: 'Scene 1/Main Group/clusters/cluster 1/b2/b2',
    reason: 'Spline duplicates the OUTER b2 absolute-position channel here. Applying it locally to this identity helper double-translates the subtree.'
  }
];

function cubicBezier (p0, p1, p2, p3) {
  const cx = 3 * p0, bx = 3 * (p2 - p0) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1, by = 3 * (p3 - p1) - cy, ay = 1 - cy - by;
  const fx = t => ((ax * t + bx) * t + cx) * t;
  const dfx = t => (3 * ax * t + 2 * bx) * t + cx;
  const fy = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-6) return fy(t);
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return fy(t);
  };
}
const ease = cubicBezier(...EASE);
const lerp = (a,b,t) => a + (b-a)*t;

function sampleChannel(keys,t) {
  if (!keys?.length) return null;
  if (t <= keys[0].time) return keys[0].value;
  const last = keys[keys.length-1];
  if (t >= last.time) return last.value;
  for (let i=0;i<keys.length-1;i++) {
    const a=keys[i], b=keys[i+1];
    if (t>=a.time && t<=b.time) {
      const f=ease((t-a.time)/(b.time-a.time));
      return a.value.map((v,j)=>lerp(v,b.value[j],f));
    }
  }
  return last.value;
}

function cleanName(v){ return (v||'').trim(); }

function objectPath(o) {
  const names=[];
  let p=o;
  while (p) {
    if (cleanName(p.name)) names.push(cleanName(p.name));
    p=p.parent;
  }
  return names.reverse().join('/');
}

function resolvePath(model,wanted) {
  const target=cleanName(wanted).split('/').map(cleanName).filter(Boolean).join('/');
  let exact=null, suffix=null;
  model.traverse(o=>{
    if (exact) return;
    const p=objectPath(o);
    if (p===target) exact=o;
    else if (!suffix && (p===target || p.endsWith('/'+target))) suffix=o;
  });
  return exact||suffix;
}

export function createSplineMotion(model,opts={}) {
  const { debug=false, unitScale=1 }=opts;
  const bound=[],unresolved=[];
  for (const track of TRACKS) {
    const node=resolvePath(model,track.path);
    if (!node) { unresolved.push(track.path); continue; }
    bound.push({
      track,node,
      glbBase:{position:node.position.clone(),scale:node.scale.clone()}
    });
  }

  if (debug) {
    console.group('[spline-motion] GLB bindings');
    for (const b of bound) console.log(b.track.key,'->',objectPath(b.node),{
      position:b.node.position.toArray(),scale:b.node.scale.toArray()
    });
    if (unresolved.length) console.warn('UNRESOLVED',unresolved);
    console.log('Skipped helper',SKIPPED[0]);
    console.groupEnd();
  }

  function setProgress(p) {
    const clamped=Math.max(0,Math.min(1,p));
    const t=MOTION_WINDOW.start+clamped*(MOTION_WINDOW.end-MOTION_WINDOW.start);
    for (const {track,node,glbBase} of bound) {
      const pos=sampleChannel(track.position,t);
      if (pos) {
        node.position.set(
          glbBase.position.x+(pos[0]-track.base.position[0])*unitScale,
          glbBase.position.y+(pos[1]-track.base.position[1])*unitScale,
          glbBase.position.z+(pos[2]-track.base.position[2])*unitScale
        );
      }
      const scl=sampleChannel(track.scale,t);
      if (scl) {
        node.scale.set(
          glbBase.scale.x*(scl[0]/(track.base.scale[0]||1)),
          glbBase.scale.y*(scl[1]/(track.base.scale[1]||1)),
          glbBase.scale.z*(scl[2]/(track.base.scale[2]||1))
        );
      }
    }
    model.updateMatrixWorld(true);
  }

  function reset() {
    for (const {node,glbBase} of bound) {
      node.position.copy(glbBase.position);
      node.scale.copy(glbBase.scale);
    }
    model.updateMatrixWorld(true);
  }

  return {
    setProgress, reset,
    bound:bound.map(b=>({key:b.track.key,path:objectPath(b.node)})),
    unresolved
  };
}
