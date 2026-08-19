import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MODEL_URL, FLAT_THRESHOLD, START_POSE, PRESETS, CAM, LIGHT, FACE, SLAB, EDGE, GLOW, DOTS } from './config.js';
import { SPLINE_MOTION_DURATION, SPLINE_MOTION_TRACKS, sampleVec3 } from './spline-motion.js';

const $=id=>document.getElementById(id);
const setStatus=s=>$('status').textContent=s;
const cloneFrame=f=>({...f});
const frameFromPose=(pose,time=0)=>({...pose,motionTime:time});
const state={
  keyframes:[frameFromPose(START_POSE,0),frameFromPose(START_POSE,1.25),frameFromPose(START_POSE,1.5),frameFromPose(START_POSE,1.75),frameFromPose(START_POSE,5)],
  style:{...PRESETS['Official Light']},preset:'Official Light'
};
let active=0,playing=false,playT=0,animateDots=true;

const root=document.querySelector('[data-scene3d]');
const canvas=root.querySelector('[data-scene3d-canvas]');
const frameEl=$('frame');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,.1,4000);
const hemi=new THREE.HemisphereLight(0xffffff,0x9a9a9a,.6);
const keyLight=new THREE.DirectionalLight(0xfff6e8,1.4);
const rimLight=new THREE.DirectionalLight(0xc8f542,.5);
scene.add(hemi,keyLight,rimLight);

setStatus('loading fuller model…');
const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
const gltf=await loader.loadAsync(MODEL_URL);
const model=gltf.scene;
const strip=[];model.traverse(o=>{if(o.isCamera||o.isLight)strip.push(o)});strip.forEach(o=>o.parent&&o.parent.remove(o));
model.updateWorldMatrix(true,true);

const solids=[],flats=[],originals=new Map(),contentBox=new THREE.Box3();
model.traverse(o=>{
  if(!o.isMesh)return;
  const mat=Array.isArray(o.material)?o.material[0]:o.material;
  originals.set(o,{color:mat?.color?.clone?.()||new THREE.Color(0xffffff),roughness:mat?.roughness??1,metalness:mat?.metalness??0});
  if(Array.isArray(o.material))o.material=o.material.map(m=>m.clone());else o.material=o.material.clone();
  const b=new THREE.Box3().setFromObject(o),s=b.getSize(new THREE.Vector3());
  if(s.y>=FLAT_THRESHOLD){solids.push(o);contentBox.union(b)}else flats.push({mesh:o,footprint:s.x*s.z});
});
if(!solids.length)contentBox.setFromObject(model);
flats.sort((a,b)=>b.footprint-a.footprint);
const slabMesh=flats[0]?.mesh||null,pathMeshes=flats.slice(1).map(f=>f.mesh);
const size=contentBox.getSize(new THREE.Vector3()),centre=contentBox.getCenter(new THREE.Vector3());
const sphere=new THREE.Sphere();contentBox.getBoundingSphere(sphere);const radius=sphere.radius;
model.position.sub(centre);scene.add(model);model.updateWorldMatrix(true,true);
keyLight.position.set(.45,1,.55).multiplyScalar(radius);rimLight.position.set(-.7,.35,-.6).multiplyScalar(radius);

function ancestry(o){const a=[];let p=o.parent;while(p&&p!==model){a.push(p.name||'');p=p.parent}return a}
function findMotionTarget(spec){
  const matches=[];model.traverse(o=>{if(o.name===spec.name)matches.push(o)});
  return matches.find(o=>{const a=ancestry(o);if(spec.parent&&a[0]!==spec.parent)return false;if(spec.grandparent&&a[1]!==spec.grandparent)return false;if(spec.greatgrandparent&&a[2]!==spec.greatgrandparent)return false;return true})||matches[0]||null;
}
const motionTargets=new Map();
for(const track of SPLINE_MOTION_TRACKS){const target=findMotionTarget(track.target);if(target)motionTargets.set(track.key,target)}
const motionBases=new Map();
for(const [key,o] of motionTargets)motionBases.set(key,{position:o.position.clone(),scale:o.scale.clone(),quaternion:o.quaternion.clone()});

function applySplineMotion(time){
  time=Math.max(0,Math.min(SPLINE_MOTION_DURATION,time));
  for(const track of SPLINE_MOTION_TRACKS){
    if(track.parentFollow)continue;
    const o=motionTargets.get(track.key);if(!o)continue;
    const p=sampleVec3(track.position,time),s=sampleVec3(track.scale,time);
    if(p)o.position.set(p[0],p[1],p[2]);
    if(s)o.scale.set(s[0],s[1],s[2]);
  }
  model.updateMatrixWorld(true);
}

// Build edge/glow lines as children of each mesh so extracted Spline group movement carries them automatically.
const edgeEntries=[];
function makeLineForMesh(mesh,angle){
  if(mesh.isInstancedMesh)return;
  const eg=new THREE.EdgesGeometry(mesh.geometry,angle),pos=eg.attributes.position;
  const arr=[];for(let i=0;i<pos.count;i++){arr.push(pos.getX(i),pos.getY(i),pos.getZ(i))}
  eg.dispose();
  const geo=new LineSegmentsGeometry();geo.setPositions(arr);
  const edgeMat=new LineMaterial({linewidth:1,transparent:true,depthTest:true});edgeMat.toneMapped=false;
  const glowMat=new LineMaterial({linewidth:3,transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending});glowMat.toneMapped=false;
  const glow=new LineSegments2(geo,glowMat),edge=new LineSegments2(geo,edgeMat);
  glow.renderOrder=2;edge.renderOrder=3;glow.frustumCulled=edge.frustumCulled=false;
  mesh.add(glow,edge);edgeEntries.push({mesh,geo,edge,glow,edgeMat,glowMat});
}
function clearEdges(){for(const e of edgeEntries){e.mesh.remove(e.edge,e.glow);e.geo.dispose();e.edgeMat.dispose();e.glowMat.dispose()}edgeEntries.length=0}
function rebuildEdges(angle){clearEdges();for(const m of solids)makeLineForMesh(m,angle);resizeLineMats()}
function resizeLineMats(){const r=root.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));for(const e of edgeEntries){e.edgeMat.resolution.set(w,h);e.glowMat.resolution.set(w,h)}}
rebuildEdges(state.style.edgeAngle);

const dotUniforms={uTime:{value:0},uDotColor:{value:new THREE.Color()},uSpacing:{value:1},uDotSize:{value:.05},uEdgeSoft:{value:.01},uSkew:{value:.5},uFadedOpacity:{value:.1},uActiveOpacity:{value:.5},uRippleSpeed:{value:1},uRippleFrequency:{value:.35},uRippleWidth:{value:.3},uRippleSoft:{value:.08},uRippleOrigin:{value:new THREE.Vector2()},uAnimate:{value:1}};
const dotMaterial=new THREE.ShaderMaterial({uniforms:dotUniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
vertexShader:`varying vec3 vWorld;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
fragmentShader:`uniform float uTime,uSpacing,uDotSize,uEdgeSoft,uSkew,uFadedOpacity,uActiveOpacity,uRippleSpeed,uRippleFrequency,uRippleWidth,uRippleSoft,uAnimate;uniform vec2 uRippleOrigin;uniform vec3 uDotColor;varying vec3 vWorld;void main(){vec2 p=vWorld.xz;vec2 iso=vec2(p.x+p.y*uSkew,p.y*.8660254);vec2 cell=fract(iso/uSpacing)-.5;float d=length(cell);float dotMask=1.0-smoothstep(uDotSize,uDotSize+max(uEdgeSoft,.0005),d);if(dotMask<.001)discard;float dist=length(p-uRippleOrigin);float wave=.5+.5*sin(dist*uRippleFrequency-uTime*uRippleSpeed);float low=clamp(.5-uRippleWidth*.5,0.,1.),high=clamp(.5+uRippleWidth*.5,0.,1.);float ripple=smoothstep(low-uRippleSoft,low+uRippleSoft,wave)*(1.0-smoothstep(high-uRippleSoft,high+uRippleSoft,wave));ripple=mix(0.,ripple,uAnimate);float alpha=mix(uFadedOpacity,uActiveOpacity,ripple)*dotMask;if(alpha<.002)discard;gl_FragColor=vec4(uDotColor,alpha);}`});
let dotOverlay=null;if(slabMesh){dotOverlay=new THREE.Mesh(slabMesh.geometry,dotMaterial);dotOverlay.position.y=.004;dotOverlay.renderOrder=1;dotOverlay.frustumCulled=false;slabMesh.add(dotOverlay)}

const boundsHelper=new THREE.Box3Helper(contentBox.clone().translate(centre.clone().negate()),0x00ff88);boundsHelper.visible=false;
const grid=new THREE.GridHelper(radius*4,24,0x444444,0x262626);grid.visible=false;scene.add(boundsHelper,grid);

const tmpColor=new THREE.Color();
function eachMaterial(mesh,fn){if(Array.isArray(mesh.material))mesh.material.forEach(fn);else fn(mesh.material)}
function applyStyle(){const s=state.style;scene.background=new THREE.Color(s.background);hemi.intensity=s.hemisphere;keyLight.intensity=s.key;keyLight.color.set(s.keyTint);rimLight.intensity=s.rim;renderer.toneMappingExposure=s.exposure;const tint=tmpColor.set(s.face);
for(const m of solids){const o=originals.get(m);eachMaterial(m,mat=>{if(mat.color)mat.color.copy(o.color).lerp(tint,s.faceTint);if('roughness'in mat)mat.roughness=s.faceRoughness;if('metalness'in mat)mat.metalness=s.faceMetalness;mat.transparent=true;mat.opacity=s.faceOpacity;mat.depthWrite=true;mat.depthTest=true;mat.needsUpdate=true})}
if(slabMesh)eachMaterial(slabMesh,mat=>{if(mat.color)mat.color.set(s.slab);if('roughness'in mat)mat.roughness=s.slabRoughness;mat.transparent=true;mat.opacity=s.slabOpacity;mat.depthWrite=true;mat.needsUpdate=true});
for(const e of edgeEntries){e.edgeMat.color.set(s.edge);e.edgeMat.opacity=s.edgeOpacity;e.edgeMat.linewidth=s.edgeWidth;e.glowMat.color.set(s.glow);e.glowMat.opacity=s.glowOpacity*s.glowStrength;e.glowMat.linewidth=s.glowWidth;e.glow.scale.setScalar(1+s.glowExpansion)}
dotUniforms.uDotColor.value.set(s.dotColor);dotUniforms.uSpacing.value=2/Math.max(.05,s.dotDensity);dotUniforms.uDotSize.value=s.dotSize;dotUniforms.uEdgeSoft.value=s.dotEdgeSoftness;dotUniforms.uSkew.value=s.dotSkew;dotUniforms.uFadedOpacity.value=s.dotFadedOpacity;dotUniforms.uActiveOpacity.value=s.dotActiveOpacity;dotUniforms.uRippleSpeed.value=s.rippleSpeed;dotUniforms.uRippleFrequency.value=s.rippleFrequency;dotUniforms.uRippleWidth.value=s.rippleWidth;dotUniforms.uRippleSoft.value=s.rippleSoftness;dotUniforms.uRippleOrigin.value.set(s.rippleOriginX,s.rippleOriginZ);dotUniforms.uAnimate.value=animateDots?1:0}

let fitDist=radius*3;function computeFit(){const vf=camera.fov*Math.PI/180,hf=2*Math.atan(Math.tan(vf/2)*camera.aspect);fitDist=Math.max(radius/Math.sin(vf/2),radius/Math.sin(hf/2))}
function resize(){const r=root.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=h>w?50:38;camera.updateProjectionMatrix();computeFit();resizeLineMats()}
new ResizeObserver(resize).observe(root);resize();
const look=new THREE.Vector3(),lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function poseAt(k){const az=k.azimuth*Math.PI/180,el=k.elevation*Math.PI/180;look.set(k.panX*size.x,0,k.panZ*size.z);const d=fitDist*k.zoom;camera.position.set(look.x+Math.sin(az)*Math.cos(el)*d,look.y+Math.sin(el)*d,look.z+Math.cos(az)*Math.cos(el)*d);camera.lookAt(look);applySplineMotion(k.motionTime??0)}
function poseLerp(t){const K=state.keyframes;if(K.length===1)return poseAt(K[0]);const seg=t*(K.length-1),i=Math.min(K.length-2,Math.floor(seg)),f=ease(seg-i),a=K[i],b=K[i+1];poseAt({azimuth:lerp(a.azimuth,b.azimuth,f),elevation:lerp(a.elevation,b.elevation,f),zoom:lerp(a.zoom,b.zoom,f),panX:lerp(a.panX,b.panX,f),panZ:lerp(a.panZ,b.panZ,f),motionTime:lerp(a.motionTime??0,b.motionTime??0,f)})}

function build(host,specs,get,onChange){host.innerHTML='';for(const sp of specs){const[k,label]=sp,wrap=document.createElement('div');let input;if(sp[2]==='color'){wrap.className='ctl color';wrap.innerHTML=`<label>${label}</label>`;input=document.createElement('input');input.type='color';input.oninput=()=>{get()[k]=input.value;onChange();syncUI()}}else{wrap.className='ctl';wrap.innerHTML=`<label>${label}<span data-v></span></label>`;input=document.createElement('input');Object.assign(input,{type:'range',min:sp[2],max:sp[3],step:sp[4]});input.oninput=()=>{get()[k]=parseFloat(input.value);onChange();syncUI()}}wrap.appendChild(input);wrap._input=input;wrap._key=k;wrap._get=get;wrap._isColor=sp[2]==='color';host.appendChild(wrap)}}
const MOTION=[['motionTime','Spline object time (s)',0,SPLINE_MOTION_DURATION,.01]];
const getKF=()=>state.keyframes[active],getStyle=()=>state.style,onStyle=()=>applyStyle(),onEdge=()=>{rebuildEdges(state.style.edgeAngle);applyStyle()};
const hosts=[[$('camCtls'),CAM,getKF,()=>{}],[$('motionCtls'),MOTION,getKF,()=>{}],[$('lightCtls'),LIGHT,getStyle,onStyle],[$('faceCtls'),FACE,getStyle,onStyle],[$('slabCtls'),SLAB,getStyle,onStyle],[$('edgeCtls'),EDGE,getStyle,onEdge],[$('glowCtls'),GLOW,getStyle,onStyle],[$('dotCtls'),DOTS,getStyle,onStyle]];hosts.forEach(([h,s,g,c])=>build(h,s,g,c));

const kfrow=$('kfrow');
function renderKFButtons(){kfrow.innerHTML='';state.keyframes.forEach((_,i)=>{const b=document.createElement('button');b.textContent=String(i).padStart(2,'0');b.onclick=()=>{active=i;playing=false;syncUI()};kfrow.appendChild(b)})}
$('addKFBtn').onclick=()=>{const copy=cloneFrame(state.keyframes[active]);state.keyframes.splice(active+1,0,copy);active++;renderKFButtons();syncUI()};
$('deleteKFBtn').onclick=()=>{if(state.keyframes.length<=1)return;state.keyframes.splice(active,1);active=Math.min(active,state.keyframes.length-1);renderKFButtons();syncUI()};
$('copyPrevBtn').onclick=()=>{if(active>0){state.keyframes[active]=cloneFrame(state.keyframes[active-1]);syncUI()}};
$('playBtn').onclick=()=>{playing=!playing;playT=0;syncUI()};
Object.keys(PRESETS).forEach(name=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>{state.style={...PRESETS[name]};state.preset=name;rebuildEdges(state.style.edgeAngle);applyStyle();syncUI()};$('presetRow').appendChild(b)});
const toggle=(id,fn,on=false)=>{const b=$(id);if(on)b.classList.add('on');b.onclick=()=>{b.classList.toggle('on');fn(b.classList.contains('on'))}};
toggle('tPortrait',v=>{frameEl.classList.toggle('portrait',v);requestAnimationFrame(resize)});toggle('tGround',v=>{if(slabMesh)slabMesh.visible=v;pathMeshes.forEach(m=>m.visible=v)},true);toggle('tEdges',v=>edgeEntries.forEach(e=>e.edge.visible=v),true);toggle('tGlow',v=>edgeEntries.forEach(e=>e.glow.visible=v),true);toggle('tDots',v=>dotOverlay&&(dotOverlay.visible=v),true);toggle('tBounds',v=>boundsHelper.visible=v);toggle('tGrid',v=>grid.visible=v);toggle('tAnimate',v=>{animateDots=v;dotUniforms.uAnimate.value=v?1:0},true);

function serialise(){const K=state.keyframes.map((k,i)=>`  // ${String(i).padStart(2,'0')}\n  { azimuth:${k.azimuth.toFixed(0)}, elevation:${k.elevation.toFixed(0)}, zoom:${k.zoom.toFixed(2)}, panX:${k.panX.toFixed(2)}, panZ:${k.panZ.toFixed(2)}, motionTime:${(k.motionTime??0).toFixed(2)} }`).join(',\n');return `const KEYFRAMES = [\n${K}\n];\n\nstyle = ${JSON.stringify(state.style,null,2)};`}
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(serialise());setStatus('copied keyframes + style + Spline object timing')}catch{$('out').select();setStatus('select the textarea and copy manually')}};
$('resetBtn').onclick=()=>{state.style={...PRESETS[state.preset]};rebuildEdges(state.style.edgeAngle);applyStyle();syncUI()};
function syncUI(){[...kfrow.children].forEach((b,i)=>b.classList.toggle('on',i===active&&!playing));$('copyPrevBtn').disabled=active===0;$('deleteKFBtn').disabled=state.keyframes.length<=1;for(const[host]of hosts)for(const wrap of host.children){const v=wrap._get()[wrap._key];if(wrap._isColor)wrap._input.value=v;else{wrap._input.value=v;wrap.querySelector('[data-v]').textContent=Math.abs(v)<10?(+v).toFixed(2):(+v).toFixed(0)}}$('out').value=serialise();const mapped=[...motionTargets.keys()].join(', ');setStatus(`fuller model · ${solids.length} solid / ${flats.length} flat\nSpline motion mapped: ${mapped||'none'}\nframes: ${state.keyframes.length} · selected ${String(active).padStart(2,'0')} · object time ${(state.keyframes[active].motionTime??0).toFixed(2)}s / ${SPLINE_MOTION_DURATION.toFixed(2)}s`)}
renderKFButtons();applyStyle();syncUI();
let lastDot=0;(function loop(now){requestAnimationFrame(loop);if(animateDots&&now-lastDot>=33){dotUniforms.uTime.value=now*.001;lastDot=now}if(playing){playT=(playT+.0022)%1;poseLerp(playT)}else poseAt(state.keyframes[active]);renderer.render(scene,camera)})(0);
