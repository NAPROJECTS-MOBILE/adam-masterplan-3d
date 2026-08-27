/*
  ADAM Integrated Services — calibrator bootstrap V2
  --------------------------------------------------
  Isolated from the masterplan runtime. Reassembles the compressed uploaded GLB,
  validates candidate recovery paths, falls back to the older complete v2 asset
  when necessary, aligns the reconstructed Spline timeline to exported GLB
  transforms, then boots the dedicated services calibrator.
*/

const MODEL_CHUNKS_BEFORE_04 = [
  './model-final-00.b64?v=services-model-final-v4',
  './model-v4-01.b64?v=services-model-final-v4',
  './model-v4-02.b64?v=services-model-final-v4',
  './model-v4-03a.b64?v=services-model-final-v4',
  './model-v4-03b.b64?v=services-model-final-v4'
];

const MODEL_CHUNK_04_HEADS = [
  { label:'04a head', url:'./model-v4-04a.b64?v=services-model-final-v4' },
  { label:'final-04 head', url:'./model-final-04.b64?v=services-model-final-v4' },
  { label:'v4-04 head', url:'./model-v4-04.b64?v=services-model-final-v4' }
];
const MODEL_CHUNK_04_MIDDLE = './model-v4-04y.b64?v=services-model-final-v4';
const MODEL_CHUNK_04_TAIL = './model-v4-04z.b64?v=services-model-final-v4';

const MODEL_CHUNKS_AFTER_04 = [
  './model-v4-05.b64?v=services-model-final-v4',
  './model-v4-06a.b64?v=services-model-final-v4',
  './model-v4-06b.b64?v=services-model-final-v4',
  './model-v4-07.b64?v=services-model-final-v4'
];

const MODEL_V2_CHUNKS = [
  './model-v2-00.b64?v=services-model-v2-fallback-v1',
  './model-v2-01.b64?v=services-model-v2-fallback-v1',
  './model-v2-02.b64?v=services-model-v2-fallback-v1',
  './model-v2-03.b64?v=services-model-v2-fallback-v1',
  './model-v2-04.b64?v=services-model-v2-fallback-v1',
  './model-v2-05.b64?v=services-model-v2-fallback-v1',
  './model-v2-06.b64?v=services-model-v2-fallback-v1',
  './model-v2-07.b64?v=services-model-v2-fallback-v1',
  './model-v2-08.b64?v=services-model-v2-fallback-v1',
  './model-v2-09.b64?v=services-model-v2-fallback-v1',
  './model-v2-10.b64?v=services-model-v2-fallback-v1'
];

const EXPECTED_CHUNK_04_LENGTH = 15254;
const CHUNK_04_HEAD_LENGTH = 6000;
const EXPECTED_CHUNK_04_MIDDLE_LENGTH = 6000;
const EXPECTED_CHUNK_04_TAIL_LENGTH = 3254;
const EXPECTED_V4_BASE64_LENGTH = 122028;
const nativeFetch = window.fetch.bind(window);
let cachedModelText = null;
let cachedModelInfo = null;

function setBootstrapStatus(text) {
  const status = document.getElementById('status');
  if (status) status.textContent = text;
  const overlay = document.getElementById('bootstrapStatusOverlay');
  if (overlay) overlay.textContent = text;
}

async function fetchModelText(url) {
  const response = await nativeFetch(new URL(url, import.meta.url), { cache:'no-store' });
  if (!response.ok) throw new Error(`model chunk ${url} → HTTP ${response.status}`);
  return (await response.text()).replace(/\s+/g, '');
}

function base64ToBytes(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function validateGlb(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12) {
    throw new Error(`GLB preflight: payload too small (${bytes?.byteLength || 0} bytes)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (magic !== 'glTF') throw new Error(`GLB preflight: bad magic ${JSON.stringify(magic)}`);
  if (version !== 2) throw new Error(`GLB preflight: unsupported version ${version}`);
  if (declaredLength !== bytes.byteLength) {
    throw new Error(`GLB preflight: declared ${declaredLength} bytes; decoded ${bytes.byteLength}`);
  }
  return { version, bytes: bytes.byteLength };
}

async function preflightModel(text, label='candidate') {
  setBootstrapStatus(`testing ${label} · validating compressed payload…`);
  if (!window.fzstd?.decompress) throw new Error('GLB preflight: fzstd decompressor missing');
  let packed;
  try {
    packed = base64ToBytes(text);
  } catch (error) {
    throw new Error(`GLB preflight: invalid Base64 (${error.message})`);
  }
  let unpacked;
  try {
    unpacked = window.fzstd.decompress(packed);
  } catch (error) {
    throw new Error(`GLB preflight: zstd decompression failed (${error.message})`);
  }
  return validateGlb(unpacked);
}

async function tryV4Recovery() {
  const [before, middle, tail, after, heads] = await Promise.all([
    Promise.all(MODEL_CHUNKS_BEFORE_04.map(fetchModelText)),
    fetchModelText(MODEL_CHUNK_04_MIDDLE),
    fetchModelText(MODEL_CHUNK_04_TAIL),
    Promise.all(MODEL_CHUNKS_AFTER_04.map(fetchModelText)),
    Promise.all(MODEL_CHUNK_04_HEADS.map(async source => ({
      ...source,
      text: await fetchModelText(source.url)
    })))
  ]);

  if (middle.length !== EXPECTED_CHUNK_04_MIDDLE_LENGTH) {
    throw new Error(`model chunk 04 middle length ${middle.length}; expected ${EXPECTED_CHUNK_04_MIDDLE_LENGTH}`);
  }
  if (tail.length !== EXPECTED_CHUNK_04_TAIL_LENGTH) {
    throw new Error(`model chunk 04 tail length ${tail.length}; expected ${EXPECTED_CHUNK_04_TAIL_LENGTH}`);
  }

  const failures = [];
  for (const source of heads) {
    if (source.text.length < CHUNK_04_HEAD_LENGTH) {
      failures.push(`${source.label}: only ${source.text.length} head chars`);
      continue;
    }

    const chunk04 = source.text.slice(0, CHUNK_04_HEAD_LENGTH) + middle + tail;
    if (chunk04.length !== EXPECTED_CHUNK_04_LENGTH) {
      failures.push(`${source.label}: rebuilt 04 length ${chunk04.length}`);
      continue;
    }

    const joined = [...before, chunk04, ...after].join('');
    if (joined.length !== EXPECTED_V4_BASE64_LENGTH) {
      failures.push(`${source.label}: full assembly length ${joined.length}`);
      continue;
    }

    try {
      const info = await preflightModel(joined, `v4 · ${source.label}`);
      return { text:joined, info:{ ...info, source:`v4 · ${source.label}` } };
    } catch (error) {
      console.warn(`[ADAM integrated services bootstrap] ${source.label} rejected`, error);
      failures.push(`${source.label}: ${error.message}`);
    }
  }

  throw new Error(failures.join(' · '));
}

async function tryV2Fallback() {
  setBootstrapStatus('v4 recovery rejected · testing complete v2 asset…');
  const chunks = await Promise.all(MODEL_V2_CHUNKS.map(fetchModelText));
  const joined = chunks.join('');
  if (!joined.length) throw new Error('v2 fallback assembled empty payload');
  const info = await preflightModel(joined, `v2 fallback · ${joined.length.toLocaleString()} Base64 chars`);
  return { text:joined, info:{ ...info, source:'complete v2 fallback', base64Chars:joined.length } };
}

async function assembledModelText() {
  if (cachedModelText) return cachedModelText;

  const failures = [];
  try {
    const result = await tryV4Recovery();
    cachedModelText = result.text;
    cachedModelInfo = result.info;
  } catch (error) {
    failures.push(`v4: ${error.message}`);
    console.warn('[ADAM integrated services bootstrap] v4 recovery failed', error);
  }

  if (!cachedModelText) {
    try {
      const result = await tryV2Fallback();
      cachedModelText = result.text;
      cachedModelInfo = result.info;
    } catch (error) {
      failures.push(`v2: ${error.message}`);
      console.warn('[ADAM integrated services bootstrap] v2 fallback failed', error);
    }
  }

  if (!cachedModelText) {
    throw new Error(`no valid stored GLB payload · ${failures.join(' || ')}`);
  }

  console.info('[ADAM integrated services bootstrap] model selected', cachedModelInfo);
  setBootstrapStatus(`model verified via ${cachedModelInfo.source} · GLB v${cachedModelInfo.version} · ${cachedModelInfo.bytes.toLocaleString()} bytes · booting Three.js…`);
  return cachedModelText;
}

window.fetch = async function servicesModelFetch(input, init) {
  const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
  const absolute = new URL(requestUrl, location.href);
  if (absolute.pathname.endsWith('/model.glb.zst.b64')) {
    const text = await assembledModelText();
    return new Response(text, {
      status:200,
      headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}
    });
  }
  return nativeFetch(input, init);
};

function alignTimelineToGlb(timeline) {
  const stone = timeline.tracks?.find(track => track.name === 'crane stone');
  if (!stone || stone.__glbAligned) return;

  const exportedBase = {
    x:-1.4645709121316473,
    y:-183.5963749524338,
    z:-5.002651657923422
  };
  const sourceBase = {
    x:Number(stone.base?.position?.[0] || 0),
    y:Number(stone.base?.position?.[1] || 0),
    z:Number(stone.base?.position?.[2] || 0)
  };
  const offset = {
    x:exportedBase.x-sourceBase.x,
    y:exportedBase.y-sourceBase.y,
    z:exportedBase.z-sourceBase.z
  };

  for (const prop of stone.properties || []) {
    if (prop.path !== 'position.value') continue;
    for (const keyframe of prop.keyframes || []) {
      if (!keyframe.value || typeof keyframe.value !== 'object') continue;
      if (Number.isFinite(keyframe.value.x)) keyframe.value.x += offset.x;
      if (Number.isFinite(keyframe.value.y)) keyframe.value.y += offset.y;
      if (Number.isFinite(keyframe.value.z)) keyframe.value.z += offset.z;
    }
  }
  stone.base.position = [exportedBase.x, exportedBase.y, exportedBase.z];
  stone.__glbAligned = true;
}

try {
  setBootstrapStatus('assembling integrated-services model…');
  await assembledModelText();
  const animationModule = await import('./animation-data.js');
  alignTimelineToGlb(animationModule.SPLINE_TIMELINE);
  await import('./runtime.js?v=services-runtime-core-v3-20260827');
  const overlay = document.getElementById('bootstrapStatusOverlay');
  if (overlay) overlay.remove();
} catch (error) {
  console.error('[ADAM integrated services bootstrap]', error);
  setBootstrapStatus(`ERROR: ${error.message}`);
}

window.__ADAM_SERVICES_MODEL_BOOTSTRAP = {
  get info(){ return cachedModelInfo; }
};
