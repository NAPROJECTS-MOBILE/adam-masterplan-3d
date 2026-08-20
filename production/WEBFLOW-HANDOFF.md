# ADAM Masterplan — Webflow test handoff

This is the current Webflow benchmark package for the ADAM masterplan Three.js replacement.

## What goes into Webflow

Add a Webflow **Code Embed** inside the existing `.h-scroll` section and paste the contents of:

`production/webflow-embed-v1.html`

The embed automatically finds the nearest `.h-scroll` element and uses its real 0–100% scroll progress.

## Files used by the embed

- Webflow paste block: `production/webflow-embed-v1.html`
- Production entry module: `production/adam-masterplan-v1.3.js`
- Production core renderer: `production/adam-masterplan-v1.js`
- Motion system: `calibrate/spline-motion.js`
- Glow target map: `calibrate/glow-targets.js`
- Current fidelity model: `model/adam_landscape_in_use_fullerversion.glb`

The current fidelity GLB is **1,310,432 bytes (~1.31 MB)**. This is intentionally the fuller model while the Webflow version is being validated visually and functionally. It is not yet the final asset-size optimisation pass.

The older `model/adam-masterplan.min.glb` is only **75,364 bytes (~75 KB)**, but it is an older stripped model and must not be substituted blindly because the current animation/mesh-path fixes depend on the fuller hierarchy.

## Webflow setup

1. Keep the existing wrapper class exactly `.h-scroll`.
2. Place the Code Embed inside the sticky visual scene within that `.h-scroll` section.
3. Paste `production/webflow-embed-v1.html` exactly once.
4. Do not add a second Three.js import map if the page already has one. Merge the `three` and `three/addons/` mappings into the existing import map instead.
5. Publish to the Webflow staging domain before measuring performance. Designer preview is not representative of production caching/network behaviour.

## What to benchmark

Compare the published Three.js page with the old Spline page using the same device/network profile.

Record:

- transferred bytes before the masterplan section is approached
- transferred bytes when the masterplan lazy-loads
- time until the model becomes visible
- Largest Contentful Paint (LCP)
- Total Blocking Time / Interaction to Next Paint
- main-thread CPU while the masterplan is onscreen
- mobile GPU smoothness during `.h-scroll`

Use Chrome DevTools Network with **Disable cache** for the cold-load comparison, then repeat with cache enabled for a return-visit comparison.

## Important production note

The current handoff is for an apples-to-apples Webflow performance test while preserving the working visual/motion hierarchy. If the 1.31 MB model is still too slow, the next step is to generate a new optimised GLB from the fuller source while preserving all required object names/hierarchy and then point the same renderer/embed at that asset. Do not replace the fuller model with the old 75 KB GLB without testing the animated targets.
