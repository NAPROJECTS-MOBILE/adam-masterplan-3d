import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';

/*
  Rim-glow policy for the ADAM calibrator.

  Default rule: every eligible solid/building mesh keeps the existing lime
  LineSegments2 glow created by app-v2.js.

  Only the exact GLB paths below are forced to NO GLOW. Full paths are used on
  purpose because names such as Rectangle_2 / Rectangle_10 repeat throughout
  the model and loose name matching has already caused wrong-object behaviour.
*/
export const NO_RIM_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5'
]);

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

/*
  app-v2 creates BOTH its thin edge and soft rim glow using LineSegments2.
  The glow is the additive-blended layer. Patch updateMatrixWorld once so every
  current and future glow layer automatically obeys the blacklist, including
  layers rebuilt when Edge Angle changes.

  We only ever force blacklisted glow layers OFF. Non-blacklisted visibility is
  left untouched, so the calibrator's existing global Glow toggle still works.
*/
const originalUpdateMatrixWorld = LineSegments2.prototype.updateMatrixWorld;
const reported = new WeakSet();

LineSegments2.prototype.updateMatrixWorld = function updateMatrixWorld(force) {
  originalUpdateMatrixWorld.call(this, force);

  const isRimGlow = this.material?.blending === THREE.AdditiveBlending;
  if (!isRimGlow || !this.parent) return;

  const parentPath = pathOf(this.parent);
  if (!NO_RIM_GLOW_PATHS.has(parentPath)) return;

  this.visible = false;

  if (!reported.has(this)) {
    reported.add(this);
    console.info('[ADAM rim glow] excluded:', parentPath);
  }
};

// Handy for browser-console verification while calibrating.
window.__ADAM_NO_RIM_GLOW_PATHS = NO_RIM_GLOW_PATHS;
