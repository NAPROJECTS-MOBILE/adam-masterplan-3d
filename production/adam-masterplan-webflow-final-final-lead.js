/*
  ADAM final-final website wrapper — predictive 95% scroll smoothing
  Loads the velocity-lead smoother first with a fresh module URL, then loads
  the current authoritative final-final website runtime. The smoother itself
  has a global single-instance guard, so the nested historical import cannot
  wrap the render loop twice.
*/

await import('./scroll-smoothing-95.js?v=velocity-lead-v2-20260826-1114');
await import('./adam-masterplan-webflow-final-final.js?v=velocity-lead-wrapper-20260826-1114');
await import('./material2-rectangle14-lock.js?v=rectangle14-m2-lock-v1-20260826-1325');
