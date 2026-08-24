import * as THREE from 'three';

/*
  ADAM architectural glow — stencil de-accumulation + diagnostics
  ----------------------------------------------------------------
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
  Path-ribbon glow is deliberately excluded (it uses NormalBlending and lives
  under Main_Group/paths rather than Main_Group/clusters).

  Diagnostic binary mode:
    ?stenciltest=1
  isolates the INNER architectural glow, forces its opacity to 1.0 and hides
  the outer halo. This is intentionally diagnostic only and never changes the
  normal saved baseline.
*/

const INNER_REF = 1;
const OUTER_REF = 2;
const PATCH_TAG = 'adamArchitecturalStencilDestackV2';
const TEST_MODE = new URLSearchParams(location.search).get('stenciltest') === '1';
const MATERIALS = new Set();
const BASE_OPACITY = new WeakMap();
let checkedContext = false;
let contextStencil = null;
let stencilBits = null;
let lastStats = null;
let lastStatusText = '';

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

function rememberOpacity(material) {
  if (!material || BASE_OPACITY.has(material)) return;
  BASE_OPACITY.set(material, Number(material.opacity));
}

function configureStencil(material, ref, layer) {
  if (!material) return;

  rememberOpacity(material);

  material.stencilWrite = true;
  material.stencilWriteMask = 0xff;
  material.stencilFuncMask = 0xff;
  material.stencilRef = ref;
  material.stencilFunc = THREE.NotEqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;

  // Binary test only: one opaque-ish architectural glow layer, no halo.
  // The normal calibrator does not enter this branch.
  if (TEST_MODE) {
    material.opacity = layer === 'inner' ? 1.0 : 0.0;
  }

  material.userData = {
    ...(material.userData || {}),
    [PATCH_TAG]: layer,
    adamStencilRef: ref,
    adamStencilBinaryTest:TEST_MODE
  };

  material.needsUpdate = true;
  MATERIALS.add(material);
}

function materialCheck(material, expectedRef) {
  if (!material) return null;
  return {
    stencilWrite:material.stencilWrite === true,
    ref:material.stencilRef,
    refOK:material.stencilRef === expectedRef,
    funcOK:material.stencilFunc === THREE.NotEqualStencilFunc,
    zPassOK:material.stencilZPass === THREE.ReplaceStencilOp,
    opacity:Number(material.opacity)
  };
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

  const innerMaterial = innerMaterials.values().next().value || null;
  const outerMaterial = outerMaterials.values().next().value || null;

  lastStats = {
    testMode:TEST_MODE,
    contextStencil,
    stencilBits,
    innerLines,
    outerLines,
    innerMaterials:innerMaterials.size,
    outerMaterials:outerMaterials.size,
    innerCheck:materialCheck(innerMaterial, INNER_REF),
    outerCheck:materialCheck(outerMaterial, OUTER_REF)
  };

  publishStatus();
}

function verifyContext(renderer) {
  if (checkedContext) return;
  checkedContext = true;

  try {
    const gl = renderer.getContext();
    const attrs = gl.getContextAttributes?.();
    contextStencil = attrs?.stencil === true;
    stencilBits = Number(gl.getParameter(gl.STENCIL_BITS) || 0);

    console.log('[ADAM stencil glow] contextAttributes.stencil =', contextStencil);
    console.log('[ADAM stencil glow] STENCIL_BITS =', stencilBits);
  } catch (error) {
    contextStencil = false;
    stencilBits = 0;
    console.warn('[ADAM stencil glow] could not query stencil buffer', error);
  }

  if (!contextStencil || !stencilBits) {
    console.error(
      '[ADAM stencil glow] NO USABLE STENCIL BUFFER. ' +
      'The renderer must receive stencil:true at WebGL context creation.'
    );
  } else {
    console.info(`[ADAM stencil glow] live context confirmed: stencil=true, ${stencilBits} bits`);
  }
}

function bool(v) { return v ? 'YES' : 'NO'; }

function publishStatus() {
  if (!lastStats) return;

  const inner = lastStats.innerCheck;
  const outer = lastStats.outerCheck;
  const text = [
    `STENCIL DIAGNOSTIC${TEST_MODE ? ' · BINARY TEST ACTIVE' : ''}`,
    `context stencil: ${bool(lastStats.contextStencil)} · bits: ${lastStats.stencilBits ?? '?'}`,
    `inner glow: ${lastStats.innerLines} lines · ${lastStats.innerMaterials} materials · write ${bool(inner?.stencilWrite)} · ref ${inner?.ref ?? '?'} (${bool(inner?.refOK)}) · NotEqual ${bool(inner?.funcOK)} · Replace ${bool(inner?.zPassOK)}`,
    `outer halo: ${lastStats.outerLines} lines · ${lastStats.outerMaterials} materials · write ${bool(outer?.stencilWrite)} · ref ${outer?.ref ?? '?'} (${bool(outer?.refOK)}) · NotEqual ${bool(outer?.funcOK)} · Replace ${bool(outer?.zPassOK)}`,
    TEST_MODE
      ? 'TEST MODE: inner opacity 1.0 · outer halo 0.0. Compare corner brightness with a long straight run.'
      : 'Normal baseline mode: approved glow opacity/width remain controlled by the calibrator.'
  ].join('\n');

  if (text === lastStatusText) return;
  lastStatusText = text;

  console.info('[ADAM stencil glow]\n' + text);

  const status = document.getElementById('status');
  if (status) {
    const existing = status.textContent
      .split('\n')
      .filter(line => !line.startsWith('STENCIL ') &&
                      !line.startsWith('context stencil:') &&
                      !line.startsWith('inner glow:') &&
                      !line.startsWith('outer halo:') &&
                      !line.startsWith('TEST MODE:') &&
                      !line.startsWith('Normal baseline mode:'))
      .join('\n');
    status.textContent = `${existing}\n${text}`.trim();
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamArchitecturalStencilDestackRender(scene, camera) {
  verifyContext(this);

  // Three r160 defaults autoClearStencil=true. Keep it explicit here so this
  // experiment cannot inherit a stale stencil mask between frames.
  this.autoClearStencil = true;

  configureScene(scene);

  return previousRender.call(this, scene, camera);
};

window.__ADAM_GLOW_STENCIL_DESTACK = {
  version:2,
  testMode:TEST_MODE,
  refs:{ inner:INNER_REF, outer:OUTER_REF },
  materials:MATERIALS,
  stats:() => lastStats,
  contextStencil:() => contextStencil,
  stencilBits:() => stencilBits
};
