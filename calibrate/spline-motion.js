/* ============================================================================
   spline-motion.js — v5 / 53-object visual acceptance implementation

   Sources:
     - adam_landscape_in_use.spline
     - adam_landscape_in_use_fullerversion.glb
     - 51 user-picked MOVE targets + 2 screenshot-confirmed targets = 53 visible
       moving blocks.

   IMPORTANT:
     The 53 visible blocks collapse to 21 runtime drivers. Several selected
     blocks inherit one parent/component motion and must NOT be animated
     independently. The cluster-4 mesh_9 family is special: only the 9 copies
     the user selected are placed under a runtime wrapper, so the unselected
     sibling is not accidentally moved.

   The existing b2/b2a scroll reveal remains separate from ambient Start-event
   motion. b1 remains inert because its correct visible geometry is absent from
   this GLB; never substitute the neighbouring Group_4 again.
   ========================================================================== */

export const MOTION_WINDOW = { start: 1.0, end: 1.75 };
const EASE = [0.42, 0, 0.58, 1];
const DEG = Math.PI / 180;
const ROOT = 'Scene_1/Main_Group/clusters/cluster_1';

/* ---------------------------------------------------------- main scroll */
export const TRACKS = [
  {
    key: 'b2',
    glbPath: ROOT + '/b2',
    base: { position: [-348.9935362747192, -177.42, 111.03597424420946], scale: [1,1,1] },
    position: [
      { time: 1.00, value: [-348.99, -246.1, 111.04] },
      { time: 1.50, value: [-348.99, -195.7914015219736, 111.04] }
    ],
    scale: null
  },
  {
    key: 'b2a-outer',
    glbPath: ROOT + '/b2/b2a_1',
    base: { position: [0,61.04085877031932,0], scale: [1,1,1] },
    position: [
      { time: 1.50, value: [0,10.72,0] },
      { time: 1.75, value: [0,62.12002005729909,0] }
    ],
    scale: [
      { time: 1.50, value: [1,0,1] },
      { time: 1.75, value: [1,1,1] }
    ]
  },
  {
    key: 'b2a-inner',
    glbPath: ROOT + '/b2/b2_1/b2a',
    base: { position: [0,61.04085877031932,0], scale: [1,1,1] },
    position: [
      { time: 1.50, value: [0,10.72,0] },
      { time: 1.75, value: [0,62.12002005729909,0] }
    ],
    scale: [
      { time: 1.50, value: [1,0,1] },
      { time: 1.75, value: [1,1,1] }
    ]
  },
  {
    key: 'b1',
    glbPath: ROOT + '/building_1/b1',
    requiresGeometry: true,
    base: { position: [0,-6.18,0], scale: [1,1,1] },
    position: [
      { time: 1.02, value: [0,-4.18,0] },
      { time: 1.50, value: [0,28.824590337556465,0] }
    ],
    scale: [
      { time: 1.02, value: [1,0,1] },
      { time: 1.50, value: [1,1,1] }
    ]
  }
];

/* -------------------------------------------------- 53 visible MOVE targets
   All transform values are authoritative Spline LOCAL-space values.
   Each Start-event driver runs base -> state -> base on its own clock.
   Full ping-pong period = durationMs * 2.
*/
export const AMBIENT_DRIVERS = [
  {
    "key": "cluster4-building-boolean-1",
    "markers": ["M01"],
    "visualCount": 1,
    "durationMs": 4000,
    "base": {"position": [-0.2327,-16.5752,-120.3745],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [1.7902,-15.4649,0],"scale": [0.0417,-0.4686,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_4_/building_1/Boolean_1"
  },
  {
    "key": "cluster4-building-boolean-0",
    "markers": ["M02"],
    "visualCount": 1,
    "durationMs": 4000,
    "base": {"position": [-0.2327,-16.5752,-120.3745],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [1.378,-13.9109,0],"scale": [0.0321,-0.4215,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_4_/building/Boolean"
  },
  {
    "key": "cluster4-rectangle-replicas",
    "markers": ["M03","M04","M06","M07","M08","M09","M10","M11","M12"],
    "visualCount": 9,
    "durationMs": 5000,
    "base": {"position": [378.2109,-245.6674,1188.3818],"rotation": [1.1571,0,0],"scale": [1.9,1.9379,2.0551]},
    "delta": {"position": [0,1.6507,-86.8854]},
    "subsetPaths": [
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_1",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_3",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_7",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_9",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_10",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_8",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_6",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_4",
      "Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_2"
    ]
  },
  {
    "key": "cluster4-rectangle-original",
    "markers": ["M05"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [378.2109,-245.6674,1188.3818],"rotation": [1.1571,0,0],"scale": [1.9,1.9379,2.0551]},
    "delta": {"position": [0,1.6507,-86.8854]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5"
  },
  {
    "key": "villa-instance-2",
    "markers": ["M13","M14","M15","M16","M17","M18","M19"],
    "visualCount": 7,
    "durationMs": 4000,
    "base": {"position": [-32.7428,43.8948,-33.1583],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [0,-25.2718,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1"
  },
  {
    "key": "villa-base",
    "markers": ["M20","M21","M22","M23","M24","M25","M33"],
    "visualCount": 7,
    "durationMs": 4000,
    "base": {"position": [-32.7428,43.8948,-33.1583],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [0,-25.2718,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_3/villa/Group_3"
  },
  {
    "key": "villa-instance-1",
    "markers": ["M26","M27","M28","M29","M30","M31","M32"],
    "visualCount": 7,
    "durationMs": 4000,
    "base": {"position": [-32.7428,43.8948,-33.1583],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [0,-25.2718,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2"
  },
  {
    "key": "villa-instance-3",
    "markers": ["M34","M35","M36","M37","M38","M39","M40"],
    "visualCount": 7,
    "durationMs": 4000,
    "base": {"position": [-32.7428,43.8948,-33.1583],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [0,-25.2718,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group"
  },
  {
    "key": "cluster2-building2-parent",
    "markers": ["M41"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [-176.4822,4.8872,567.5681],"rotation": [0,0,0],"scale": [0.8213,1,0.8119]},
    "delta": {"position": [-81.7757,0,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_2/building_2_3"
  },
  {
    "key": "cluster2-building-parent",
    "markers": ["M42"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [-176.4822,4.8872,766.0778],"rotation": [0,0,0],"scale": [0.8213,1,0.8119]},
    "delta": {"position": [-59.7516,0,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_2/building_3"
  },
  {
    "key": "cluster2-rect36",
    "markers": ["M43"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [0,22.6438,0],"rotation": [-90,0,0],"scale": [0.67,0.67,0.67]},
    "delta": {"position": [0,-86.0529,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_2/building_2_1/Rectangle_36_3"
  },
  {
    "key": "cluster2-boolean12",
    "markers": ["M44"],
    "visualCount": 1,
    "durationMs": 4000,
    "base": {"position": [0,0,-0.6541],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [0,-31.8988,3.4548],"scale": [0,-0.4557,0.0618]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12"
  },
  {
    "key": "cylinder10",
    "markers": ["M45"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [0,157.5364,0],"rotation": [0,-41,0],"scale": [1.1,1.1,1.1]},
    "delta": {"rotation": [0,62,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_10"
  },
  {
    "key": "cylinder9",
    "markers": ["M46"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [0,60.7049,0],"rotation": [0,23,0],"scale": [1.12,1.12,1.12]},
    "delta": {"rotation": [0,-68,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_9"
  },
  {
    "key": "cluster1-rect11",
    "markers": ["M47"],
    "visualCount": 1,
    "durationMs": 4000,
    "base": {"position": [-0.0393,-65.9716,-0.3635],"rotation": [-90,0,0],"scale": [1,1,0.74]},
    "delta": {"scale": [0,0,0.26]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/b4/building_grp/building_7/Rectangle_11_5"
  },
  {
    "key": "cluster1-rect6",
    "markers": ["M48"],
    "visualCount": 1,
    "durationMs": 4000,
    "base": {"position": [-0.0872,-249.5,-0.7082],"rotation": [-90,0,0],"scale": [1,1,1]},
    "delta": {"scale": [0,0,-0.11]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/b7/Rectangle_6_4"
  },
  {
    "key": "cluster1-building2-rect3",
    "markers": ["M49"],
    "visualCount": 1,
    "durationMs": 3000,
    "base": {"position": [-0.2327,-49.5752,-0.3031],"rotation": [-90,0,0],"scale": [1,1,0.41]},
    "delta": {"scale": [0,0,0.59]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/building_2/Rectangle_3_1"
  },
  {
    "key": "cluster1-b9-boolean",
    "markers": ["M50"],
    "visualCount": 1,
    "durationMs": 5000,
    "base": {"position": [0,0,-0.6541],"rotation": [0,0,0],"scale": [1,1,1]},
    "delta": {"position": [0,-32.8,2.3767],"scale": [0,-0.4686,0.0425]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/b9/Boolean_11"
  },
  {
    "key": "cluster1-building14-rect36",
    "markers": ["M51"],
    "visualCount": 1,
    "durationMs": 3000,
    "base": {"position": [0,26.5023,0],"rotation": [-90,0,0],"scale": [0.67,0.67,0.67]},
    "delta": {"position": [0,-56.2556,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_1/building_14/Rectangle_36_2"
  },
  {
    "key": "cluster4-group2-rect2",
    "markers": ["M52"],
    "visualCount": 1,
    "durationMs": 3000,
    "base": {"position": [-132.2172,56.6908,-48.1955],"rotation": [-90,0,90],"scale": [1,1,1]},
    "delta": {"position": [0,-20.3608,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_2"
  },
  {
    "key": "cluster4-group2-rect3",
    "markers": ["M53"],
    "visualCount": 1,
    "durationMs": 3000,
    "base": {"position": [-132.2172,56.6908,70.7835],"rotation": [-90,0,90],"scale": [1,1,1]},
    "delta": {"position": [0,-16.6119,0]},
    "glbPath": "Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_3"
  }
];

/* ---------------------------------------------------------------- maths */
function cubicBezier(p0,p1,p2,p3) {
  const cx=3*p0,bx=3*(p2-p0)-cx,ax=1-cx-bx;
  const cy=3*p1,by=3*(p3-p1)-cy,ay=1-cy-by;
  const fx=t=>((ax*t+bx)*t+cx)*t;
  const dfx=t=>(3*ax*t+2*bx)*t+cx;
  const fy=t=>((ay*t+by)*t+cy)*t;
  return x=>{
    if(x<=0)return 0;
    if(x>=1)return 1;
    let t=x;
    for(let i=0;i<8;i++){
      const e=fx(t)-x;
      if(Math.abs(e)<1e-6)return fy(t);
      const d=dfx(t);
      if(Math.abs(d)<1e-6)break;
      t-=e/d;
    }
    let lo=0,hi=1;
    t=x;
    for(let i=0;i<20;i++){
      const e=fx(t)-x;
      if(Math.abs(e)<1e-6)break;
      if(e>0)hi=t; else lo=t;
      t=(lo+hi)/2;
    }
    return fy(t);
  };
}
const ease=cubicBezier(...EASE);
const lerp=(a,b,t)=>a+(b-a)*t;

function sampleChannel(keys,t) {
  if(!keys?.length)return null;
  if(t<=keys[0].time)return keys[0].value;
  const last=keys[keys.length-1];
  if(t>=last.time)return last.value;
  for(let i=0;i<keys.length-1;i++){
    const a=keys[i],b=keys[i+1];
    if(t>=a.time&&t<=b.time){
      const f=ease((t-a.time)/(b.time-a.time));
      return a.value.map((v,j)=>lerp(v,b.value[j],f));
    }
  }
  return last.value;
}

function pathOf(o) {
  const out=[];
  let p=o;
  while(p) {
    if(p.name)out.push(p.name);
    p=p.parent;
  }
  return out.reverse().join('/');
}

function findByPath(model,path) {
  let hit=null;
  model.traverse(o=>{
    if(!hit&&pathOf(o)===path)hit=o;
  });
  return hit;
}

function hasGeometry(o) {
  let found=false;
  o.traverse(c=>{if(c.isMesh)found=true;});
  return found;
}

function captureTransform(node) {
  return {
    position:node.position.clone(),
    rotation:node.rotation.clone(),
    quaternion:node.quaternion.clone(),
    scale:node.scale.clone()
  };
}

function restoreTransform(node,t) {
  node.position.copy(t.position);
  node.quaternion.copy(t.quaternion);
  node.scale.copy(t.scale);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate=true;
}

/* The 9 selected mesh_9 replicas share one unnamed GLB parent with one extra
   unselected sibling. Moving that parent would create a false positive.
   Clone the parent's transform into a new sibling wrapper, move only the 9
   selected children under it, and animate that wrapper instead. */
function buildSubsetWrapper(model,spec) {
  const members=spec.subsetPaths.map(path=>({path,node:findByPath(model,path)}));
  const missing=members.filter(x=>!x.node).map(x=>x.path);
  if(missing.length)return {node:null,missing};

  const oldParent=members[0].node.parent;
  if(!oldParent || members.some(x=>x.node.parent!==oldParent)) {
    return {node:null,missing:['selected subset does not share one parent']};
  }
  const host=oldParent.parent;
  if(!host)return {node:null,missing:['selected subset parent has no host']};

  const wrapper=oldParent.clone(false);
  wrapper.name='';
  wrapper.userData={...wrapper.userData,adamMotionSubset:spec.key};
  wrapper.matrixAutoUpdate=true;
  host.add(wrapper);

  for(const {node} of members)wrapper.add(node);
  wrapper.updateMatrix();
  wrapper.updateMatrixWorld(true);

  return {node:wrapper,missing:[]};
}

/* --------------------------------------------------------------- factory */
export function createSplineMotion(model,opts={}) {
  const {debug=false,unitScale=1,ambient=true}=opts;

  const bound=[];
  const ambientBindings=[];
  const unresolved=[];
  const inert=[];

  for(const track of TRACKS) {
    const node=findByPath(model,track.glbPath);
    if(!node) {
      unresolved.push({key:track.key,type:'scroll',path:track.glbPath});
      continue;
    }
    if(track.requiresGeometry&&!hasGeometry(node)) {
      inert.push({key:track.key,path:track.glbPath,reason:'correct node exists but carries no geometry in this GLB'});
      continue;
    }
    node.matrixAutoUpdate=true;
    bound.push({track,node,glbBase:{position:node.position.clone(),scale:node.scale.clone()}});
  }

  if(ambient) {
    for(const spec of AMBIENT_DRIVERS) {
      let node=null;
      let missing=[];

      if(spec.subsetPaths) {
        const subset=buildSubsetWrapper(model,spec);
        node=subset.node;
        missing=subset.missing;
      } else {
        node=findByPath(model,spec.glbPath);
        if(!node)missing=[spec.glbPath];
      }

      if(!node) {
        unresolved.push({key:spec.key,type:'ambient',missing});
        continue;
      }

      node.matrixAutoUpdate=true;
      ambientBindings.push({spec,node,restore:captureTransform(node)});
    }
  }

  const expectedVisualTargets=AMBIENT_DRIVERS.reduce((sum,s)=>sum+s.visualCount,0);
  const boundVisualTargets=ambientBindings.reduce((sum,b)=>sum+b.spec.visualCount,0);

  if(debug) {
    console.group('[spline-motion v5 · 53-object map]');
    for(const b of bound)console.log('scroll ',b.track.key,'=>',pathOf(b.node));
    for(const b of ambientBindings)console.log(
      'ambient',b.spec.key,
      `[${b.spec.markers.join(', ')}]`,
      `visual=${b.spec.visualCount}`,
      b.spec.subsetPaths?'runtime subset wrapper':pathOf(b.node)
    );
    for(const i of inert)console.warn('INERT',i.key,'-',i.reason,'(',i.path,')');
    if(unresolved.length)console.error('UNRESOLVED',unresolved);
    console.log(`ambient visual targets: ${boundVisualTargets}/${expectedVisualTargets}`);
    console.log('skipped by design: b2_1 inner helper (would double-translate)');
    console.groupEnd();
  }

  function setProgress(p) {
    const progress=Math.max(0,Math.min(1,p));
    const t=MOTION_WINDOW.start+progress*(MOTION_WINDOW.end-MOTION_WINDOW.start);

    for(const {track,node,glbBase} of bound) {
      const pos=sampleChannel(track.position,t);
      if(pos) {
        node.position.set(
          glbBase.position.x+(pos[0]-track.base.position[0])*unitScale,
          glbBase.position.y+(pos[1]-track.base.position[1])*unitScale,
          glbBase.position.z+(pos[2]-track.base.position[2])*unitScale
        );
      }
      const scl=sampleChannel(track.scale,t);
      if(scl) {
        node.scale.set(
          glbBase.scale.x*(scl[0]/(track.base.scale[0]||1)),
          glbBase.scale.y*(scl[1]/(track.base.scale[1]||1)),
          glbBase.scale.z*(scl[2]/(track.base.scale[2]||1))
        );
      }
      node.updateMatrix();
      node.matrixWorldNeedsUpdate=true;
    }

    model.updateMatrixWorld(true);
  }

  function setAmbientTime(seconds) {
    if(!ambientBindings.length)return;

    for(const {spec,node} of ambientBindings) {
      const period=(spec.durationMs/1000)*2;
      const phase=(((seconds%period)+period)%period)/period;
      const tri=phase<0.5?phase*2:(1-phase)*2;
      const f=ease(tri);
      const b=spec.base;
      const d=spec.delta;

      if(d.position) {
        node.position.set(
          b.position[0]+d.position[0]*f*unitScale,
          b.position[1]+d.position[1]*f*unitScale,
          b.position[2]+d.position[2]*f*unitScale
        );
      }
      if(d.rotation) {
        node.rotation.set(
          (b.rotation[0]+d.rotation[0]*f)*DEG,
          (b.rotation[1]+d.rotation[1]*f)*DEG,
          (b.rotation[2]+d.rotation[2]*f)*DEG
        );
      }
      if(d.scale) {
        node.scale.set(
          b.scale[0]+d.scale[0]*f,
          b.scale[1]+d.scale[1]*f,
          b.scale[2]+d.scale[2]*f
        );
      }

      node.updateMatrix();
      node.matrixWorldNeedsUpdate=true;
    }

    model.updateMatrixWorld(true);
  }

  function reset() {
    for(const {node,glbBase} of bound) {
      node.position.copy(glbBase.position);
      node.scale.copy(glbBase.scale);
      node.updateMatrix();
      node.matrixWorldNeedsUpdate=true;
    }
    for(const {node,restore} of ambientBindings)restoreTransform(node,restore);
    model.updateMatrixWorld(true);
  }

  return {
    setProgress,
    setAmbientTime,
    reset,
    bound:bound.map(b=>({key:b.track.key,path:pathOf(b.node)})),
    // `spins` is retained for app-v2 compatibility; it now means all ambient drivers.
    spins:ambientBindings.map(b=>({
      key:b.spec.key,
      markers:b.spec.markers,
      visualCount:b.spec.visualCount,
      path:b.spec.subsetPaths?'runtime-subset-wrapper':pathOf(b.node)
    })),
    inert,
    unresolved,
    hasAmbient:ambientBindings.length>0,
    visualTargetCount:boundVisualTargets,
    expectedVisualTargetCount:expectedVisualTargets
  };
}
