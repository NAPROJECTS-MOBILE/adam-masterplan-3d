/*
  ADAM Material 2 runtime lock — cluster_2 / Group_5 rectangle block
  ------------------------------------------------------------------
  The visible block is a composite of Rectangle_12, Rectangle_13 and
  Rectangle_14. Rectangle_14 was already in the canonical Material 2 set, but
  Rectangle_12 / Rectangle_13 were not, so the block could still look unchanged.

  This production guard makes all three rectangle meshes match a confirmed
  Material 2 neighbour in the same Group_5 after all later styling passes.
*/

const TARGET_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/Rectangle_12',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/Rectangle_13',
  'Scene_1/Main_Group/clusters/cluster_2/Group_5/Rectangle_14'
];
const REFERENCE_PATH = 'Scene_1/Main_Group/clusters/cluster_2/Group_5/mesh_120_instance_2';

let installed = false;
let targets = [];
let reference = null;

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) if (node.name) parts.push(node.name);
  return parts.reverse().join('/');
}

function materialsOf(mesh) {
  if (!mesh?.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function ownTargetMaterials(mesh) {
  if (!mesh?.material || mesh.userData?.adamM2Group5Owned) return;
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map(material => material?.clone?.() || material)
    : (mesh.material.clone?.() || mesh.material);
  mesh.userData = { ...(mesh.userData || {}), adamM2Group5Owned:true };
}

function copyAppearance(source, destination) {
  if (!source || !destination) return;
  if (source.color && destination.color) destination.color.copy(source.color);
  if (source.emissive && destination.emissive) destination.emissive.copy(source.emissive);
  if ('emissiveIntensity' in source && 'emissiveIntensity' in destination) destination.emissiveIntensity = source.emissiveIntensity;
  if ('roughness' in source && 'roughness' in destination) destination.roughness = source.roughness;
  if ('metalness' in source && 'metalness' in destination) destination.metalness = source.metalness;
  destination.transparent = source.transparent;
  destination.opacity = source.opacity;
  destination.depthTest = source.depthTest;
  destination.depthWrite = source.depthWrite;
  destination.side = source.side;
  destination.toneMapped = source.toneMapped;
  destination.name = 'Object Material 2 — Group_5 rectangle lock';
  destination.userData = {
    ...(destination.userData || {}),
    adamObjectMaterial:2,
    adamMaterial2:true,
    adamMaterial2RuntimeLock:true
  };
  destination.needsUpdate = true;
}

function resolve(api) {
  if (!api?.model) return false;
  targets = [];
  reference = null;
  const wanted = new Set(TARGET_PATHS);

  api.model.traverse(object => {
    if (!object?.isMesh) return;
    const path = pathOf(object);
    if (wanted.has(path)) targets.push(object);
    if (path === REFERENCE_PATH) reference = object;
  });

  for (const target of targets) api.material2Meshes?.add?.(target);
  return targets.length > 0;
}

function applyFallback(material) {
  material.color?.set?.('#ebebeb');
  if (material.emissive && material.color) {
    material.emissive.copy(material.color);
    material.emissiveIntensity = 0.35;
  }
  if ('roughness' in material) material.roughness = 0.97;
  if ('metalness' in material) material.metalness = 0;
  material.transparent = true;
  material.opacity = 0.94;
  material.depthTest = true;
  material.depthWrite = true;
  material.userData = {
    ...(material.userData || {}),
    adamObjectMaterial:2,
    adamMaterial2:true,
    adamMaterial2RuntimeLock:true
  };
  material.needsUpdate = true;
}

function apply(api) {
  if (!targets.length && !resolve(api)) return false;
  if (!reference) resolve(api);

  const referenceMaterials = materialsOf(reference);

  for (const target of targets) {
    ownTargetMaterials(target);
    const targetMaterials = materialsOf(target);

    targetMaterials.forEach((material, index) => {
      const source = referenceMaterials[index] || referenceMaterials[0];
      if (source) copyAppearance(source, material);
      else applyFallback(material);
    });

    target.userData.adamObjectMaterial = 2;
    target.userData.adamObjectMaterialPath = pathOf(target);
  }

  return true;
}

function install(api) {
  if (installed || !api?.model) return false;
  if (!resolve(api)) return false;

  const hook = () => apply(api);
  window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
  window.__ADAM_BEFORE_RENDER_HOOKS.push(hook);
  hook();

  api.material2Group5RectangleLock = {
    targetPaths:TARGET_PATHS,
    referencePath:REFERENCE_PATH,
    apply:hook,
    get targets(){ return [...targets]; },
    get reference(){ return reference; }
  };

  installed = true;
  console.info('[ADAM Material 2] Group_5 rectangle block lock active', {
    targets:TARGET_PATHS,
    resolved:targets.map(pathOf),
    reference:REFERENCE_PATH
  });
  return true;
}

if (!install(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (install(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
