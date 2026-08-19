import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MODEL_URL, FLAT_THRESHOLD, START_POSE, PRESETS, CAM, LIGHT, FACE, SLAB, EDGE, GLOW, DOTS } from './config.js';

const setStatus = s => document.getElementById('status').textContent = s;
const state = { keyframes:Array.from({length:5},()=>({...START_POSE})), style:{...PRESETS['Official Light']}, preset:'Official Light' };
const initialised = [true,false,false,false,false];
let active=0, playing=false, playT=0, animateDots=true;

const root=document.querySelector('[data-scene3d]');
const canvas=root.querySelector('[data-scene3d-canvas]');
const frameEl=document.getElementById('frame');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,0.1,4000);
const hemi=new THREE.HemisphereLight(0xffffff,0x9a9a9a,0.6);
const keyLight=new THREE.DirectionalLight(0xfff6e8,1.4);
const rimLight=new THREE.DirectionalLight(0xc8f542,0.5);
scene.add(hemi,keyLight,rimLight);

setStatus('loading model…');
const loader=new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf=await loader.loadAsync(MODEL_URL);
const model=gltf.scene;
const strip=[];
model.traverse(o=>{if(o.isCamera||o.isLight)strip.push(o)});
strip.forEach(o=>o.parent&&o.parent.remove(o));
model.updateWorldMatrix(true,true);

const solids=[],flats=[];
const originals=new Map();
const contentBox=new THREE.Box3();
model.traverse(o=>{
  if(!o.isMesh)return;
  originals.set(o,{color:o.material.color.clone(),roughness:o.material.roughness??1,metalness:o.material.metalness??0});
  o.material=o.material.clone();
  const b=new THREE.Box3().setFromObject(o);
  const s=b.getSize(new THREE.Vector3());
  if(s.y>=FLAT_THRESHOLD){solids.push(o);contentBox.union(b)} else flats.push({mesh:o,footprint:s.x*s.z});
});
if(!solids.length)contentBox.setFromObject(model);
flats.sort((a,b)=>b.footprint-a.footprint);
const slabMesh=flats.length?flats[0].mesh:null;
const pathMeshes=flats.slice(1).map(f=>f.mesh);
const size=contentBox.getSize(new THREE.Vector3());
const centre=contentBox.getCenter(new THREE.Vector3());
const sphere=new THREE.Sphere();contentBox.getBoundingSphere(sphere);const radius=sphere.radius;
model.position.sub(centre);scene.add(model);model.updateWorldMatrix(true,true);
keyLight.position.set(.45,1,.55).multiplyScalar(radius);
rimLight.position.set(-.7,.35,-.6).multiplyScalar(radius);

function buildEdgePositions(thresholdAngle){
  const out=[];const v=new THREE.Vector3();const im=new THREE.Matrix4();const world=new THREE.Matrix4();
  for(const o of solids){
    const eg=new THREE.EdgesGeometry(o.geometry,thresholdAngle);const pos=eg.attributes.position;const n=o.isInstancedMesh?o.count:1;
    for(let k=0;k<n;k++){
      world.copy(o.matrixWorld);if(o.isInstancedMesh){o.getMatrixAt(k,im);world.multiply(im)}
      for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(world);out.push(v.x,v.y,v.z)}
    }
    eg.dispose();
  }
  return new Float32Array(out);
}
const edgeMat=new LineMaterial({linewidth:1,transparent:true,depthTest:true});edgeMat.toneMapped=false;
const glowMat=new LineMaterial({linewidth:3,transparent:true,depthTest:true});glowMat.toneMapped=false;glowMat.blending=THREE.AdditiveBlending;glowMat.depthWrite=false;
let edgeGeo=null,edgeLines=null,glowLines=null;
function rebuildEdges(angle){
  const positions=buildEdgePositions(angle);const geo=new LineSegmentsGeometry();geo.setPositions(positions);
  if(edgeLines){scene.remove(edgeLines);scene.remove(glowLines);edgeGeo.dispose()}
  edgeGeo=geo;edgeLines=new LineSegments2(geo,edgeMat);glowLines=new LineSegments2(geo,glowMat);
  edgeLines.frustumCulled=false;glowLines.frustumCulled=false;glowLines.renderOrder=2;edgeLines.renderOrder=3;scene.add(edgeLines,glowLines);return positions.length/6;
}
const segCount=rebuildEdges(state.style.edgeAngle);

const dotUniforms={
  uTime:{value:0},uDotColor:{value:new THREE.Color('#d8e89b')},uOpacity:{value:.3},uSpacing:{value:1.4},uDotSize:{value:.16},uFeather:{value:.06},uSkew:{value:.5},uBaseOpacity:{value:.35},uRippleSpeed:{value:1.2},uRippleFrequency:{value:.35},uRippleWidth:{value:.5},uRippleStrength:{value:.8},uRippleOrigin:{value:new THREE.Vector2(0,0)},uAnimate:{value:1}
};
const dotMaterial=new THREE.ShaderMaterial({
  uniforms:dotUniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  vertexShader:`varying vec3 vWorld;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`uniform float uTime,uOpacity,uSpacing,uDotSize,uFeather,uSkew;uniform float uBaseOpacity,uRippleSpeed,uRippleFrequency,uRippleWidth;uniform float uRippleStrength,uAnimate;uniform vec2 uRippleOrigin;uniform vec3 uDotColor;varying vec3 vWorld;void main(){vec2 p=vWorld.xz;vec2 iso=vec2(p.x+p.y*uSkew,p.y*0.8660254);vec2 cell=fract(iso/uSpacing)-0.5;float d=length(cell);float dotMask=1.0-smoothstep(uDotSize,uDotSize+uFeather,d);if(dotMask<=0.001)discard;float dist=length(p-uRippleOrigin);float wave=sin(dist*uRippleFrequency-uTime*uRippleSpeed);float w=max(uRippleWidth,0.02);float ripple=smoothstep(1.0-w,1.0,wave);float a=dotMask*(uBaseOpacity+ripple*uRippleStrength*uAnimate)*uOpacity;if(a<0.002)discard;gl_FragColor=vec4(uDotColor,a);}`
});
let dotOverlay=null;
if(slabMesh){dotOverlay=new THREE.Mesh(slabMesh.geometry,dotMaterial);dotOverlay.matrixAutoUpdate=false;dotOverlay.matrix.copy(slabMesh.matrixWorld);dotOverlay.matrix.premultiply(new THREE.Matrix4().makeTranslation(0,.004,0));dotOverlay.frustumCulled=false;dotOverlay.renderOrder=1;scene.add(dotOverlay)}

const boundsHelper=new THREE.Box3Helper(contentBox.clone().translate(centre.clone().negate()),0x00ff88);boundsHelper.visible=false;
const grid=new THREE.GridHelper(radius*4,24,0x444444,0x262626);grid.visible=false;scene.add(boundsHelper,grid);
setStatus(`solid ${solids.length} · flat ${flats.length} · slab "${slabMesh?slabMesh.name:'none'}"\nedge segments ${segCount}\nfiltered ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} · r ${radius.toFixed(2)}`);

const _c=new THREE.Color();
function applyStyle(){
  const s=state.style;scene.background=new THREE.Color(s.background);hemi.intensity=s.hemisphere;keyLight.intensity=s.key;keyLight.color.set(s.keyTint);rimLight.intensity=s.rim;renderer.toneMappingExposure=s.exposure;
  const faceCol=_c.set(s.face);
  for(const m of solids){const o=originals.get(m);m.material.color.copy(o.color).lerp(faceCol,s.faceTint);m.material.roughness=s.faceRoughness;m.material.metalness=s.faceMetalness;if(s.faceOpacity<.995){m.material.transparent=true;m.material.opacity=s.faceOpacity;m.material.depthWrite=false}else{m.material.transparent=false;m.material.opacity=1;m.material.depthWrite=true}m.material.needsUpdate=true}
  if(slabMesh){slabMesh.material.color.set(s.slab);slabMesh.material.roughness=s.slabRoughness;if(s.slabOpacity<.995){slabMesh.material.transparent=true;slabMesh.material.opacity=s.slabOpacity;slabMesh.material.depthWrite=false}else{slabMesh.material.transparent=false;slabMesh.material.opacity=1;slabMesh.material.depthWrite=true}slabMesh.material.needsUpdate=true}
  edgeMat.color.set(s.edge);edgeMat.opacity=s.edgeOpacity;edgeMat.linewidth=s.edgeWidth;
  glowMat.color.set(s.glow);glowMat.opacity=s.glowOpacity*s.glowStrength;glowMat.linewidth=s.glowWidth;if(glowLines)glowLines.scale.setScalar(1+s.glowExpansion);
  dotUniforms.uDotColor.value.set(s.dotColor);dotUniforms.uOpacity.value=s.dotOpacity;dotUniforms.uSpacing.value=s.dotSpacing;dotUniforms.uDotSize.value=s.dotSize;dotUniforms.uSkew.value=s.dotSkew;dotUniforms.uBaseOpacity.value=s.dotBaseOpacity;dotUniforms.uRippleSpeed.value=s.rippleSpeed;dotUniforms.uRippleFrequency.value=s.rippleFrequency;dotUniforms.uRippleWidth.value=s.rippleWidth;dotUniforms.uRippleStrength.value=s.rippleStrength;dotUniforms.uRippleOrigin.value.set(s.rippleOriginX,s.rippleOriginZ);dotUniforms.uAnimate.value=animateDots?1:0;
}

let fitDist=radius*3;
function computeFit(){const vFov=camera.fov*Math.PI/180;const hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);fitDist=Math.max(radius/Math.sin(vFov/2),radius/Math.sin(hFov/2))}
function resize(){const r=root.getBoundingClientRect();const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=h>w?50:38;camera.updateProjectionMatrix();computeFit();edgeMat.resolution.set(w,h);glowMat.resolution.set(w,h)}
new ResizeObserver(resize).observe(root);resize();
const look=new THREE.Vector3();const lerp=(a,b,t)=>a+(b-a)*t;const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function poseAt(k){const az=k.azimuth*Math.PI/180,el=k.elevation*Math.PI/180;look.set(k.panX*size.x,0,k.panZ*size.z);const d=fitDist*k.zoom;camera.position.set(look.x+Math.sin(az)*Math.cos(el)*d,look.y+Math.sin(el)*d,look.z+Math.cos(az)*Math.cos(el)*d);camera.lookAt(look)}
function poseLerp(t){const K=state.keyframes;const seg=t*(K.length-1),i=Math.min(K.length-2,Math.floor(seg)),f=ease(seg-i);const a=K[i],b=K[i+1];poseAt({azimuth:lerp(a.azimuth,b.azimuth,f),elevation:lerp(a.elevation,b.elevation,f),zoom:lerp(a.zoom,b.zoom,f),panX:lerp(a.panX,b.panX,f),panZ:lerp(a.panZ,b.panZ,f)})}

function build(host,specs,get,onChange){host.innerHTML='';for(const sp of specs){const[k,label]=sp;const wrap=document.createElement('div');let input;if(sp[2]==='color'){wrap.className='ctl color';wrap.innerHTML=`<label>${label}</label>`;input=document.createElement('input');input.type='color';input.oninput=()=>{get()[k]=input.value;onChange();syncUI()}}else{wrap.className='ctl';wrap.innerHTML=`<label>${label}<span data-v></span></label>`;input=document.createElement('input');Object.assign(input,{type:'range',min:sp[2],max:sp[3],step:sp[4]});input.oninput=()=>{get()[k]=parseFloat(input.value);onChange();syncUI()}}wrap.appendChild(input);wrap._input=input;wrap._key=k;wrap._get=get;wrap._isColor=sp[2]==='color';host.appendChild(wrap)}}
const getKF=()=>state.keyframes[active],getStyle=()=>state.style,onStyle=()=>applyStyle(),onEdgeAngle=()=>{rebuildEdges(state.style.edgeAngle);applyStyle()};
const camHost=document.getElementById('camCtls');
const hosts=[[camHost,CAM,getKF,()=>{}],[document.getElementById('lightCtls'),LIGHT,getStyle,onStyle],[document.getElementById('faceCtls'),FACE,getStyle,onStyle],[document.getElementById('slabCtls'),SLAB,getStyle,onStyle],[document.getElementById('edgeCtls'),EDGE,getStyle,onEdgeAngle],[document.getElementById('glowCtls'),GLOW,getStyle,onStyle],[document.getElementById('dotCtls'),DOTS,getStyle,onStyle]];
for(const[host,specs,get,cb]of hosts)build(host,specs,get,cb);

const kfrow=document.getElementById('kfrow');state.keyframes.forEach((_,i)=>{const b=document.createElement('button');b.textContent=String(i).padStart(2,'0');b.onclick=()=>{for(let j=1;j<=i;j++){if(!initialised[j]){state.keyframes[j]={...state.keyframes[j-1]};initialised[j]=true}}active=i;playing=false;syncUI()};kfrow.appendChild(b)});
document.getElementById('copyPrevBtn').onclick=()=>{if(active>0){state.keyframes[active]={...state.keyframes[active-1]};initialised[active]=true;syncUI()}};
document.getElementById('playBtn').onclick=()=>{playing=!playing;playT=0;syncUI()};
const presetRow=document.getElementById('presetRow');for(const name of Object.keys(PRESETS)){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{state.style={...PRESETS[name]};state.preset=name;rebuildEdges(state.style.edgeAngle);applyStyle();syncUI()};presetRow.appendChild(b)}
const toggle=(id,fn,initial)=>{const b=document.getElementById(id);if(initial)b.classList.add('on');b.onclick=()=>{b.classList.toggle('on');fn(b.classList.contains('on'))}};
toggle('tPortrait',on=>{frameEl.classList.toggle('portrait',on);requestAnimationFrame(resize)},false);toggle('tGround',on=>{if(slabMesh)slabMesh.visible=on;pathMeshes.forEach(m=>m.visible=on)},true);toggle('tEdges',on=>{if(edgeLines)edgeLines.visible=on},true);toggle('tGlow',on=>{if(glowLines)glowLines.visible=on},true);toggle('tDots',on=>{if(dotOverlay)dotOverlay.visible=on},true);toggle('tBounds',on=>boundsHelper.visible=on,false);toggle('tGrid',on=>grid.visible=on,false);toggle('tAnimate',on=>{animateDots=on;dotUniforms.uAnimate.value=on?1:0},true);

function serialise(){const s=state.style;const K=state.keyframes.map((k,i)=>`  // 0${i}\n  { azimuth: ${k.azimuth.toFixed(0)}, elevation: ${k.elevation.toFixed(0)}, zoom: ${k.zoom.toFixed(2)}, panX: ${k.panX.toFixed(2)}, panZ: ${k.panZ.toFixed(2)} }`).join(',\n');return `const KEYFRAMES = [\n${K}\n];\n\nlight: {\n  hemisphere: ${s.hemisphere}, key: ${s.key}, rim: ${s.rim},\n  exposure: ${s.exposure}, keyTint: '${s.keyTint}'\n},\n\nstyle: {\n  background: '${s.background}',\n  face: '${s.face}', faceTint: ${s.faceTint}, faceOpacity: ${s.faceOpacity},\n  faceRoughness: ${s.faceRoughness}, faceMetalness: ${s.faceMetalness},\n  slab: '${s.slab}', slabOpacity: ${s.slabOpacity}, slabRoughness: ${s.slabRoughness},\n  edge: '${s.edge}', edgeOpacity: ${s.edgeOpacity}, edgeWidth: ${s.edgeWidth}, edgeAngle: ${s.edgeAngle},\n  glow: '${s.glow}', glowOpacity: ${s.glowOpacity}, glowWidth: ${s.glowWidth},\n  glowStrength: ${s.glowStrength}, glowExpansion: ${s.glowExpansion},\n  dots: { color: '${s.dotColor}', opacity: ${s.dotOpacity}, size: ${s.dotSize}, spacing: ${s.dotSpacing}, skew: ${s.dotSkew}, baseOpacity: ${s.dotBaseOpacity}, rippleSpeed: ${s.rippleSpeed}, rippleFrequency: ${s.rippleFrequency}, rippleWidth: ${s.rippleWidth}, rippleStrength: ${s.rippleStrength}, rippleOriginX: ${s.rippleOriginX}, rippleOriginZ: ${s.rippleOriginZ} }\n}`}
document.getElementById('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(serialise());setStatus('copied to clipboard')}catch{document.getElementById('out').select();setStatus('select the textarea and copy manually')}};
document.getElementById('resetBtn').onclick=()=>{state.style={...PRESETS[state.preset]};rebuildEdges(state.style.edgeAngle);applyStyle();syncUI()};
function syncUI(){[...kfrow.children].forEach((b,i)=>b.classList.toggle('on',i===active&&!playing));document.getElementById('copyPrevBtn').disabled=active===0;for(const[host]of hosts){for(const wrap of host.children){const v=wrap._get()[wrap._key];if(wrap._isColor){wrap._input.value=v}else{wrap._input.value=v;wrap.querySelector('[data-v]').textContent=Math.abs(v)<10?(+v).toFixed(2):(+v).toFixed(0)}}}document.getElementById('out').value=serialise()}
applyStyle();syncUI();
let lastDot=0;(function loop(now){requestAnimationFrame(loop);if(animateDots&&now-lastDot>=33){dotUniforms.uTime.value=now*.001;lastDot=now}if(playing){playT=(playT+.0022)%1;poseLerp(playT)}else poseAt(state.keyframes[active]);renderer.render(scene,camera)})(0);
