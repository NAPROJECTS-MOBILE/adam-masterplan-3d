/*
  ADAM calibrator — Material 2 split model
  ----------------------------------------
  Claude's test GLB changes only the JSON chunk: it clones five existing
  materials, names those clones, and repoints mesh[4], mesh[6], mesh[7],
  mesh[8] and mesh[9]. The BIN chunk is unchanged.

  The GitHub connector cannot upload the supplied binary GLB directly, so this
  calibrator-only module reproduces that exact structural transform in-browser
  from the approved original GLB and exposes the result as a Blob URL.

  Production remains on the original model file.
*/

const SOURCE_MODEL_URL = new URL(
  '../model/adam_landscape_in_use_fullerversion.glb?v=e0f91b060228cbcc6fc323ccb763a907da7e5e88',
  import.meta.url
).href;

const SPLITS = [
  { meshIndex:4, name:'ADAM_M2_GRP2_RECT3_SMALL' },
  { meshIndex:6, name:'ADAM_M2_GRP2_ISLAND' },
  { meshIndex:7, name:'ADAM_M2_GRP2_RECT3_LARGE' },
  { meshIndex:8, name:'ADAM_M2_CL4_ISLAND_A' },
  { meshIndex:9, name:'ADAM_M2_CL4_ISLAND_B' }
];

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function fail(message) {
  throw new Error(`[ADAM M2 split model] ${message}`);
}

async function buildSplitModelUrl() {
  const response = await fetch(SOURCE_MODEL_URL, { cache:'no-store' });
  if (!response.ok) fail(`source model request failed (${response.status})`);

  const source = new Uint8Array(await response.arrayBuffer());
  if (source.byteLength < 20) fail('source GLB is too small');

  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (sourceView.getUint32(0, true) !== GLB_MAGIC) fail('source is not a GLB');
  if (sourceView.getUint32(4, true) !== 2) fail('source is not GLB v2');

  const sourceJsonLength = sourceView.getUint32(12, true);
  const sourceJsonType = sourceView.getUint32(16, true);
  if (sourceJsonType !== JSON_CHUNK) fail('first GLB chunk is not JSON');

  const sourceJsonStart = 20;
  const sourceJsonEnd = sourceJsonStart + sourceJsonLength;
  if (sourceJsonEnd > source.byteLength) fail('JSON chunk exceeds source length');

  const jsonText = new TextDecoder()
    .decode(source.subarray(sourceJsonStart, sourceJsonEnd))
    .replace(/[\u0000\x20]+$/g, '');
  const gltf = JSON.parse(jsonText);

  if (!Array.isArray(gltf.materials)) fail('source GLTF has no materials array');
  if (!Array.isArray(gltf.meshes)) fail('source GLTF has no meshes array');

  const created = [];

  for (const spec of SPLITS) {
    const mesh = gltf.meshes[spec.meshIndex];
    const primitives = mesh?.primitives;
    if (!Array.isArray(primitives) || !primitives.length) {
      fail(`mesh[${spec.meshIndex}] has no primitives`);
    }

    const sourceMaterialIndices = [...new Set(primitives.map(p => p.material))];
    if (sourceMaterialIndices.length !== 1 || sourceMaterialIndices[0] == null) {
      fail(`mesh[${spec.meshIndex}] does not have one shared source material`);
    }

    const sourceMaterialIndex = sourceMaterialIndices[0];
    const sourceMaterial = gltf.materials[sourceMaterialIndex];
    if (!sourceMaterial) fail(`material[${sourceMaterialIndex}] is missing`);

    const clone = JSON.parse(JSON.stringify(sourceMaterial));
    clone.name = spec.name;
    const newMaterialIndex = gltf.materials.length;
    gltf.materials.push(clone);
    for (const primitive of primitives) primitive.material = newMaterialIndex;

    created.push({
      meshIndex:spec.meshIndex,
      sourceMaterialIndex,
      materialIndex:newMaterialIndex,
      name:spec.name
    });
  }

  if (gltf.materials.length !== 47) {
    fail(`expected 47 materials after split, found ${gltf.materials.length}`);
  }

  const encodedJson = new TextEncoder().encode(JSON.stringify(gltf));
  const paddedJsonLength = (encodedJson.byteLength + 3) & ~3;
  const tail = source.subarray(sourceJsonEnd);
  const totalLength = 20 + paddedJsonLength + tail.byteLength;
  const output = new Uint8Array(totalLength);
  const outputView = new DataView(output.buffer);

  // Preserve original GLB header fields, then update total/chunk lengths.
  output.set(source.subarray(0, 12), 0);
  outputView.setUint32(8, totalLength, true);
  outputView.setUint32(12, paddedJsonLength, true);
  outputView.setUint32(16, JSON_CHUNK, true);
  output.set(encodedJson, 20);
  output.fill(0x20, 20 + encodedJson.byteLength, 20 + paddedJsonLength);
  output.set(tail, 20 + paddedJsonLength);

  const url = URL.createObjectURL(new Blob([output], { type:'model/gltf-binary' }));

  window.__ADAM_M2_SPLIT_MODEL = {
    sourceUrl:SOURCE_MODEL_URL,
    modelUrl:url,
    sourceBytes:source.byteLength,
    splitBytes:output.byteLength,
    materialCount:gltf.materials.length,
    created
  };

  console.info('[ADAM M2 split model] calibrator using split material model',
    window.__ADAM_M2_SPLIT_MODEL);

  return url;
}

export const M2_SPLIT_MODEL_URL = await buildSplitModelUrl();
