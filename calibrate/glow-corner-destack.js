import * as THREE from 'three';

/*
  ADAM architectural glow — topology-aware corner de-stack V2
  ------------------------------------------------------------
  The previous cap-only pass was insufficient: even with protruding end-caps
  removed, the screen-space rectangles of 2–3 additive LineSegments2 strokes
  still overlap at a shared architectural vertex.

  V2 solves the actual accumulation:
  - inspect each LineSegmentsGeometry's segment topology;
  - count how many segment endpoints share each local vertex;
  - attach per-instance start/end contribution weights (1 / valence);
  - keep the stock line body at full strength;
  - only near a segment endpoint, ramp from its valence weight back to 1.0;
  - keep USE_DASH only as a continuous butt-cap mode so protruding round caps
    are discarded without visually dashing the line.

  Example: a 3-way box corner becomes 1/3 + 1/3 + 1/3 ~= one straight glow,
  instead of three additive contributions creating a bright bulb.
*/

const PATCH_TAG = 'adamGlowCornerDestackV2';
const LINE_TAG = 'adamGlowCornerWeightsV2';
const ATTR_START = 'instanceAdamStartWeight';
const ATTR_END = 'instanceAdamEndWeight';

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function isArchitecturalAdditiveGlow(line) {
  if (!line?.isLineSegments2 || !line.material || !line.geometry) return false;
  if (line.material.blending !== THREE.AdditiveBlending) return false;
  const parentPath = line.parent ? pathOf(line.parent) : '';
  return parentPath.includes('Scene_1/Main_Group/clusters/');
}

function quantizedKey(attribute, index) {
  // EdgesGeometry duplicates the same source corner with tiny float noise on
  // some exported meshes. 1e-4 local-unit quantisation is tight enough to join
  // genuine shared vertices without merging nearby architectural details.
  const q = 1e4;
  return `${Math.round(attribute.getX(index) * q)},${Math.round(attribute.getY(index) * q)},${Math.round(attribute.getZ(index) * q)}`;
}

function installCornerWeights(line) {
  const geometry = line.geometry;
  const start = geometry.getAttribute('instanceStart');
  const end = geometry.getAttribute('instanceEnd');
  if (!start || !end || start.count !== end.count || start.count < 1) return false;

  const counts = new Map();
  const startKeys = new Array(start.count);
  const endKeys = new Array(end.count);

  for (let i = 0; i < start.count; i++) {
    const a = quantizedKey(start, i);
    const b = quantizedKey(end, i);
    startKeys[i] = a;
    endKeys[i] = b;
    counts.set(a, (counts.get(a) || 0) + 1);
    counts.set(b, (counts.get(b) || 0) + 1);
  }

  const startWeights = new Float32Array(start.count);
  const endWeights = new Float32Array(end.count);

  for (let i = 0; i < start.count; i++) {
    startWeights[i] = 1 / Math.max(1, counts.get(startKeys[i]) || 1);
    endWeights[i] = 1 / Math.max(1, counts.get(endKeys[i]) || 1);
  }

  geometry.setAttribute(ATTR_START, new THREE.InstancedBufferAttribute(startWeights, 1));
  geometry.setAttribute(ATTR_END, new THREE.InstancedBufferAttribute(endWeights, 1));
  return true;
}

function patchMaterial(material) {
  if (!material || material.userData?.[PATCH_TAG]) return;
  material.userData = { ...(material.userData || {}), [PATCH_TAG]: true };

  // Continuous dash mode removes LineMaterial's protruding screen-space caps.
  // dashSize is intentionally enormous and gapSize zero, so no visible dash
  // pattern is introduced.
  material.dashed = true;
  material.dashOffset = 0;
  material.dashScale = 1;
  material.dashSize = 1e9;
  material.gapSize = 0;

  let vertex = material.vertexShader || '';
  let fragment = material.fragmentShader || '';

  const vertexDeclNeedle = 'attribute vec3 instanceColorEnd;';
  if (vertex.includes(vertexDeclNeedle) && !vertex.includes(ATTR_START)) {
    vertex = vertex.replace(vertexDeclNeedle, `${vertexDeclNeedle}\n\n\t\tattribute float ${ATTR_START};\n\t\tattribute float ${ATTR_END};\n\t\tvarying float vAdamStartWeight;\n\t\tvarying float vAdamEndWeight;`);
  }

  const vertexMainNeedle = 'void main() {';
  if (vertex.includes(vertexMainNeedle) && !vertex.includes('vAdamStartWeight =')) {
    vertex = vertex.replace(vertexMainNeedle, `${vertexMainNeedle}\n\n\t\t\tvAdamStartWeight = ${ATTR_START};\n\t\t\tvAdamEndWeight = ${ATTR_END};`);
  }

  const fragmentDeclNeedle = 'varying float vLineDistance;';
  if (fragment.includes(fragmentDeclNeedle) && !fragment.includes('varying float vAdamStartWeight;')) {
    fragment = fragment.replace(fragmentDeclNeedle, `${fragmentDeclNeedle}\n\t\tvarying float vAdamStartWeight;\n\t\tvarying float vAdamEndWeight;`);
  }

  const alphaNeedle = 'float alpha = opacity;';
  if (fragment.includes(alphaNeedle) && !fragment.includes('adamValenceWeight')) {
    fragment = fragment.replace(alphaNeedle, `${alphaNeedle}\n\n\t\t\t// ADAM V2: compensate additive overlap only at shared architectural vertices.\n\t\t\t// For screen-space LineMaterial, vUv.y runs from -1 at the start\n\t\t\t// endpoint through 0 at the segment centre to +1 at the end endpoint.\n\t\t\tfloat adamEndpointDistance = max( 0.0, 1.0 - abs( vUv.y ) );\n\t\t\tfloat adamValenceWeight = ( vUv.y < 0.0 ) ? vAdamStartWeight : vAdamEndWeight;\n\t\t\t// Limit compensation to a very short portion of the segment. The\n\t\t\t// straight run remains exactly at the approved opacity.\n\t\t\tfloat adamEndpointBlend = smoothstep( 0.0, 0.025, adamEndpointDistance );\n\t\t\talpha *= mix( adamValenceWeight, 1.0, adamEndpointBlend );`);
  }

  material.vertexShader = vertex;
  material.fragmentShader = fragment;
  material.needsUpdate = true;
}

function patchLine(line) {
  if (!isArchitecturalAdditiveGlow(line)) return;

  if (!line.userData?.[LINE_TAG]) {
    line.userData = { ...(line.userData || {}), [LINE_TAG]: true };
    installCornerWeights(line);

    // USE_DASH requires line-distance attributes even though the dash is made
    // continuous. Compute once after the topology attributes are installed.
    try {
      line.computeLineDistances?.();
    } catch (error) {
      console.warn('[ADAM glow de-stack V2] line-distance build failed', error);
    }
  }

  patchMaterial(line.material);
}

function patchScene(scene) {
  scene?.traverse?.(patchLine);
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamGlowCornerDestackV2Render(scene, camera) {
  patchScene(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_GLOW_CORNER_DESTACK = {
  version:2,
  patchScene
};
