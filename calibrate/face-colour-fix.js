import * as THREE from 'three';

/*
  ADAM calibrator face-colour correction
  -------------------------------------
  The building materials are physically lit MeshStandard/Physical materials.
  A selected white base colour therefore still renders grey on faces that are
  not receiving enough direct/hemisphere light. Opacity does not change that.

  Keep the existing physical shading, roughness, metalness and all lighting
  controls, but add a controlled self-lit contribution using the CURRENT face
  colour that app-v2 has already applied. This makes white read as white and
  makes saturated picker colours visibly match the chosen hue without turning
  the buildings into unlit MeshBasicMaterial objects.
*/

const FACE_EMISSIVE_BOOST = 0.85;
const CLUSTER_TOKEN = 'Scene_1/Main_Group/clusters/';

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
}

function reinforceFaceColour(scene) {
  scene.traverse(object => {
    if (!object?.isMesh) return;
    const path = pathOf(object);
    if (!path.includes(CLUSTER_TOKEN)) return;

    eachMaterial(object, mat => {
      // Standard/Physical/Phong materials expose emissive. Leave unusual or
      // shader materials alone.
      if (!mat?.color || !mat?.emissive) return;
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = FACE_EMISSIVE_BOOST;
    });
  });
}

const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  reinforceFaceColour(scene);
  return originalRender.call(this, scene, camera);
};

window.__ADAM_FACE_EMISSIVE_BOOST = FACE_EMISSIVE_BOOST;
console.info(`[ADAM face colour] physical shading retained; colour boost=${FACE_EMISSIVE_BOOST}`);
