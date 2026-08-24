import * as THREE from 'three';

/*
  ADAM architectural glow — stencil de-accumulation
  -------------------------------------------------
  Confirmed issue: LineSegments2 round caps overlap at shared architectural
  vertices. With additive blending, 3-way corners become ~3x straight-run
  intensity and 6-way points can become ~6x.

  This pass preserves the approved line geometry, pixel width, colour, opacity,
  additive blending and camera. It only prevents the SAME architectural glow
  layer from writing a pixel more than once.

  Stencil policy:
    outer architectural halo : ref 2, renderOrder 1
    inner architectural glow : ref 1, renderOrder 2

  Different refs are essential so the halo does not mask the inner glow.
  Path-ribbon glow is deliberately excluded.
*/

const INNER_REF = 1;
const OUTER_REF = 2;
const PATCH_TAG = 'adamArchitecturalStencilDestackV1';
const MATERIALS = new Set();
let checkedContext = false;
let stencilBits = null;
let lastStats = null;

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function isArchitecturalGlow(line) {
  if (!line?.isLineSegments2 || !line.material) return false;
  if (line.material.blending !== THREE.AdditiveBlending) return false;

  const parentPath = line.parent ? pathOf(line.parent) : '';
  return parentPath.includes('Scene_1/Main_Group/clusters/');
}

function glowLayer(line) {
  return line.userData?.adamSupplementalOuterGlow ? 'outer' : 'inner';
}

function configureStencil(material, ref, layer) {
  if (!material) return;

  material.stencilWrite = true;
  material.stencilWriteMask = 0xff;
  material.stencilFuncMask = 0xff;
  material.stencilRef = ref;
  material.stencilFunc = THREE.NotEqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;

  material.userData = {
    ...(material.userData || {}),
    [PATCH_TAG]: layer,
    adamStencilRef: ref
  };

  material.needsUpdate = true;
  MATERIALS.add(material);
}

function configureScene(scene) {
  let innerLines = 0;
  let outerLines = 0;
  const innerMaterials = new Set();
  const outerMaterials = new Set();

  scene?.traverse?.(line => {
    if (!isArchitecturalGlow(line)) return;

    const layer = glowLayer(line);
    if (layer === 'outer') {
      outerLines++;
      outerMaterials.add(line.material);
      configureStencil(line.material, OUTER_REF, 'outer');
    } else {
      innerLines++;
      innerMaterials.add(line.material);
      configureStencil(line.material, INNER_REF, 'inner');
    }
  });

  lastStats = {
    innerLines,
    outerLines,
    innerMaterials:innerMaterials.size,
    outerMaterials:outerMaterials.size,
    stencilBits
  };
}

function verifyContext(renderer) {
  if (checkedContext) return;
  checkedContext = true;

  try {
    const gl = renderer.getContext();
    stencilBits = gl.getParameter(gl.STENCIL_BITS);
  } catch (error) {
    stencilBits = 0;
    console.warn('[ADAM stencil glow] could not query stencil buffer', error);
  }

  if (!stencilBits) {
    console.error(
      '[ADAM stencil glow] renderer has no stencil buffer. ' +
      'If this occurs, construct WebGLRenderer with { stencil:true }.'
    );
  } else {
    console.info(`[ADAM stencil glow] ${stencilBits}-bit stencil buffer confirmed`);
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamArchitecturalStencilDestackRender(scene, camera) {
  verifyContext(this);

  // WebGLRenderer normally clears stencil automatically when autoClear is on.
  // Set this explicitly so the policy survives future renderer configuration
  // changes without carrying corner masks into the next frame.
  this.autoClearStencil = true;

  configureScene(scene);

  return previousRender.call(this, scene, camera);
};

window.__ADAM_GLOW_STENCIL_DESTACK = {
  version:1,
  refs:{ inner:INNER_REF, outer:OUTER_REF },
  materials:MATERIALS,
  stats:() => lastStats,
  stencilBits:() => stencilBits
};
