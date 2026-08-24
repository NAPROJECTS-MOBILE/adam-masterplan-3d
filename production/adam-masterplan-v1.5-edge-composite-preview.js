import * as THREE from 'three';

/*
  ADAM MASTERPLAN — EDGE/GLOW COMPOSITE PREVIEW
  --------------------------------------------
  Safe experiment built on the exact working Preview 5 runtime.

  Goal:
  Remove darker/brighter corner blobs caused by translucent edge/glow segments
  stacking on top of each other.

  Method:
  - keep all existing edge geometry exactly as-is
  - keep all existing block/material assignments exactly as-is
  - keep Preview 5 keyframes and section-entry scroll mapping exactly as-is
  - keep strip glow module exactly as-is
  - change ONLY the global block edge/glow line materials
  - replace low-alpha compositing with opaque pre-composited colours so drawing
    the same colour twice at a corner does not accumulate intensity

  This is intentionally the quick/safe option before considering a joined-line
  shader/post-process approach.
*/

const BASELINE_RUNTIME = './adam-masterplan-v1.5-preview5.js?v=43716e4ee7d36ef0173f4f6632f8e20512455b3f';

const EDGE_SOURCE = new THREE.Color('#242424');
const GLOW_SOURCE = new THREE.Color('#b9e222');
const WHITE = new THREE.Color('#ffffff');

const BASE_EDGE_OPACITY = 0.15;
const BASE_GLOW_EFFECTIVE_OPACITY = 0.06 * 0.3;

// Glow needs a slightly stronger pre-composite tint than the literal 0.018
// alpha-equivalent because the old material used AdditiveBlending. This keeps
// it visible while removing additive stacking. Both values remain adjustable
// through data attributes / the exposed runtime API.
const DEFAULT_EDGE_MIX = BASE_EDGE_OPACITY;
const DEFAULT_GLOW_MIX = 0.06;

const root = document.querySelector('[data-adam-masterplan-v15-preview]');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readMix(attribute, fallback) {
  if (!root) return fallback;
  const value = Number(root.getAttribute(attribute));
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

function compositeOverWhite(source, mix) {
  return WHITE.clone().lerp(source, clamp(mix, 0, 1));
}

function near(a, b, epsilon = 1e-4) {
  return Math.abs(a - b) <= epsilon;
}

function sameColor(a, b, epsilon = 1e-4) {
  return !!a && !!b &&
    near(a.r, b.r, epsilon) &&
    near(a.g, b.g, epsilon) &&
    near(a.b, b.b, epsilon);
}

function isGlobalEdgeMaterial(material) {
  return !!material?.isLineMaterial &&
    near(material.linewidth, 1, 1e-3) &&
    near(material.opacity, BASE_EDGE_OPACITY, 2e-3) &&
    sameColor(material.color, EDGE_SOURCE, 2e-3) &&
    material.blending === THREE.NormalBlending;
}

function isGlobalGlowMaterial(material) {
  return !!material?.isLineMaterial &&
    near(material.linewidth, 7, 1e-3) &&
    near(material.opacity, BASE_GLOW_EFFECTIVE_OPACITY, 2e-3) &&
    sameColor(material.color, GLOW_SOURCE, 2e-3) &&
    material.blending === THREE.AdditiveBlending;
}

function findGlobalLineLayers(model) {
  const edgeMaterials = new Set();
  const glowMaterials = new Set();
  let edgeLines = 0;
  let glowLines = 0;

  model?.traverse?.(object => {
    if (!object?.isLineSegments2 || !object.material) return;
    const material = object.material;

    if (isGlobalEdgeMaterial(material)) {
      edgeMaterials.add(material);
      edgeLines++;
      return;
    }

    if (isGlobalGlowMaterial(material)) {
      glowMaterials.add(material);
      glowLines++;
    }
  });

  return { edgeMaterials, glowMaterials, edgeLines, glowLines };
}

function patchMaterials(state, edgeMix, glowMix) {
  const edgeColor = compositeOverWhite(EDGE_SOURCE, edgeMix);
  const glowColor = compositeOverWhite(GLOW_SOURCE, glowMix);

  for (const material of state.edgeMaterials) {
    material.color.copy(edgeColor);
    material.opacity = 1;
    material.transparent = true;
    material.blending = THREE.NormalBlending;
    material.toneMapped = false;
    material.needsUpdate = true;
  }

  for (const material of state.glowMaterials) {
    material.color.copy(glowColor);
    material.opacity = 1;
    material.transparent = true;
    material.blending = THREE.NormalBlending;
    material.depthWrite = false;
    material.toneMapped = false;
    material.needsUpdate = true;
  }

  state.edgeMix = edgeMix;
  state.glowMix = glowMix;
  state.edgeColor = `#${edgeColor.getHexString(THREE.SRGBColorSpace)}`;
  state.glowColor = `#${glowColor.getHexString(THREE.SRGBColorSpace)}`;

  if (root) {
    root.dataset.edgeCompositeMix = edgeMix.toFixed(3);
    root.dataset.glowCompositeMix = glowMix.toFixed(3);
    root.dataset.edgeCompositeColor = state.edgeColor;
    root.dataset.glowCompositeColor = state.glowColor;
  }
}

await import(BASELINE_RUNTIME);

function install(api) {
  if (!api?.model || api.__edgeCompositePreviewInstalled) return false;

  const layers = findGlobalLineLayers(api.model);
  if (!layers.edgeMaterials.size && !layers.glowMaterials.size) return false;

  api.__edgeCompositePreviewInstalled = true;

  const state = {
    mode: 'opaque-precomposite',
    baseline: '1.5-preview5',
    edgeMaterials: layers.edgeMaterials,
    glowMaterials: layers.glowMaterials,
    edgeLines: layers.edgeLines,
    glowLines: layers.glowLines,
    edgeMix: DEFAULT_EDGE_MIX,
    glowMix: DEFAULT_GLOW_MIX,
    edgeColor: null,
    glowColor: null,
    original: {
      edgeColor: '#242424',
      edgeOpacity: BASE_EDGE_OPACITY,
      glowColor: '#b9e222',
      glowOpacity: 0.06,
      glowStrength: 0.3,
      glowEffectiveOpacity: BASE_GLOW_EFFECTIVE_OPACITY,
      glowBlending: 'AdditiveBlending'
    },
    set(edgeMix = state.edgeMix, glowMix = state.glowMix) {
      patchMaterials(
        state,
        clamp(Number(edgeMix), 0, 1),
        clamp(Number(glowMix), 0, 1)
      );
      return {
        edgeMix: state.edgeMix,
        glowMix: state.glowMix,
        edgeColor: state.edgeColor,
        glowColor: state.glowColor
      };
    }
  };

  const edgeMix = readMix('data-edge-composite-mix', DEFAULT_EDGE_MIX);
  const glowMix = readMix('data-glow-composite-mix', DEFAULT_GLOW_MIX);
  patchMaterials(state, edgeMix, glowMix);

  api.edgeComposite = state;
  api.version = '1.5-edge-composite-preview';

  if (root) {
    root.dataset.adamVersion = '1.5-edge-composite-preview';
    root.dataset.edgeCompositeMode = 'opaque-precomposite';
    root.dataset.edgeCompositeLines = String(state.edgeLines);
    root.dataset.glowCompositeLines = String(state.glowLines);
  }

  console.info('[ADAM edge composite preview] ready', {
    baseline: 'Preview 5 / working keyframes',
    edgeLines: state.edgeLines,
    glowLines: state.glowLines,
    edgeMaterials: state.edgeMaterials.size,
    glowMaterials: state.glowMaterials.size,
    edgeMix: state.edgeMix,
    glowMix: state.glowMix,
    edgeColor: state.edgeColor,
    glowColor: state.glowColor,
    stripsPreserved: true,
    meshAssignmentsChanged: false
  });

  return true;
}

if (!install(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);

  setTimeout(() => {
    clearInterval(timer);
    if (!window.__adamMasterplanV15Preview?.__edgeCompositePreviewInstalled) {
      console.error('[ADAM edge composite preview] install timed out');
    }
  }, 20000);
}
