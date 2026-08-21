import * as THREE from 'three';

/* Diagnostic-only early hook. Loaded before the path renderer/app so later
   panel diagnostics can project labels into screen space reliably. It does not
   change the scene, camera, materials, geometry, depth, motion, or render order. */

let renderer = null;
let scene = null;
let camera = null;

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamPathViewHookRender(nextScene, nextCamera) {
  renderer = this;
  scene = nextScene;
  camera = nextCamera;
  return previousRender.call(this, nextScene, nextCamera);
};

window.__ADAM_PATH_VIEW = () => ({ renderer, scene, camera });
