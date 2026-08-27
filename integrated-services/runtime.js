import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SPLINE_TIMELINE } from './animation-data.js';

const MODEL_B64_URL = './model.glb.zst.b64?v=services-model-v1';
const ROOT = document.querySelector('[data-services-calibrator]');
const canvas = document.querySelector('[data-services-canvas]');

const STYLE = {
  background:'#f2f3f0', face:'#ffffff', faceTint:0.70, faceLift:0.85, faceOpacity:0.95,
  faceRoughness:0.97, faceMetalness:0,
  slab:'#f2f3f0', slabOpacity:0.14, slabRoughness:1,
  edge:'#242424', edgeOpacity:0.14, edgeWidth:0.65, edgeAngle:30,
  glow:'#82ca2b', glowOpacity:0.24, glowWidth:5.9, glowStrength:0.35,
  glowExpansion:0, dotColor:'#141414', dotDensity:24.95, dotSize:0.0275,
  dotEdgeSoftness:0.012, dotSkew:0.5, dotFadedOpacity:0, dotActiveOpacity:0.34,
  rippleSpeed:-1.25, rippleFrequency:0.35, rippleWidth:0.3, rippleSoftness:0.081,
  rippleOriginX:0, rippleOriginZ:0,
  hemisphere:0.6, key:1.3, rim:0.35, exposure:0.85, keyTint:'#ffffff'
};

const SHADOW_STYLE = {
  enabled:true, azimuth:180, elevation:62, darkness:0.04, softness:2,
  bias:-0.00035, normalBias:0.02, receiverOffset:0.025, mapSize:4096,
  blurSamples:8, filter:'VSM'
};

const DESKTOP_KEYFRAMES = [
  {scrollPct:0,   azimuth:130, elevation:57, zoom:1.00, panX:0, panY:8.5,  panZ:0, timelineProgress:0.00, ease:'easeInOut'},
  {scrollPct:50,  azimuth:130, elevation:57, zoom:1.00, panX:0, panY:-0.5, panZ:0, timelineProgress:0.50, ease:'easeInOut'},
  {scrollPct:100, azimuth:130, elevation:57, zoom:1.00, panX:0, panY:-10.5,panZ:0, timelineProgress:1.00, ease:'easeInOut'}
];
const MOBILE_KEYFRAMES = [
  {scrollPct:0,   azimuth:130, elevation:61, zoom:0.72, panX:0, panY:8.5,  panZ:0, timelineProgress:0.00, ease:'easeInOut'},
  {scrollPct:50,  azimuth:130, elevation:61, zoom:0.72, panX:0, panY:-0.5, panZ:0, timelineProgress:0.50, ease:'easeInOut'},
  {scrollPct:100, azimuth:130, elevation:61, zoom:0.72, panX:0, panY:-10.5,panZ:0, timelineProgress:1.00, ease:'easeInOut'}
];

const BASE_TARGET = new THREE.Vector3(0,-0.9366,0);
const BASE_DISTANCE = 24.35;
const edgeLayers=[];
const animatedTargets=[];
let model=null, camera=null, renderer=null, scene=null;
let hemi=null,keyLight=null,rimLight=null,shadowLight=null;
let currentMode='desktop', selectedFrame=0, scrubPct=0, playing=false, playStart=0;
let lastW=0,lastH=0;

const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function b64ToBytes(text){
  const clean=text.trim();
  const bin=atob(clean);
  const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}

async function loadModelBytes(){
  const text=await fetch(MODEL_B64_URL).then(r=>{if(!r.ok) throw new Error(`model fetch ${r.status}`);return r.text();});
  const packed=b64ToBytes(text);
  if(!window.fzstd?.decompress) throw new Error('fzstd decompressor missing');
  return window.fzstd.decompress(packed);
}

function meshMaterials(object){return Array.isArray(object.material)?object.material:[object.material];}
function isGreenMaterial(mat){const c=mat?.color;return !!c && c.g>c.r*2.1 && c.g>c.b*2.1;}
function isSlabName(name=''){return /^(inner base|inner top-|rec)$/i.test(name);}

function ownMaterials(mesh){
  if(mesh.userData.servicesOwnedMaterial)return;
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
  mesh.userData.servicesOwnedMaterial=true;
}

function applyFaceStyle(){
  if(!model)return;
  model.traverse(o=>{
    if(!o.isMesh)return;
    ownMaterials(o);
    const slab=isSlabName(o.name);
    for(const mat of meshMaterials(o)){
      if(!mat)continue;
      const green=mat.userData.servicesGreen ?? isGreenMaterial(mat);
      mat.userData.servicesGreen=green;
      if(!('servicesBaseOpacity' in mat.userData))mat.userData.servicesBaseOpacity=Number.isFinite(mat.opacity)?mat.opacity:1;
      if(slab){
        mat.color?.set(STYLE.slab); mat.opacity=STYLE.slabOpacity; mat.transparent=true;
        if('roughness' in mat)mat.roughness=STYLE.slabRoughness;
      }else if(green){
        mat.color?.set('#84c534');
        if(mat.emissive){mat.emissive.set('#84c534');mat.emissiveIntensity=.30;}
        mat.transparent=true;
        mat.opacity=mat.userData.servicesBaseOpacity;
      }else{
        mat.color?.set(STYLE.face);
        if(mat.emissive){mat.emissive.set(STYLE.face);mat.emissiveIntensity=STYLE.faceLift;}
        if('roughness' in mat)mat.roughness=STYLE.faceRoughness;
        if('metalness' in mat)mat.metalness=STYLE.faceMetalness;
        mat.transparent=true;mat.opacity=STYLE.faceOpacity;
      }
      mat.needsUpdate=true;
    }
    o.castShadow=true;o.receiveShadow=true;
  });
}

function makeLineLayer(mesh, glow=false){
  if(!mesh.geometry?.attributes?.position)return;
  const edges=new THREE.EdgesGeometry(mesh.geometry, STYLE.edgeAngle);
  const pos=edges.getAttribute('position');
  if(!pos||pos.count<2){edges.dispose();return;}
  const arr=new Float32Array(pos.count*3); for(let i=0;i<pos.count;i++){arr[i*3]=pos.getX(i);arr[i*3+1]=pos.getY(i);arr[i*3+2]=pos.getZ(i);}
  edges.dispose();
  const geo=new LineSegmentsGeometry();geo.setPositions(arr);
  const mat=new LineMaterial({
    color:glow?STYLE.glow:STYLE.edge,
    linewidth:glow?STYLE.glowWidth:STYLE.edgeWidth,
    transparent:true,
    opacity:glow?STYLE.glowOpacity*STYLE.glowStrength:STYLE.edgeOpacity,
    depthTest:true,depthWrite:false,
    blending:glow?THREE.AdditiveBlending:THREE.NormalBlending,
    toneMapped:false
  });
  const line=new LineSegments2(geo,mat);line.frustumCulled=false;line.renderOrder=glow?8:7;mesh.add(line);edgeLayers.push({line,mat,glow});
}

function buildOutlines(){
  for(const e of edgeLayers){e.line.removeFromParent();e.line.geometry.dispose();e.mat.dispose();} edgeLayers.length=0;
  model?.traverse(o=>{
    if(!o.isMesh||isSlabName(o.name))return;
    const green=meshMaterials(o).some(m=>m?.userData?.servicesGreen);
    if(green)return;
    makeLineLayer(o,false);makeLineLayer(o,true);
  });
  resizeLineMaterials();
}

function syncOutlineStyle(){
  for(const e of edgeLayers){
    e.mat.color.set(e.glow?STYLE.glow:STYLE.edge);
    e.mat.opacity=e.glow?STYLE.glowOpacity*STYLE.glowStrength:STYLE.edgeOpacity;
    e.mat.linewidth=e.glow?STYLE.glowWidth:STYLE.edgeWidth;
    e.mat.needsUpdate=true;
  }
}

function resizeLineMaterials(){if(!renderer)return;const s=renderer.getSize(new THREE.Vector2());for(const e of edgeLayers)e.mat.resolution.set(s.x,s.y);}

function findNamedTarget(name,kind){
  const found=[];model.traverse(o=>{if(o.name===name)found.push(o);});
  if(kind==='group')return found.find(o=>!o.isMesh&&o.children.length)||found.find(o=>!o.isMesh)||found[0];
  return found.find(o=>o.isMesh)||found[0];
}

function prepareTimeline(){
  animatedTargets.length=0;
  for(const track of SPLINE_TIMELINE.tracks){
    const target=findNamedTarget(track.name,track.kind);if(!target){console.warn('[services timeline] missing',track.name);continue;}
    const item={track,target,props:[]};
    for(const p of track.properties)item.props.push({path:p.path,frames:normalizeFrames(p,track.base)});
    if(item.props.some(p=>p.path==='opacity')){
      target.traverse?.(o=>{if(o.isMesh){ownMaterials(o);for(const m of meshMaterials(o)){if(!('servicesTimelineOpacity' in m.userData))m.userData.servicesTimelineOpacity=m.opacity;}}});
    }
    animatedTargets.push(item);
  }
  console.info('[services timeline] prepared',{tracks:animatedTargets.length,duration:SPLINE_TIMELINE.duration,ignored:SPLINE_TIMELINE.ignoredStaleMappings});
}

function baseForPath(path,base){
  if(path==='position.value')return {x:base.position[0],y:base.position[1],z:base.position[2]};
  if(path==='scale.value')return {x:base.scale[0],y:base.scale[1],z:base.scale[2]};
  if(path==='shape size.value')return {x:base.shapeSize[0],y:base.shapeSize[1],z:base.shapeSize[2]};
  return 1;
}
function normalizeFrames(prop,base){
  const grouped=new Map();
  for(const k of prop.keyframes){const a=grouped.get(k.time)||[];a.push(k);grouped.set(k.time,a);}
  const times=[...grouped.keys()].sort((a,b)=>a-b);let current=baseForPath(prop.path,base);const out=[];
  for(const time of times){
    const ks=grouped.get(time);let value=typeof current==='object'?{...current}:current;
    for(const k of ks){if(typeof k.value==='object'&&k.value!==null)value={...value,...k.value};else value=k.value;}
    current=value;const k=ks[ks.length-1];out.push({time,value:typeof value==='object'?{...value}:value,c1:k.c1,c2:k.c2});
  }
  return out;
}
function cubicBezierY(x,c1=[.42,0],c2=[.58,1]){
  const bez=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  let lo=0,hi=1,t=x;for(let i=0;i<10;i++){const bx=bez(t,c1[0],c2[0]);if(bx<x)lo=t;else hi=t;t=(lo+hi)/2;}
  return bez(t,c1[1],c2[1]);
}
function sample(frames,time){
  if(!frames.length)return null;if(time<=frames[0].time)return frames[0].value;if(time>=frames.at(-1).time)return frames.at(-1).value;
  let i=0;while(i<frames.length-1&&time>frames[i+1].time)i++;const a=frames[i],b=frames[i+1];
  const raw=(time-a.time)/Math.max(1e-9,b.time-a.time),t=cubicBezierY(clamp(raw,0,1),a.c1,a.c2);
  if(typeof a.value==='number')return lerp(a.value,b.value,t);
  return {x:lerp(a.value.x,b.value.x,t),y:lerp(a.value.y,b.value.y,t),z:lerp(a.value.z,b.value.z,t)};
}
function applyTimeline(progress){
  const time=clamp(progress,0,1)*SPLINE_TIMELINE.duration;
  for(const item of animatedTargets){
    const base=item.track.base;
    let shape=null, scale=null;
    for(const p of item.props){
      const v=sample(p.frames,time);if(v==null)continue;
      if(p.path==='position.value')item.target.position.set(v.x,v.y,v.z);
      else if(p.path==='scale.value')scale=v;
      else if(p.path==='shape size.value')shape=v;
      else if(p.path==='opacity')item.target.traverse?.(o=>{if(o.isMesh)for(const m of meshMaterials(o)){const bo=m.userData.servicesTimelineOpacity??m.opacity;m.opacity=bo*v;m.transparent=true;m.visible=v>.0001;m.needsUpdate=true;}});
    }
    if(scale)item.target.scale.set(scale.x,scale.y,scale.z);
    if(shape){
      const bs=base.shapeSize, sc=scale||{x:base.scale[0],y:base.scale[1],z:base.scale[2]};
      item.target.scale.set(sc.x*(shape.x/Math.max(.0001,bs[0])),sc.y*(shape.y/Math.max(.0001,bs[1])),sc.z*(shape.z/Math.max(.0001,bs[2])));
    }
  }
}

function frameSet(){return currentMode==='mobile'?MOBILE_KEYFRAMES:DESKTOP_KEYFRAMES;}
function poseAt(pct){
  const frames=frameSet();let i=0;while(i<frames.length-1&&pct>frames[i+1].scrollPct)i++;const a=frames[i],b=frames[Math.min(i+1,frames.length-1)];
  const raw=a===b?0:(pct-a.scrollPct)/Math.max(1e-6,b.scrollPct-a.scrollPct),t=ease(clamp(raw,0,1));
  return {azimuth:lerp(a.azimuth,b.azimuth,t),elevation:lerp(a.elevation,b.elevation,t),zoom:lerp(a.zoom,b.zoom,t),panX:lerp(a.panX,b.panX,t),panY:lerp(a.panY,b.panY,t),panZ:lerp(a.panZ,b.panZ,t),timelineProgress:lerp(a.timelineProgress,b.timelineProgress,t)};
}
function applyPose(pct){
  if(!camera)return;const p=poseAt(pct);const az=THREE.MathUtils.degToRad(p.azimuth),el=THREE.MathUtils.degToRad(p.elevation);const dist=BASE_DISTANCE/Math.max(.05,p.zoom);
  const target=BASE_TARGET.clone().add(new THREE.Vector3(p.panX,p.panY,p.panZ));
  const horiz=Math.cos(el)*dist;camera.position.set(target.x+Math.sin(az)*horiz,target.y+Math.sin(el)*dist,target.z+Math.cos(az)*horiz);camera.lookAt(target);camera.updateMatrixWorld();
  applyTimeline(p.timelineProgress);
  if($('timelineReadout'))$('timelineReadout').textContent=`${(p.timelineProgress*100).toFixed(1)}% · ${(p.timelineProgress*SPLINE_TIMELINE.duration).toFixed(2)}s`;
}

function setupScene(gltf){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=STYLE.exposure;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(STYLE.background);model=gltf.scene;scene.add(model);
  model.traverse(o=>{if(o.isLight||o.isCamera)o.visible=false;});
  camera=new THREE.PerspectiveCamera(45,1,.05,500);scene.add(camera);
  hemi=new THREE.HemisphereLight(0xffffff,0xdde2d7,STYLE.hemisphere);scene.add(hemi);
  keyLight=new THREE.DirectionalLight(STYLE.keyTint,STYLE.key);keyLight.position.set(8,14,10);scene.add(keyLight);
  rimLight=new THREE.DirectionalLight(STYLE.glow,STYLE.rim);rimLight.position.set(-9,8,-11);scene.add(rimLight);
  shadowLight=new THREE.DirectionalLight(0xffffff,.001);shadowLight.name='ServicesShadow';shadowLight.castShadow=true;shadowLight.shadow.mapSize.set(SHADOW_STYLE.mapSize,SHADOW_STYLE.mapSize);shadowLight.shadow.bias=SHADOW_STYLE.bias;shadowLight.shadow.normalBias=SHADOW_STYLE.normalBias;shadowLight.shadow.radius=SHADOW_STYLE.softness;scene.add(shadowLight);scene.add(shadowLight.target);
  syncShadow();applyFaceStyle();buildOutlines();prepareTimeline();applyPose(0);resize();
  ROOT.dataset.ready='';$('status').textContent=`ready · ${SPLINE_TIMELINE.name} reconstructed · ${animatedTargets.length} live object tracks · ${SPLINE_TIMELINE.ignoredStaleMappings} stale source mappings ignored`;
}

function syncShadow(){if(!shadowLight)return;shadowLight.visible=SHADOW_STYLE.enabled;const az=THREE.MathUtils.degToRad(SHADOW_STYLE.azimuth),el=THREE.MathUtils.degToRad(SHADOW_STYLE.elevation),r=20;shadowLight.position.set(Math.sin(az)*Math.cos(el)*r,Math.sin(el)*r,Math.cos(az)*Math.cos(el)*r);shadowLight.target.position.set(0,-1,0);shadowLight.shadow.bias=SHADOW_STYLE.bias;shadowLight.shadow.normalBias=SHADOW_STYLE.normalBias;shadowLight.shadow.radius=SHADOW_STYLE.softness;}
function resize(){const r=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));if(w===lastW&&h===lastH)return;lastW=w;lastH=h;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();resizeLineMaterials();}
function render(now){resize();if(playing){const p=((now-playStart)/7000)*100;if(p>=100){playing=false;setScrub(100);$('playBtn').textContent='▶ Play 0–100%';}else setScrub(p,false);}applyPose(scrubPct);renderer.render(scene,camera);requestAnimationFrame(render);}

function setScrub(pct,updateInput=true){scrubPct=clamp(Number(pct)||0,0,100);if(updateInput)$('scrollScrub').value=scrubPct;$('scrollPctReadout').textContent=`${scrubPct.toFixed(1)}%`;}
function addControl(host,label,key,min,max,step,get,set,format=v=>Number(v).toFixed(2)){
  const wrap=document.createElement('div');wrap.className='ctl';const lab=document.createElement('label');const val=document.createElement('span');val.dataset.v='';lab.textContent=label;lab.appendChild(val);const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=get();const paint=()=>val.textContent=format(input.value);input.oninput=()=>{set(Number(input.value));paint();syncUI();};paint();wrap.append(lab,input);host.appendChild(wrap);return input;
}
function addColor(host,label,get,set){const w=document.createElement('div');w.className='ctl color';w.innerHTML=`<label>${label}</label>`;const i=document.createElement('input');i.type='color';i.value=get();i.oninput=()=>{set(i.value);syncUI();};w.appendChild(i);host.appendChild(w);return i;}
function rebuildFrameButtons(){const h=$('kfrow');h.innerHTML='';frameSet().forEach((f,i)=>{const b=document.createElement('button');b.textContent=`${String(i+1).padStart(2,'0')} · ${f.scrollPct}%`;b.classList.toggle('on',i===selectedFrame);b.onclick=()=>{selectedFrame=i;setScrub(f.scrollPct);syncUI();};h.appendChild(b);});}
function buildUI(){
  $('responsiveDesktopBtn').onclick=()=>{currentMode='desktop';selectedFrame=Math.min(selectedFrame,2);syncUI();};$('responsiveMobileBtn').onclick=()=>{currentMode='mobile';selectedFrame=Math.min(selectedFrame,2);syncUI();};
  $('scrollScrub').oninput=e=>setScrub(e.target.value,false);document.querySelectorAll('#thirdJumps button').forEach(b=>b.onclick=()=>setScrub(b.dataset.pct));
  $('playBtn').onclick=()=>{playing=!playing;if(playing){playStart=performance.now()-scrubPct/100*7000;$('playBtn').textContent='❚❚ Pause';}else $('playBtn').textContent='▶ Play 0–100%';};
  const cam=$('camCtls');const selected=()=>frameSet()[selectedFrame];
  for(const [label,key,min,max,step] of [['Azimuth °','azimuth',-180,180,1],['Elevation °','elevation',5,85,1],['Zoom','zoom',.2,3,.01],['Pan X','panX',-15,15,.05],['Pan Y','panY',-20,20,.05],['Pan Z','panZ',-15,15,.05],['Spline timeline','timelineProgress',0,1,.005]])addControl(cam,label,key,min,max,step,()=>selected()[key],v=>selected()[key]=v);
  addColor($('lightCtls'),'Background',()=>STYLE.background,v=>{STYLE.background=v;scene?.background?.set(v);});
  addControl($('lightCtls'),'Hemisphere','hemisphere',0,2,.05,()=>STYLE.hemisphere,v=>{STYLE.hemisphere=v;if(hemi)hemi.intensity=v;});
  addControl($('lightCtls'),'Key','key',0,3,.05,()=>STYLE.key,v=>{STYLE.key=v;if(keyLight)keyLight.intensity=v;});
  addControl($('lightCtls'),'Rim','rim',0,2,.05,()=>STYLE.rim,v=>{STYLE.rim=v;if(rimLight)rimLight.intensity=v;});
  addControl($('lightCtls'),'Exposure','exposure',.2,2,.01,()=>STYLE.exposure,v=>{STYLE.exposure=v;if(renderer)renderer.toneMappingExposure=v;});
  addColor($('faceCtls'),'Face colour',()=>STYLE.face,v=>{STYLE.face=v;applyFaceStyle();});
  addControl($('faceCtls'),'Brightness / white lift','faceLift',0,2,.05,()=>STYLE.faceLift,v=>{STYLE.faceLift=v;applyFaceStyle();});
  addControl($('faceCtls'),'Opacity','faceOpacity',.05,1,.01,()=>STYLE.faceOpacity,v=>{STYLE.faceOpacity=v;applyFaceStyle();});
  addControl($('faceCtls'),'Roughness','faceRoughness',0,1,.01,()=>STYLE.faceRoughness,v=>{STYLE.faceRoughness=v;applyFaceStyle();});
  addColor($('slabCtls'),'Base plate colour',()=>STYLE.slab,v=>{STYLE.slab=v;applyFaceStyle();});
  addControl($('slabCtls'),'Base plate opacity','slabOpacity',0,1,.01,()=>STYLE.slabOpacity,v=>{STYLE.slabOpacity=v;applyFaceStyle();});
  addColor($('edgeCtls'),'Edge colour',()=>STYLE.edge,v=>{STYLE.edge=v;syncOutlineStyle();});
  addControl($('edgeCtls'),'Edge opacity','edgeOpacity',0,1,.01,()=>STYLE.edgeOpacity,v=>{STYLE.edgeOpacity=v;syncOutlineStyle();});
  addControl($('edgeCtls'),'Edge width','edgeWidth',.1,4,.05,()=>STYLE.edgeWidth,v=>{STYLE.edgeWidth=v;syncOutlineStyle();});
  addControl($('edgeCtls'),'Edge angle °','edgeAngle',5,70,1,()=>STYLE.edgeAngle,v=>{STYLE.edgeAngle=v;buildOutlines();});
  addColor($('glowCtls'),'Glow colour',()=>STYLE.glow,v=>{STYLE.glow=v;syncOutlineStyle();if(rimLight)rimLight.color.set(v);});
  addControl($('glowCtls'),'Glow opacity','glowOpacity',0,1,.01,()=>STYLE.glowOpacity,v=>{STYLE.glowOpacity=v;syncOutlineStyle();});
  addControl($('glowCtls'),'Glow width','glowWidth',.5,12,.1,()=>STYLE.glowWidth,v=>{STYLE.glowWidth=v;syncOutlineStyle();});
  addControl($('glowCtls'),'Glow strength','glowStrength',0,1,.01,()=>STYLE.glowStrength,v=>{STYLE.glowStrength=v;syncOutlineStyle();});
  $('tShadowCalibration').onclick=()=>{SHADOW_STYLE.enabled=!SHADOW_STYLE.enabled;syncShadow();syncUI();};
  addControl($('shadowRangeCtls'),'Shadow direction °','azimuth',-180,180,1,()=>SHADOW_STYLE.azimuth,v=>{SHADOW_STYLE.azimuth=v;syncShadow();});
  addControl($('shadowRangeCtls'),'Shadow elevation °','elevation',3,88,1,()=>SHADOW_STYLE.elevation,v=>{SHADOW_STYLE.elevation=v;syncShadow();});
  addControl($('shadowRangeCtls'),'Shadow darkness','darkness',0,.8,.01,()=>SHADOW_STYLE.darkness,v=>SHADOW_STYLE.darkness=v);
  addControl($('shadowRangeCtls'),'Shadow softness','softness',0,18,.25,()=>SHADOW_STYLE.softness,v=>{SHADOW_STYLE.softness=v;syncShadow();});
  $('copyBtn').onclick=async()=>{const text=exportText();$('out').value=text;try{await navigator.clipboard.writeText(text);$('copyBtn').textContent='Copied';setTimeout(()=>$('copyBtn').textContent='Copy COMPLETE DESKTOP + MOBILE + STYLES',900);}catch{}};
  $('resetBtn').onclick=()=>location.reload();syncUI();
}
function syncUI(){
  $('responsiveDesktopBtn').classList.toggle('on',currentMode==='desktop');$('responsiveMobileBtn').classList.toggle('on',currentMode==='mobile');$('tShadowCalibration').classList.toggle('on',SHADOW_STYLE.enabled);rebuildFrameButtons();
  const inputs=[...$('camCtls').querySelectorAll('input')],f=frameSet()[selectedFrame],vals=[f.azimuth,f.elevation,f.zoom,f.panX,f.panY,f.panZ,f.timelineProgress];inputs.forEach((i,n)=>{i.value=vals[n];const sp=i.closest('.ctl')?.querySelector('[data-v]');if(sp)sp.textContent=Number(vals[n]).toFixed(n<2?1:3);});
  $('out').value=exportText();
}
function exportText(){return `const DESKTOP_KEYFRAMES = ${JSON.stringify(DESKTOP_KEYFRAMES,null,2)};\n\nconst MOBILE_KEYFRAMES = ${JSON.stringify(MOBILE_KEYFRAMES,null,2)};\n\nconst STYLE = ${JSON.stringify(STYLE,null,2)};\n\nconst SHADOW_STYLE = ${JSON.stringify(SHADOW_STYLE,null,2)};\n\nconst SPLINE_TIMELINE_STYLE = ${JSON.stringify({id:SPLINE_TIMELINE.timelineId,name:SPLINE_TIMELINE.name,duration:SPLINE_TIMELINE.duration,source:'adam_integrated_services_final.spline'},null,2)};`;}

buildUI();
(async()=>{try{const bytes=await loadModelBytes();const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer,'',resolve,reject));setupScene(gltf);requestAnimationFrame(render);}catch(error){console.error(error);$('status').textContent='ERROR: '+error.message;}})();

window.__ADAM_INTEGRATED_SERVICES_CALIBRATOR={STYLE,SHADOW_STYLE,DESKTOP_KEYFRAMES,MOBILE_KEYFRAMES,SPLINE_TIMELINE,get model(){return model;},get scene(){return scene;},get camera(){return camera;},setProgress:setScrub,applyTimeline};
