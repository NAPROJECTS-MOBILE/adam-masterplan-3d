/* ============================================================================
   spline-motion.js — scroll reveal motion recovered from adam_landscape_in_use.spline

   Camera is deliberately NOT handled here.

   This version binds to the actual fuller-GLB hierarchy by semantic node name
   plus local base transform. That avoids duplicate-name ambiguity from GLTFLoader.

   Export quirk: the Spline `b1` track survives as an empty node, while its
   visible building geometry is flattened into sibling `Group`; we drive that
   visible sibling as the b1 proxy. The outer b2 and both b2a groups retain
   visible descendants and are animated directly. The inner identity b2 helper
   is deliberately skipped to avoid the double-translation Claude identified.
   ========================================================================== */

export const MOTION_WINDOW = { start: 1.0, end: 1.75 };
const EASE = [0.42, 0, 0.58, 1];

export const TRACKS = [
  {
    key:'b1', kind:'b1',
    base:{position:[0,-6.18,0],scale:[1,1,1]},
    position:[{time:1.02,value:[0,-4.18,0]},{time:1.50,value:[0,28.824590337556465,0]}],
    scale:[{time:1.02,value:[1,0,1]},{time:1.50,value:[1,1,1]}]
  },
  {
    key:'b2', kind:'b2Outer',
    base:{position:[-348.9935362747192,-177.42,111.03597424420946],scale:[1,1,1]},
    position:[{time:1.00,value:[-348.99,-246.1,111.04]},{time:1.50,value:[-348.99,-195.7914015219736,111.04]}],
    scale:null
  },
  {
    key:'b2a-outer', kind:'b2aOuter',
    base:{position:[0,61.04085877031932,0],scale:[1,1,1]},
    position:[{time:1.50,value:[0,10.72,0]},{time:1.75,value:[0,62.12002005729909,0]}],
    scale:[{time:1.50,value:[1,0,1]},{time:1.75,value:[1,1,1]}]
  },
  {
    key:'b2a-inner', kind:'b2aInner',
    base:{position:[0,61.04085877031932,0],scale:[1,1,1]},
    position:[{time:1.50,value:[0,10.72,0]},{time:1.75,value:[0,62.12002005729909,0]}],
    scale:[{time:1.50,value:[1,0,1]},{time:1.75,value:[1,1,1]}]
  }
];

function cubicBezier(p0,p1,p2,p3){
  const cx=3*p0,bx=3*(p2-p0)-cx,ax=1-cx-bx;
  const cy=3*p1,by=3*(p3-p1)-cy,ay=1-cy-by;
  const fx=t=>((ax*t+bx)*t+cx)*t,dfx=t=>(3*ax*t+2*bx)*t+cx,fy=t=>((ay*t+by)*t+cy)*t;
  return x=>{if(x<=0)return 0;if(x>=1)return 1;let t=x;for(let i=0;i<8;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)return fy(t);const d=dfx(t);if(Math.abs(d)<1e-6)break;t-=e/d}let lo=0,hi=1;t=x;for(let i=0;i<20;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)break;if(e>0)hi=t;else lo=t;t=(lo+hi)/2}return fy(t)};
}
const ease=cubicBezier(...EASE),lerp=(a,b,t)=>a+(b-a)*t;

function sampleChannel(keys,t){
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

const clean=s=>String(s||'').trim().toLowerCase().replace(/[\s_]+/g,'_');
const baseName=s=>clean(s).replace(/_\d+$/,'');
const close=(a,b,eps=.08)=>Math.abs(a-b)<=eps;
const posClose=(o,v,eps=.08)=>close(o.position.x,v[0],eps)&&close(o.position.y,v[1],eps)&&close(o.position.z,v[2],eps);

function hasMesh(o){let found=false;o.traverse(c=>{if(c!==o&&c.isMesh)found=true});return found}
function childrenNamed(o,name){return (o?.children||[]).filter(c=>baseName(c.name)===clean(name))}
function allNamed(model,name){const out=[];model.traverse(o=>{if(baseName(o.name)===clean(name))out.push(o)});return out}

function resolveTrack(model,track){
  if(track.kind==='b2Outer'){
    return allNamed(model,'b2').find(o=>posClose(o,track.base.position,.2))||null;
  }

  if(track.kind==='b2aOuter'){
    const outerB2=allNamed(model,'b2').find(o=>posClose(o,[-348.9935362747192,-177.42,111.03597424420946],.2));
    return childrenNamed(outerB2,'b2a').find(o=>posClose(o,track.base.position,.2))||null;
  }

  if(track.kind==='b2aInner'){
    const outerB2=allNamed(model,'b2').find(o=>posClose(o,[-348.9935362747192,-177.42,111.03597424420946],.2));
    const innerB2=childrenNamed(outerB2,'b2').find(o=>posClose(o,[0,0,0],.2));
    return childrenNamed(innerB2,'b2a').find(o=>posClose(o,track.base.position,.2))||null;
  }

  if(track.kind==='b1'){
    const b1=allNamed(model,'b1').find(o=>posClose(o,track.base.position,.2));
    if(!b1)return null;
    if(hasMesh(b1))return b1;
    const parent=b1.parent;
    return (parent?.children||[]).find(c=>c!==b1&&hasMesh(c))||b1;
  }

  return null;
}

function pathOf(o){const out=[];let p=o;while(p){if(p.name)out.push(p.name);p=p.parent}return out.reverse().join('/')}

export function createSplineMotion(model,opts={}){
  const {debug=false,unitScale=1}=opts;
  const bound=[],unresolved=[];

  for(const track of TRACKS){
    const node=resolveTrack(model,track);
    if(!node){unresolved.push(track.key);continue}
    node.matrixAutoUpdate=true;
    bound.push({track,node,glbBase:{position:node.position.clone(),scale:node.scale.clone()}});
  }

  if(debug){
    console.group('[spline-motion] bindings');
    for(const b of bound)console.log(b.track.key,'=>',pathOf(b.node),'base',b.glbBase.position.toArray(),b.glbBase.scale.toArray());
    if(unresolved.length)console.warn('UNRESOLVED',unresolved);
    console.groupEnd();
  }

  function setProgress(p){
    const progress=Math.max(0,Math.min(1,p));
    const t=MOTION_WINDOW.start+progress*(MOTION_WINDOW.end-MOTION_WINDOW.start);

    for(const {track,node,glbBase} of bound){
      const pos=sampleChannel(track.position,t);
      if(pos){
        node.position.set(
          glbBase.position.x+(pos[0]-track.base.position[0])*unitScale,
          glbBase.position.y+(pos[1]-track.base.position[1])*unitScale,
          glbBase.position.z+(pos[2]-track.base.position[2])*unitScale
        );
      }

      const scl=sampleChannel(track.scale,t);
      if(scl){
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

  function reset(){
    for(const {node,glbBase} of bound){
      node.position.copy(glbBase.position);
      node.scale.copy(glbBase.scale);
      node.updateMatrix();
      node.matrixWorldNeedsUpdate=true;
    }
    model.updateMatrixWorld(true);
  }

  return {
    setProgress,reset,
    bound:bound.map(b=>({key:b.track.key,path:pathOf(b.node)})),
    unresolved
  };
}
