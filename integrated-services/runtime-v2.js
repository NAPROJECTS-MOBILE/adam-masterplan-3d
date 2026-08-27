/*
  ADAM Integrated Services — calibrator bootstrap V2
  --------------------------------------------------
  Isolated from the masterplan runtime. Reassembles the compressed uploaded GLB
  from GitHub-hosted text chunks, then boots the dedicated services calibrator.
*/

const MODEL_CHUNKS = [
  './model-final-00.b64?v=services-model-final-v1',
  './model-v4-01.b64?v=services-model-final-v1',
  './model-v4-02.b64?v=services-model-final-v1',
  './model-v4-03a.b64?v=services-model-final-v1',
  './model-v4-03b.b64?v=services-model-final-v1',
  './model-final-04.b64?v=services-model-final-v1',
  './model-v4-05.b64?v=services-model-final-v1',
  './model-v4-06a.b64?v=services-model-final-v1',
  './model-v4-06b.b64?v=services-model-final-v1',
  './model-v4-07.b64?v=services-model-final-v1'
];

const EXPECTED_BASE64_LENGTH = 122028;
const nativeFetch = window.fetch.bind(window);
let cachedModelText = null;

async function assembledModelText() {
  if (cachedModelText) return cachedModelText;
  const responses = await Promise.all(MODEL_CHUNKS.map(async url => {
    const response = await nativeFetch(new URL(url, import.meta.url), { cache:'no-store' });
    if (!response.ok) throw new Error(`model chunk ${url} → HTTP ${response.status}`);
    return (await response.text()).replace(/\s+/g, '');
  }));
  const joined = responses.join('');
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

try {
  await assembledModelText();
  await import('./runtime.js?v=services-runtime-core-v2-20260827');
} catch (error) {
  console.error('[ADAM integrated services bootstrap]', error);
  const status = document.getElementById('status');
  if (status) status.textContent = `ERROR: ${error.message}`;
}

// Keep the intercept installed: runtime.js can reload the model during debugging,
// and it only intercepts this one synthetic model URL.
