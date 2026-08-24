import * as THREE from 'three';

/*
  ADAM architectural glow — stencil de-accumulation V4
  ----------------------------------------------------
  Three r160 assigns renderer.render as an OWN instance function, so the old
  prototype-render interception never executed. V4 runs through the proven
  calibrator renderer bridge (__ADAM_BEFORE_RENDER_HOOKS).

  Goal: preserve the existing LineSegments2 glow appearance on straight runs,
  but allow each architectural glow layer to contribute only once per pixel.
  Shared endpoints/caps therefore cannot add 3x/6x brightness at corners.

  Path ribbons are untouched: they use NormalBlending and live under /paths/.
*/

const INNER_BIT = 0x1;
const OUTER_BIT = 0x2;
const PATCH_TAG = 'adamArchitecturalStencilDestackV4';
const TEST_MODE = new URLSearchParams(location.search).get('stenciltest') === '1';
const MATERIALS = new Set();

let checkedContext = false;
let contextStencil = null;
let stencilBits = null;
let lastStats = null;
let renderTicks = 0;

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
  if (line.userData?.adamPathRailLayer) return false;
  if (line.material.blending !== THREE.AdditiveBlending) return false;
  const parentPath = line.parent ? pathOf(line.parent) : '';
  return parentPath.includes('Scene_1/Main_Group/clusters/');
}

function glowLayer(line) {
  return line.userData?.adamSupplementalOuterGlow ? 'outer' : 'inner';
}

function configureStencil(material, bit, layer) {
  if (!material) return;

  material.stencilWrite = true;
  material.stencilRef = bit;
  material.stencilWriteMask = bit;
  material.stencilFuncMask = bit;
  material.stencilFunc = THREE.NotEqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;

  // Optional binary proof: force the architecture inner glow fully opaque. If
  // stencil is working, corner brightness should still equal straight-run
  // brightness instead of accumulating at shared endpoints.
  if (TEST_MODE) material.opacity = layer === 'inner' ? 1.0 : 0.0;

  material.userData = {
    ...(material.userData || {}),
    [PATCH_TAG]: layer,
    adamStencilBit: bit,
    adamStencilBinaryTest: TEST_MODE
  };
  material.needsUpdate = true;
  MATERIALS.add(material);
}

function verifyContext(renderer) {
  if (checkedContext) return;
  checkedContext = true;
  try {
    const gl = renderer.getContext();
    const attrs = gl.getContextAttributes?.();
    contextStencil = attrs?.stencil === true;
    stencilBits = Number(gl.getParameter(gl.STENCIL_BITS) || 0);
  } catch (error) {
    contextStencil = false;
    stencilBits = 0;
    console.warn('[ADAM glow stencil V4] context query failed', error);
  }
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
      configureStencil(line.material, OUTER_BIT, 'outer');
    } else {
      innerLines++;
      innerMaterials.add(line.material);
      configureStencil(line.material, INNER_BIT, 'inner');
    }
  });

  lastStats = {
    renderTicks,
    testMode:TEST_MODE,
    contextStencil,
    stencilBits,
    innerLines,
    outerLines,
    innerMaterials:innerMaterials.size,
    outerMaterials:outerMaterials.size
  };

  const status = document.getElementById('architecturalGlowStatus');
  if (status) {
    const contextOK = !!contextStencil && Number(stencilBits) > 0;
    status.textContent = contextOK
      ? `glow stencil V4 ACTIVE · hooks ${renderTicks} · stencil ${stencilBits}-bit · ${innerLines} inner line layers${outerLines ? ` · ${outerLines} halo layers` : ''}${TEST_MODE ? ' · BINARY TEST' : ''}`
      : `glow stencil V4 ERROR · renderer stencil buffer unavailable`;
  }
}

function beforeRender(renderer, scene) {
  renderTicks++;
  verifyContext(renderer);
  renderer.autoClearStencil = true;
  configureScene(scene);
}

window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_GLOW_STENCIL_DESTACK = {
  version:4,
  testMode:TEST_MODE,
  bits:{ inner:INNER_BIT, outer:OUTER_BIT },
  materials:MATERIALS,
  stats:() => lastStats,
  contextStencil:() => contextStencil,
  stencilBits:() => stencilBits,
  get renderTicks(){ return renderTicks; }
};
