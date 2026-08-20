/* ADAM calibrator — RGB colour entry helpers
   Keeps the native colour picker, but exposes editable R/G/B numeric channels
   for every scene colour including the newly exposed background colour. */

const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

function hexToRgb(hex) {
  const value = String(hex || '#000000').replace('#','');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value.padEnd(6,'0').slice(0,6);
  return {
    r: parseInt(full.slice(0,2),16) || 0,
    g: parseInt(full.slice(2,4),16) || 0,
    b: parseInt(full.slice(4,6),16) || 0
  };
}

function rgbToHex(r,g,b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return '#' + [clamp(r),clamp(g),clamp(b)].map(v => v.toString(16).padStart(2,'0')).join('');
}

function installRGB(wrap) {
  if (!wrap || wrap.dataset.rgbInstalled) return;
  const picker = wrap.querySelector('input[type="color"]');
  if (!picker) return;
  wrap.dataset.rgbInstalled = '1';

  const rgb = document.createElement('div');
  rgb.className = 'rgb-fields';
  rgb.innerHTML = `
    <label><span>R</span><input type="number" min="0" max="255" step="1" inputmode="numeric"></label>
    <label><span>G</span><input type="number" min="0" max="255" step="1" inputmode="numeric"></label>
    <label><span>B</span><input type="number" min="0" max="255" step="1" inputmode="numeric"></label>
  `;
  wrap.appendChild(rgb);

  const fields = [...rgb.querySelectorAll('input')];
  const syncFromPicker = () => {
    const c = hexToRgb(picker.value);
    fields[0].value = c.r;
    fields[1].value = c.g;
    fields[2].value = c.b;
    rgb.dataset.value = `rgb(${c.r}, ${c.g}, ${c.b})`;
  };
  const syncToPicker = () => {
    picker.value = rgbToHex(fields[0].value, fields[1].value, fields[2].value);
    picker.dispatchEvent(new Event('input', { bubbles:true }));
    syncFromPicker();
  };

  fields.forEach(input => {
    input.addEventListener('input', syncToPicker);
    input.addEventListener('change', syncToPicker);
  });
  picker.addEventListener('input', () => requestAnimationFrame(syncFromPicker));

  const observer = new MutationObserver(syncFromPicker);
  observer.observe(picker, { attributes:true, attributeFilter:['value'] });

  // app-v2 updates .value properties directly during preset/reset changes,
  // which MutationObserver cannot see. A lightweight polling sync keeps the
  // numbers accurate without touching the renderer.
  let last = '';
  const poll = () => {
    if (!wrap.isConnected) return;
    if (picker.value !== last) { last = picker.value; syncFromPicker(); }
    requestAnimationFrame(poll);
  };

  syncFromPicker();
  poll();
}

async function install() {
  while (!document.querySelector('.ctl.color input[type="color"]')) await waitFrame();

  const style = document.createElement('style');
  style.textContent = `
    .ctl.color{display:grid!important;grid-template-columns:minmax(0,1fr) 44px;align-items:center;gap:6px 8px}
    .ctl.color>label{grid-column:1;margin:0}
    .ctl.color>input[type=color]{grid-column:2;grid-row:1}
    .rgb-fields{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
    .rgb-fields label{display:grid!important;grid-template-columns:18px 1fr;align-items:center;gap:4px;margin:0!important;color:var(--dim);font-size:10px}
    .rgb-fields input{width:100%;min-width:0;background:#111;color:var(--text);border:1px solid var(--line);border-radius:3px;padding:5px 4px;font:inherit;font-size:10px;text-align:right}
    .rgb-fields input:focus{outline:1px solid var(--accent);border-color:var(--accent)}
    .rgb-fields:after{content:attr(data-value);grid-column:1/-1;color:#666;font-size:9px;margin-top:-1px}
  `;
  document.head.appendChild(style);

  const addAll = () => document.querySelectorAll('.ctl.color').forEach(installRGB);
  addAll();
  new MutationObserver(addAll).observe(document.getElementById('panel'), { childList:true, subtree:true });
}

install();
