/* ADAM Spline motion v5.2 — 53 visible targets.
   Cluster-4 strip fixes:
   1. Rectangle_5 is co-located with mesh_9_instance_5, so the complete
      10-child replica parent moves with it and no hidden duplicate is exposed.
   2. The strip family's ORIGINAL GLB vertical height is preserved throughout
      the animation. Spline's captured Y values must not sink this family.
   3. The strip family is forced perfectly level (0 degrees parent tilt). */
export const MOTION_WINDOW={start:1,end:1.75};
const E=[.42,0,.58,1],DEG=Math.PI/180;
const ROOT='Scene_1/Main_Group/clusters/cluster_1';

export const TRACKS=[
 {key:'b2',path:ROOT+'/b2',base:[-348.9935362747192,-177.42,111.03597424420946],p:[[1,[-348.99,-246.1,111.04]],[1.5,[-348.99,-195.7914015219736,111.04]]]},
 {key:'b2a-outer',path:ROOT+'/b2/b2a_1',base:[0,61.04085877031932,0],p:[[1.5,[0,10.72,0]],[1.75,[0,62.12002005729909,0]]],s:[[1.5,[1,0,1]],[1.75,[1,1,1]]]},
 {key:'b2a-inner',path:ROOT+'/b2/b2_1/b2a',base:[0,61.04085877031932,0],p:[[1.5,[0,10.72,0]],[1.75,[0,62.12002005729909,0]]],s:[[1.5,[1,0,1]],[1.75,[1,1,1]]]},
 {key:'b1',path:ROOT+'/building_1/b1',base:[0,-6.18,0],p:[[1.02,[0,-4.18,0]],[1.5,[0,28.824590337556465,0]]],s:[[1.02,[1,0,1]],[1.5,[1,1,1]]],requiresGeometry:true}
];

export const AMBIENT_DRIVERS=[{"k":"c4-bool1","m":["M01"],"n":1,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_4_/building_1/Boolean_1","p":[-0.2327,-16.5752,-120.3745],"dp":[1.7902,-15.4649,0],"s":[1,1,1],"ds":[0.0417,-0.4686,0]},{"k":"c4-bool0","m":["M02"],"n":1,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_4_/building/Boolean","p":[-0.2327,-16.5752,-120.3745],"dp":[1.378,-13.9109,0],"s":[1,1,1],"ds":[0.0321,-0.4215,0]},{"k":"c4-replicas","m":["M03","M04","M06","M07","M08","M09","M10","M11","M12"],"n":9,"d":5000,"parentOf":"Scene_1/Main_Group/clusters/cluster_4_/mesh_9_instance_1","p":[378.2109,-245.6674,1188.3818],"dp":[0,1.6507,-86.8854],"preserveY":true,"level":true},{"k":"c4-rect-original","m":["M05"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_4_/Rectangle_5","p":[378.2109,-245.6674,1188.3818],"dp":[0,1.6507,-86.8854],"preserveY":true,"level":true},{"k":"villa-i2","m":["M13","M14","M15","M16","M17","M18","M19"],"n":7,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Group_1","p":[-32.7428,43.8948,-33.1583],"dp":[0,-25.2718,0]},{"k":"villa-base","m":["M20","M21","M22","M23","M24","M25","M33"],"n":7,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_3/villa/Group_3","p":[-32.7428,43.8948,-33.1583],"dp":[0,-25.2718,0]},{"k":"villa-i1","m":["M26","M27","M28","M29","M30","M31","M32"],"n":7,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Group_2","p":[-32.7428,43.8948,-33.1583],"dp":[0,-25.2718,0]},{"k":"villa-i3","m":["M34","M35","M36","M37","M38","M39","M40"],"n":7,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Group","p":[-32.7428,43.8948,-33.1583],"dp":[0,-25.2718,0]},{"k":"c2-building2","m":["M41"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_2/building_2_3","p":[-176.4822,4.8872,567.5681],"dp":[-81.7757,0,0]},{"k":"c2-building","m":["M42"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_2/building_3","p":[-176.4822,4.8872,766.0778],"dp":[-59.7516,0,0]},{"k":"c2-rect36","m":["M43"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_2/building_2_1/Rectangle_36_3","p":[0,22.6438,0],"dp":[0,-86.0529,0]},{"k":"c2-bool12","m":["M44"],"n":1,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12","p":[0,0,-0.6541],"dp":[0,-31.8988,3.4548],"s":[1,1,1],"ds":[0,-0.4557,0.0618]},{"k":"cyl10","m":["M45"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_10","r":[0,-41,0],"dr":[0,62,0]},{"k":"cyl9","m":["M46"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_1/b11/cyln_building_1/Cylinder_9","r":[0,23,0],"dr":[0,-68,0]},{"k":"c1-rect11","m":["M47"],"n":1,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_1/b4/building_grp/building_7/Rectangle_11_5","s":[1,1,0.74],"ds":[0,0,0.26]},{"k":"c1-rect6","m":["M48"],"n":1,"d":4000,"path":"Scene_1/Main_Group/clusters/cluster_1/b7/Rectangle_6_4","s":[1,1,1],"ds":[0,0,-0.11]},{"k":"c1-building2-r3","m":["M49"],"n":1,"d":3000,"path":"Scene_1/Main_Group/clusters/cluster_1/building_2/Rectangle_3_1","s":[1,1,0.41],"ds":[0,0,0.59]},{"k":"c1-b9-bool","m":["M50"],"n":1,"d":5000,"path":"Scene_1/Main_Group/clusters/cluster_1/b9/Boolean_11","p":[0,0,-0.6541],"dp":[0,-32.8,2.3767],"s":[1,1,1],"ds":[0,-0.4686,0.0425]},{"k":"c1-b14-r36","m":["M51"],"n":1,"d":3000,"path":"Scene_1/Main_Group/clusters/cluster_1/building_14/Rectangle_36_2","p":[0,26.5023,0],"dp":[0,-56.2556,0]},{"k":"c4-g2-r2","m":["M52"],"n":1,"d":3000,"path":"Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_2","p":[-132.2172,56.6908,-48.1955],"dp":[0,-20.3608,0]},{"k":"c4-g2-r3","m":["M53"],"n":1,"d":3000,"path":"Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_3","p":[-132.2172,56.6908,70.7835],"dp":[0,-16.6119,0]}];

function bez(p0,p1,p2,p3){
 const cx=3*p0,bx=3*(p2-p0)-cx,ax=1-cx-bx,cy=3*p1,by=3*(p3-p1)-cy,ay=1-cy-by;
 const fx=t=>((ax*t+bx)*t+cx)*t,dx=t=>(3*ax*t+2*bx)*t+cx,fy=t=>((ay*t+by)*t+cy)*t;
 return x=>{if(x<=0)return 0;if(x>=1)return 1;let t=x;for(let i=0;i<8;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)return fy(t);const d=dx(t);if(Math.abs(d)<1e-6)break;t-=e/d}let lo=0,hi=1;t=x;for(let i=0;i<20;i++){const e=fx(t)-x;if(Math.abs(e)<1e-6)break;if(e>0)hi=t;else lo=t;t=(lo+hi)/2}return fy(t)}}
const ease=bez(...E),lerp=(a,b,t)=>a+(b-a)*t;
function sample(keys,t){if(!keys)return null;if(t<=keys[0][0])return keys[0][1];const last=keys[keys.length-1];if(t>=last[0])return last[1];for(let i=0;i<keys.length-1;i++){const a=keys[i],b=keys[i+1];if(t>=a[0]&&t<=b[0]){const f=ease((t-a[0])/(b[0]-a[0]));return a[1].map((v,j)=>lerp(v,b[1][j],f))}}return last[1]}
function pathOf(o){const a=[];for(let p=o;p;p=p.parent)if(p.name)a.push(p.name);return a.reverse().join('/')}
function find(model,path){let hit=null;model.traverse(o=>{if(!hit&&pathOf(o)===path)hit=o});return hit}
function hasGeo(o){let x=false;o.traverse(c=>{if(c.isMesh)x=true});return x}
function snap(o){return{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}}
function restore(o,b){o.position.copy(b.p);o.quaternion.copy(b.q);o.scale.copy(b.s);o.updateMatrix();o.matrixWorldNeedsUpdate=true}

export function createSplineMotion(model,opts={}){
 const {debug=false,unitScale=1,ambient=true}=opts,bound=[],amb=[],unresolved=[],inert=[];

 for(const t of TRACKS){
  const o=find(model,t.path);
  if(!o){unresolved.push({key:t.key,type:'scroll',path:t.path});continue}
  if(t.requiresGeometry&&!hasGeo(o)){inert.push({key:t.key,path:t.path,reason:'correct node exists but geometry is absent'});continue}
  o.matrixAutoUpdate=true;bound.push({t,o,base:{p:o.position.clone(),s:o.scale.clone()}})
 }

 if(ambient)for(const d of AMBIENT_DRIVERS){
  let o=find(model,d.path||d.parentOf);
  if(d.parentOf&&o)o=o.parent; // unnamed raw GLB replica container: all 10 children
  if(!o){unresolved.push({key:d.k,type:'ambient',path:d.path||d.parentOf});continue}
  o.matrixAutoUpdate=true;amb.push({d,o,base:snap(o)})
 }

 const expected=AMBIENT_DRIVERS.reduce((n,d)=>n+d.n,0),count=amb.reduce((n,b)=>n+b.d.n,0);
 if(debug){
  console.group('[spline-motion v5.2]');
  for(const b of bound)console.log('scroll',b.t.key,pathOf(b.o));
  for(const b of amb)console.log('ambient',b.d.k,b.d.m.join(','),b.d.parentOf?'FULL replica parent':pathOf(b.o));
  for(const x of inert)console.warn('INERT',x);
  if(unresolved.length)console.error('UNRESOLVED',unresolved);
  console.log(`ambient visual targets: ${count}/${expected}`);
  console.groupEnd()
 }

 function setProgress(p){
  const t=MOTION_WINDOW.start+Math.max(0,Math.min(1,p))*(MOTION_WINDOW.end-MOTION_WINDOW.start);
  for(const b of bound){
   const v=sample(b.t.p,t);if(v)b.o.position.set(b.base.p.x+(v[0]-b.t.base[0])*unitScale,b.base.p.y+(v[1]-b.t.base[1])*unitScale,b.base.p.z+(v[2]-b.t.base[2])*unitScale);
   const s=sample(b.t.s,t);if(s)b.o.scale.set(b.base.s.x*s[0],b.base.s.y*s[1],b.base.s.z*s[2]);
   b.o.updateMatrix();b.o.matrixWorldNeedsUpdate=true
  }
  model.updateMatrixWorld(true)
 }

 function setAmbientTime(seconds){
  for(const b of amb){
   const d=b.d,period=d.d/500,phase=(((seconds%period)+period)%period)/period,tri=phase<.5?phase*2:(1-phase)*2,f=ease(tri),o=b.o;
   if(d.p)o.position.set(
    d.p[0]+d.dp[0]*f*unitScale,
    d.preserveY?b.base.p.y:d.p[1]+d.dp[1]*f*unitScale,
    d.p[2]+d.dp[2]*f*unitScale
   );
   if(d.r)o.rotation.set((d.r[0]+d.dr[0]*f)*DEG,(d.r[1]+d.dr[1]*f)*DEG,(d.r[2]+d.dr[2]*f)*DEG);
   if(d.level)o.rotation.set(0,0,0);
   if(d.s)o.scale.set(d.s[0]+d.ds[0]*f,d.s[1]+d.ds[1]*f,d.s[2]+d.ds[2]*f);
   o.updateMatrix();o.matrixWorldNeedsUpdate=true
  }
  model.updateMatrixWorld(true)
 }

 function reset(){for(const b of bound){b.o.position.copy(b.base.p);b.o.scale.copy(b.base.s);b.o.updateMatrix();b.o.matrixWorldNeedsUpdate=true}for(const b of amb)restore(b.o,b.base);model.updateMatrixWorld(true)}

 return{setProgress,setAmbientTime,reset,bound:bound.map(b=>({key:b.t.key,path:pathOf(b.o)})),spins:amb.map(b=>({key:b.d.k,markers:b.d.m,visualCount:b.d.n,path:b.d.parentOf?'cluster4-mesh9-replica-parent':pathOf(b.o)})),inert,unresolved,hasAmbient:amb.length>0,visualTargetCount:count,expectedVisualTargetCount:expected}
}
