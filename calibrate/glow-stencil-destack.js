import * as THREE from 'three';

/* ADAM architectural glow — stencil de-accumulation + independent diagnostics */

const INNER_REF = 1;
const OUTER_REF = 2;
const PATCH_TAG = 'adamArchitecturalStencilDestackV3';
const TEST_MODE = new URLSearchParams(location.search).get('stenciltest') === '1';
const MATERIALS = new Set();
let checkedContext = false;
let contextStencil = null;
let stencilBits = null;
let lastStats = null;
let diagnosticEl = null;

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

function ensureDiagnosticPanel() {
  if (diagnosticEl?.isConnected) return diagnosticEl;
  diagnosticEl = document.createElement('div');
  diagnosticEl.id = 'adamStencilDiagnostic';
  Object.assign(diagnosticEl.style, {
    position:'fixed', left:'14px', bottom:'14px', zIndex:'99999',
    width:'min(520px, calc(100vw - 380px))', minWidth:'340px',
    padding:'10px 12px', border:'1px solid #c8f542', borderRadius:'4px',
    background:'rgba(8,8,8,.94)', color:'#e8e8e8',
    font:'11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    whiteSpace:'pre-wrap', pointerEvents:'none', boxShadow:'0 8px 30px rgba(0,0,0,.28)'
  });
  document.body.appendChild(diagnosticEl);
  return diagnosticEl;
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

  if (TEST_MODE) material.opacity = layer === 'inner' ? 1.0 : 0.0;

  material.userData = {
    ...(material.userData || {}),
    [PATCH_TAG]: layer,
    adamStencilRef: ref,
    adamStencilBinaryTest: TEST_MODE
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

function bool(v) { return v ? 'YES' : 'NO'; }

function publishPanel() {
  if (!lastStats) return;
  const el = ensureDiagnosticPanel();
  const inner = lastStats.innerCheck;
  const outer = lastStats.outerCheck;
  const goodContext = !!lastStats.contextStencil && Number(lastStats.stencilBits) > 0;
  const goodInner = !!inner?.stencilWrite && !!inner?.refOK && !!inner?.funcOK && !!inner?.zPassOK;
  const goodOuter = lastStats.outerLines === 0 || (!!outer?.stencilWrite && !!outer?.refOK && !!outer?.funcOK && !!outer?.zPassOK);

  el.style.borderColor = goodContext && goodInner && goodOuter ? '#c8f542' : '#ff625f';
  el.innerHTML = [
    `<strong style="color:${goodContext && goodInner && goodOuter ? '#c8f542' : '#ff625f'}">STENCIL DIAGNOSTIC V3${TEST_MODE ? ' · BINARY TEST ACTIVE' : ''}</strong>`,
    `live WebGL context stencil: ${bool(lastStats.contextStencil)} · STENCIL_BITS: ${lastStats.stencilBits ?? '?'}`,
    `inner architecture: ${lastStats.innerLines} lines · write ${bool(inner?.stencilWrite)} · ref ${inner?.ref ?? '?'} · refOK ${bool(inner?.refOK)} · NotEqual ${bool(inner?.funcOK)} · Replace ${bool(inner?.zPassOK)} · opacity ${inner?.opacity ?? '?'}`,
    `outer halo: ${lastStats.outerLines} lines · write ${bool(outer?.stencilWrite)} · ref ${outer?.ref ?? '?'} · refOK ${bool(outer?.refOK)} · NotEqual ${bool(outer?.funcOK)} · Replace ${bool(outer?.zPassOK)} · opacity ${outer?.opacity ?? '?'}`,
    TEST_MODE
      ? 'BINARY TEST: inner architectural glow forced to 1.0; outer architectural halo forced to 0. Compare a bad corner directly with a long straight run.'
      : 'NORMAL MODE: approved Preview 5 appearance remains active.'
  ].join('<br>');
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
  publishPanel();
}

function verifyContext(renderer) {
  if (checkedContext) return;
  checkedContext = true;
  try {
    const gl = renderer.getContext();
    const attrs = gl.getContextAttributes?.();
    contextStencil = attrs?.stencil === true;
    stencilBits = Number(gl.getParameter(gl.STENCIL_BITS) || 0);
    console.log('[ADAM stencil V3] contextAttributes.stencil =', contextStencil);
    console.log('[ADAM stencil V3] STENCIL_BITS =', stencilBits);
  } catch (error) {
    contextStencil = false;
    stencilBits = 0;
    console.warn('[ADAM stencil V3] context query failed', error);
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function adamArchitecturalStencilDestackV3Render(scene, camera) {
  verifyContext(this);
  this.autoClearStencil = true;
  configureScene(scene);
  return previousRender.call(this, scene, camera);
};

window.__ADAM_GLOW_STENCIL_DESTACK = {
  version:3,
  testMode:TEST_MODE,
  refs:{inner:INNER_REF, outer:OUTER_REF},
  materials:MATERIALS,
  stats:() => lastStats,
  contextStencil:() => contextStencil,
  stencilBits:() => stencilBits
};
