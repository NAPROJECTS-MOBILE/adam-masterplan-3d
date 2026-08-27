/*
  ADAM Integrated Services — calibrator bootstrap V2
  --------------------------------------------------
  Isolated from the masterplan runtime. Reassembles the compressed uploaded GLB
  from GitHub-hosted text chunks, aligns the reconstructed Spline timeline to
  the exported GLB transforms, then boots the dedicated services calibrator.
*/

const MODEL_CHUNKS_BEFORE_04 = [
  './model-final-00.b64?v=services-model-final-v2',
  './model-v4-01.b64?v=services-model-final-v2',
  './model-v4-02.b64?v=services-model-final-v2',
  './model-v4-03a.b64?v=services-model-final-v2',
  './model-v4-03b.b64?v=services-model-final-v2'
];

const MODEL_CHUNK_04_FRAGMENTS = {
  head: './model-v4-04a.b64?v=services-model-final-v2',
  middle: './model-v4-04y.b64?v=services-model-final-v2',
  tail: './model-v4-04z.b64?v=services-model-final-v2'
};

const MODEL_CHUNKS_AFTER_04 = [
  './model-v4-05.b64?v=services-model-final-v2',
  './model-v4-06a.b64?v=services-model-final-v2',
  './model-v4-06b.b64?v=services-model-final-v2',
  './model-v4-07.b64?v=services-model-final-v2'
];

const EXPECTED_CHUNK_04_LENGTH = 15254;
const CHUNK_04_HEAD_LENGTH = 6000;
const EXPECTED_CHUNK_04_MIDDLE_LENGTH = 6000;
const EXPECTED_CHUNK_04_TAIL_LENGTH = 3254;
const EXPECTED_BASE64_LENGTH = 122028;
const nativeFetch = window.fetch.bind(window);
let cachedModelText = null;

async function fetchModelText(url) {
  const response = await nativeFetch(new URL(url, import.meta.url), { cache:'no-store' });
  if (!response.ok) throw new Error(`model chunk ${url} → HTTP ${response.status}`);
  return (await response.text()).replace(/\s+/g, '');
}

async function assembledChunk04() {
  const [headSource, middle, tail] = await Promise.all([
    fetchModelText(MODEL_CHUNK_04_FRAGMENTS.head),
    fetchModelText(MODEL_CHUNK_04_FRAGMENTS.middle),
    fetchModelText(MODEL_CHUNK_04_FRAGMENTS.tail)
  ]);

  if (headSource.length < CHUNK_04_HEAD_LENGTH) {
    throw new Error(`model chunk 04 head length ${headSource.length}; need at least ${CHUNK_04_HEAD_LENGTH}`);
  }
  if (middle.length !== EXPECTED_CHUNK_04_MIDDLE_LENGTH) {
    throw new Error(`model chunk 04 middle length ${middle.length}; expected ${EXPECTED_CHUNK_04_MIDDLE_LENGTH}`);
  }
  if (tail.length !== EXPECTED_CHUNK_04_TAIL_LENGTH) {
    throw new Error(`model chunk 04 tail length ${tail.length}; expected ${EXPECTED_CHUNK_04_TAIL_LENGTH}`);
  }

  // 04a was truncated during the GitHub write, but its first 6,000 chars are
  // intact. 04y is the verified 6,000–11,999 window and 04z is the verified
  // 12,000–15,253 tail. The remaining bytes in 04a overlap the start of 04y;
  // use that overlap as a continuity guard before accepting the reconstruction.
  const overlap = headSource.slice(CHUNK_04_HEAD_LENGTH);
  if (overlap && !middle.startsWith(overlap)) {
    throw new Error(`model chunk 04 overlap check failed (${overlap.length} chars)`);
  }

  const rebuilt = headSource.slice(0, CHUNK_04_HEAD_LENGTH) + middle + tail;
  if (rebuilt.length !== EXPECTED_CHUNK_04_LENGTH) {
    throw new Error(`model chunk 04 rebuilt length ${rebuilt.length}; expected ${EXPECTED_CHUNK_04_LENGTH}`);
  }
  return rebuilt;
}

async function assembledModelText() {
  if (cachedModelText) return cachedModelText;

  const [before, chunk04, after] = await Promise.all([
    Promise.all(MODEL_CHUNKS_BEFORE_04.map(fetchModelText)),
    assembledChunk04(),
    Promise.all(MODEL_CHUNKS_AFTER_04.map(fetchModelText))
  ]);

  const joined = [...before, chunk04, ...after].join('');
  if (joined.length !== EXPECTED_BASE64_LENGTH) {
    throw new Error(`model assembly length ${joined.length}; expected ${EXPECTED_BASE64_LENGTH}`);
  }
  cachedModelText = joined;
  return joined;
}

window.fetch = async function servicesModelFetch(input, init) {
  const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
  const absolute = new URL(requestUrl, location.href);
  if (absolute.pathname.endsWith('/integrated-services/model.glb.zst.b64')) {
    const text = await assembledModelText();
    return new Response(text, {
      status:200,
      headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}
    });
  }
  return nativeFetch(input, init);
};

function alignTimelineToGlb(timeline) {
  // The crane-stone source object was slightly re-based during Spline's GLB
  // export. Preserve the authored Spline movement delta, but add the export
  // offset so the scrubber starts from the GLB's actual local transform.
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
  await assembledModelText();
  const animationModule = await import('./animation-data.js');
  alignTimelineToGlb(animationModule.SPLINE_TIMELINE);
  await import('./runtime.js?v=services-runtime-core-v2-20260827');
} catch (error) {
  console.error('[ADAM integrated services bootstrap]', error);
  const status = document.getElementById('status');
  if (status) status.textContent = `ERROR: ${error.message}`;
}

// Keep the intercept installed: runtime.js can reload the model during debugging,
// and it only intercepts this one synthetic model URL.
