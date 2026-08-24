import * as THREE from 'three';

/*
  ADAM architectural glow — corner de-stack
  ------------------------------------------
  Three.js LineSegments2 renders every edge as an independent fat segment.
  Its normal undashed shader gives each segment an end-cap. On architectural
  vertices, two or three additive glow segments terminate at the same pixel,
  so those caps accumulate into bright corner bulbs.

  This patch keeps the approved straight-run glow colour / width / opacity,
  but changes only the final few percent of architectural glow segments:

  1. force a continuous "dash" mode with an effectively infinite dash so the
     stock LineMaterial shader discards protruding end-caps (but never dashes);
  2. attenuate alpha close to each endpoint, where 2–3 segments overlap;
  3. leave the centre ~94% of every segment untouched;
  4. affect only additive LineSegments2 under Main_Group/clusters.

  This is deliberately a renderer-side calibration fix. It does not touch the
  GLB, camera frames, materials, path-ribbon renderer or saved glow strength.
*/

const PATCH_TAG = 'adamGlowCornerDestackV1';
const LINE_TAG = 'adamGlowCornerDistancesV1';

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
  if (!line?.isLineSegments2 || !line.material) return false;
  if (line.material.blending !== THREE.AdditiveBlending) return false;
  const parentPath = line.parent ? pathOf(line.parent) : '';
  return parentPath.includes('Scene_1/Main_Group/clusters/');
}

function patchMaterial(material) {
  if (!material || material.userData?.[PATCH_TAG]) return;

  material.userData = { ...(material.userData || {}), [PATCH_TAG]: true };

  // USE_DASH removes the stock LineMaterial end-cap geometry in the fragment
  // shader. A huge dash with zero gap makes the line visually continuous.
  material.dashed = true;
  material.dashOffset = 0;
  material.dashScale = 1;
  material.dashSize = 1e9;
  material.gapSize = 0;

  const needle = 'float alpha = opacity;';
  if (material.fragmentShader?.includes(needle) && !material.fragmentShader.includes('adamEndpointFade')) {
    material.fragmentShader = material.fragmentShader.replace(needle, `${needle}\n\n\t// ADAM: de-stack additive architectural glow at shared segment vertices.\n\t// vUv.y spans -1..1 across the segment body; abs(y)=1 is an endpoint.\n\tfloat adamEndpointDistance = max( 0.0, 1.0 - abs( vUv.y ) );\n\tfloat adamEndpointFade = smoothstep( 0.0, 0.06, adamEndpointDistance );\n\t// A 0.38 endpoint alpha means 2–3 coincident edges sum to roughly one\n\t// normal straight-run glow instead of producing a white-hot corner bulb.\n\talpha *= mix( 0.38, 1.0, adamEndpointFade );`);
  }

  material.needsUpdate = true;
}

function patchLine(line) {
  if (!isArchitecturalAdditiveGlow(line)) return;

  patchMaterial(line.material);

  // Dashed LineMaterial expects instance line-distance attributes even though
  // our dash is intentionally infinite. Build them once per line geometry.
  if (!line.userData?.[LINE_TAG]) {
    line.userData = { ...(line.userData || {}), [LINE_TAG]: true };
    try {
      line.computeLineDistances?.();
    } catch (error) {
      console.warn('[ADAM glow de-stack] line-distance build failed', error);
    }
  }
}

function patchScene(scene) {
  scene?.traverse?.(patchLine);
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamGlowCornerDestackRender(scene, camera) {
  patchScene(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_GLOW_CORNER_DESTACK = {
  version:1,
  patchScene
};
