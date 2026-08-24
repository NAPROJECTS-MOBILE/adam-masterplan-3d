import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  ADAM MASTERPLAN — SPLINE MATERIAL TRANSFER PREVIEW
  -------------------------------------------------
  MATERIAL EXPERIMENT ONLY.

  Baseline:
  - imports the exact working Preview 5 runtime/keyframes
  - preserves Preview 5 section-entry scroll mapping
  - preserves the proven strip glow module
  - preserves the split GLB and its existing mesh -> material assignments

  Material strategy:
  - capture the pristine split-GLB materials before Preview 5 styles them
  - resolve each draw mesh to its exact glTF material slot through
    GLTFParser.associations + parser.json (no path/name guessing)
  - only touch slots that the Spline -> GLB dry-run resolved with high confidence
  - never reassign a mesh from one glTF material slot to another
  - reassert the captured source material values immediately before each draw,
    after Preview 5 / Material 2 callbacks have run

  This first transfer preview deliberately does NOT approximate unresolved
  Spline materials (toon 2, roof, floor) and does not flatten inline recipes.
*/

const BASELINE_RUNTIME = './adam-masterplan-v1.5-preview5.js?v=43716e4ee7d36ef0173f4f6632f8e20512455b3f';

// High-confidence mapping from reference/spline-glb-material-map-dry-run.json.
// Slots 42-46 remain separate: we copy appearance only, never assignment.
const SLOT_TO_SPLINE = new Map([
  [2,  'toon'],
  [3,  'window'],
  [5,  'window 2'],
  [9,  'villa borders'],
  [24, 'toon wo'],
  [25, 'c toon'],
  [31, 'path'],
  [42, 'window'],
  [43, 'window'],
  [44, 'toon 3'],
  [45, 'window 2'],
  [46, 'window 2']
]);

// Exact source-layer values extracted from the supplied .spline files.
// These are retained as source-of-truth metadata for the next shader-fidelity
// pass. The safe visual pass below restores the pristine exported PBR material
// and only pins exact source base colours where the Spline recipe has a single
// visible colour layer.
const SPLINE_RECIPES = {
  'toon': {
    id:'e6bc7808-7964-41fe-a627-d125ad7fb20d',
    kind:'toon',
    outline:{ visible:true, color:[0.7215686274509804,0.7019607843137254,0.7333333333333333], alpha:1, width:0.01 },
    light:{ type:'phong', alpha:0.25, shininess:5, specular:[0.5807535388249557,0.5822732300884956,0.5808690353609848] },
    ramp:[
      [0.9098039215686274,0.9176470588235294,0.9058823529411765],
      [0.9019607843137255,0.9019607843137255,0.9019607843137255],
      [0.8963326759708736,0.8963326759708736,0.8963326759708736],
      [0.9440735505188437,0.9615943030973452,0.9405694000031434]
    ],
    steps:[0,0.475,0.525,1],
    worldSource:[0,1000,0]
  },
  'toon 3': {
    id:'aeb09d2e-8304-4908-af99-afdedf1656b9',
    kind:'toon',
    outline:{ visible:true, color:[0.6099628337378641,0.609546445274299,0.609546445274299], alpha:1, width:0.01 },
    light:{ type:'phong', alpha:0.26, shininess:5, specular:[0.2,0.2,0.2] },
    ramp:[
      [0.7409084623893805,0.7409084623893805,0.7409084623893805],
      [0.7396121404867257,0.7396121404867257,0.7396121404867257],
      [0.8963326759708736,0.8963326759708736,0.8963326759708736],
      [0.8235294117647058,0.8392156862745098,0.8235294117647058]
    ],
    steps:[0,0.475,0.525,1],
    worldSource:[0,1000,0]
  },
  'c toon': {
    id:'04f8ad07-da72-4728-b683-0cd412aa16f5',
    kind:'toon',
    outline:{ visible:false, color:[0.6099628337378641,0.609546445274299,0.609546445274299], alpha:1, width:1.4 },
    light:{ type:'phong', alpha:0.26, shininess:5, specular:[0.2,0.2,0.2] },
    ramp:[
      [0.788235294117647,0.788235294117647,0.788235294117647],
      [0.788235294117647,0.788235294117647,0.788235294117647],
      [0.8963326759708736,0.8963326759708736,0.8963326759708736],
      [0.7879563053097346,0.7870438144279635,0.7870438144279635]
    ],
    steps:[0,0.475,0.525,1],
    worldSource:[0,1000,0]
  },
  'toon wo': {
    id:'0d8cae94-f0a2-4264-b572-deebb04c80d7',
    kind:'toon',
    outline:{ visible:false, color:[0.6099628337378641,0.609546445274299,0.609546445274299], alpha:1, width:0.01 },
    light:{ type:'phong', alpha:0.26, shininess:5, specular:[0.2,0.2,0.2] },
    ramp:[
      [0.7409084623893805,0.7409084623893805,0.7409084623893805],
      [0.7396121404867257,0.7396121404867257,0.7396121404867257],
      [0.8963326759708736,0.8963326759708736,0.8963326759708736],
      [0.8235294117647058,0.8392156862745098,0.8235294117647058]
    ],
    steps:[0,0.475,0.525,1],
    worldSource:[0,1000,0]
  },
  'window': {
    id:'b2fa0234-8c27-4235-a36e-37732cf4a150',
    kind:'color', base:[0.8564193860619469,0.8564193860619469,0.8564193860619469],
    light:{ type:'phong', alpha:0.6, shininess:5, specular:[0.2,0.2,0.2] }
  },
  'window 2': {
    id:'91705951-e377-4dee-9607-56cd3e0c393c',
    kind:'color', base:[0.838720271017699,0.838720271017699,0.838720271017699],
    light:{ type:'phong', alpha:0.6, shininess:5, specular:[0.2,0.2,0.2] }
  },
  'villa borders': {
    id:'4ce8f4a8-d8ef-4f4d-8f61-a562ac623779',
    kind:'color', base:[0.8416931692477876,0.8416931692477876,0.8416931692477876],
    light:{ type:'phong', alpha:0.44, shininess:5, specular:[0.2,0.2,0.2] }
  },
  'path': {
    id:'fa0b7fa5-e6c0-4b9e-9b42-0256fb0880b6',
    kind:'color', base:[0.6959520188053097,0.6959520188053097,0.6959520188053097],
    hiddenColor:[0.9204576880530974,0.10404786504195315,0.34897081194529694],
    light:{ type:'phong', alpha:0.6, shininess:5, specular:[0.2,0.2,0.2] }
  }
};

const captured = [];
let capturedScene = null;
let parserMaterialHits = 0;

function materialArray(material) {
  return Array.isArray(material) ? material : material ? [material] : [];
}

function snapshotMaterial(material) {
  if (!material) return null;
  return {
    name:material.name || '',
    color:material.color?.clone?.() || null,
    emissive:material.emissive?.clone?.() || null,
    emissiveIntensity:'emissiveIntensity' in material ? material.emissiveIntensity : null,
    roughness:'roughness' in material ? material.roughness : null,
    metalness:'metalness' in material ? material.metalness : null,
    opacity:'opacity' in material ? material.opacity : 1,
    map:'map' in material ? material.map : null,
    alphaMap:'alphaMap' in material ? material.alphaMap : null,
    normalMap:'normalMap' in material ? material.normalMap : null,
    roughnessMap:'roughnessMap' in material ? material.roughnessMap : null,
    metalnessMap:'metalnessMap' in material ? material.metalnessMap : null,
    aoMap:'aoMap' in material ? material.aoMap : null,
    vertexColors:'vertexColors' in material ? material.vertexColors : null,
    alphaTest:'alphaTest' in material ? material.alphaTest : 0,
    side:'side' in material ? material.side : THREE.FrontSide
  };
}

function primitiveMaterialSlot(parser, mesh) {
  const association = parser?.associations?.get?.(mesh);
  const meshIndex = association?.meshes;
  const primitiveIndex = association?.primitives ?? 0;
  if (!Number.isInteger(meshIndex)) return null;
  const primitive = parser?.json?.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  return Number.isInteger(primitive?.material) ? primitive.material : null;
}

function capturePristineMaterials(gltf) {
  captured.length = 0;
  capturedScene = gltf?.scene || null;
  parserMaterialHits = 0;
  const parser = gltf?.parser;

  capturedScene?.traverse?.(mesh => {
    if (!mesh?.isMesh || !mesh.material) return;
    const slot = primitiveMaterialSlot(parser, mesh);
    if (!SLOT_TO_SPLINE.has(slot)) return;

    const mats = materialArray(mesh.material);
    // glTFLoader normally creates one draw mesh per primitive. Keep all current
    // material snapshots so this remains safe if an array-material mesh appears.
    const snapshots = mats.map(snapshotMaterial);
    captured.push({
      mesh,
      slot,
      splineName:SLOT_TO_SPLINE.get(slot),
      snapshots
    });
    parserMaterialHits++;
  });

  console.info('[ADAM Spline materials] pristine capture', {
    targetedDrawMeshes:captured.length,
    parserMaterialHits,
    slots:[...new Set(captured.map(entry => entry.slot))].sort((a,b) => a-b)
  });
}

// Capture before Preview 5 / Preview 1 applies the white global face treatment.
// Preview 5's path-ribbon loader wrapper will wrap this function; both see the
// same pristine loaded scene. We restore GLTFLoader after Preview 5 finishes.
const baseLoadAsync = GLTFLoader.prototype.loadAsync;
async function adamSplineMaterialCapture(...args) {
  const gltf = await baseLoadAsync.apply(this, args);
  capturePristineMaterials(gltf);
  return gltf;
}
GLTFLoader.prototype.loadAsync = adamSplineMaterialCapture;

await import(BASELINE_RUNTIME);

// The path-ribbon wrapper intentionally restores to the function it wrapped,
// which in this build is our temporary capture function. Return the prototype to
// the real baseline loader now that the single model load has completed.
if (GLTFLoader.prototype.loadAsync === adamSplineMaterialCapture) {
  GLTFLoader.prototype.loadAsync = baseLoadAsync;
}

function setSplineSrgb(color, rgb) {
  if (!color || !rgb) return;
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

function applySnapshot(material, snapshot, recipe) {
  if (!material || !snapshot) return;

  // The GLB is itself an export from the Spline source. Restoring its pristine
  // material is the safest first fidelity pass because it preserves the exact
  // exporter choices rather than inventing new roughness/metalness values.
  if (material.color && snapshot.color) material.color.copy(snapshot.color);
  if (material.emissive && snapshot.emissive) material.emissive.copy(snapshot.emissive);
  if (snapshot.emissiveIntensity != null && 'emissiveIntensity' in material) {
    material.emissiveIntensity = snapshot.emissiveIntensity;
  }
  if (snapshot.roughness != null && 'roughness' in material) material.roughness = snapshot.roughness;
  if (snapshot.metalness != null && 'metalness' in material) material.metalness = snapshot.metalness;

  // Preview 5 makes generic faces 0.94 opacity. Source material opacity is more
  // authoritative, but we intentionally leave the material's transparent flag
  // alone so render-list classification cannot jump between passes.
  if ('opacity' in material) material.opacity = snapshot.opacity;

  // Pin exact single-colour Spline layers where the source material has one.
  // Toon materials retain the GLB exporter's own flattened colour in this safe
  // pass; their full ramp is exposed in SPLINE_RECIPES for the next shader pass.
  if (recipe?.base && material.color) setSplineSrgb(material.color, recipe.base);

  // Restore texture/vertex-colour state only if Preview 5 changed it. These
  // assignments are compile-affecting, so only flag needsUpdate on a difference.
  let compileChanged = false;
  for (const key of ['map','alphaMap','normalMap','roughnessMap','metalnessMap','aoMap']) {
    if (!(key in material)) continue;
    if (material[key] !== snapshot[key]) {
      material[key] = snapshot[key];
      compileChanged = true;
    }
  }
  if ('vertexColors' in material && snapshot.vertexColors != null && material.vertexColors !== snapshot.vertexColors) {
    material.vertexColors = snapshot.vertexColors;
    compileChanged = true;
  }
  if ('alphaTest' in material && material.alphaTest !== snapshot.alphaTest) {
    material.alphaTest = snapshot.alphaTest;
    compileChanged = true;
  }
  if ('side' in material && material.side !== snapshot.side) {
    material.side = snapshot.side;
    compileChanged = true;
  }
  if (compileChanged) material.needsUpdate = true;
}

function applyEntryToCurrentMaterials(entry) {
  const mats = materialArray(entry.mesh.material);
  const recipe = SPLINE_RECIPES[entry.splineName];
  for (let i = 0; i < mats.length; i++) {
    applySnapshot(mats[i], entry.snapshots[i] || entry.snapshots[0], recipe);
  }
}

function installTransfer(api) {
  if (!api?.model || api.__splineMaterialTransferInstalled) return false;
  api.__splineMaterialTransferInstalled = true;

  let installed = 0;
  const byRecipe = {};
  const bySlot = {};

  for (const entry of captured) {
    const mesh = entry.mesh;
    if (!mesh?.isMesh || !mesh.parent) continue;

    // Apply once immediately, then chain AFTER the existing Preview 5 /
    // Material 2 onBeforeRender callback so Spline source values are the final
    // write immediately before the draw call.
    applyEntryToCurrentMaterials(entry);
    const previous = mesh.onBeforeRender;
    mesh.onBeforeRender = function adamSplineMaterialFinalWrite(renderer, scene, camera, geometry, renderMaterial, group) {
      previous?.call(this, renderer, scene, camera, geometry, renderMaterial, group);

      const recipe = SPLINE_RECIPES[entry.splineName];
      const index = Number.isInteger(group?.materialIndex) ? group.materialIndex : 0;
      const snapshot = entry.snapshots[index] || entry.snapshots[0];

      // Mutate the actual material selected in the render list as well as the
      // mesh's current material if a previous callback swapped material refs.
      applySnapshot(renderMaterial, snapshot, recipe);
      const current = materialArray(this.material);
      if (current[index] && current[index] !== renderMaterial) {
        applySnapshot(current[index], snapshot, recipe);
      }
    };

    mesh.userData.adamSplineMaterialSlot = entry.slot;
    mesh.userData.adamSplineMaterialName = entry.splineName;
    installed++;
    byRecipe[entry.splineName] = (byRecipe[entry.splineName] || 0) + 1;
    bySlot[entry.slot] = (bySlot[entry.slot] || 0) + 1;
  }

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) {
    root.dataset.adamVersion = '1.5-materials-preview';
    root.dataset.splineMaterialMeshes = String(installed);
    root.dataset.splineMaterialSlots = String(Object.keys(bySlot).length);
  }

  api.version = '1.5-materials-preview';
  api.splineMaterialTransfer = {
    baselineRuntime:'1.5-preview5',
    baselineKeyframes:api.desktopKeyframes,
    baselineMobileKeyframes:api.mobileKeyframes,
    recipes:SPLINE_RECIPES,
    slotMap:Object.fromEntries(SLOT_TO_SPLINE),
    captured,
    installed,
    byRecipe,
    bySlot,
    reapply() {
      for (const entry of captured) applyEntryToCurrentMaterials(entry);
    }
  };

  console.info('[ADAM Spline materials] transfer installed', {
    baseline:'Preview 5 / working keyframes',
    installed,
    byRecipe,
    bySlot,
    unresolvedIntentionallyUntouched:['toon 2','roof','floor','inline recipes']
  });
  return true;
}

if (!installTransfer(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (installTransfer(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
