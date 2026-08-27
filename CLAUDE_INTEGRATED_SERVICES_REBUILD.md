# Claude Handoff — Integrated Services 3D Rebuild

## Mission

Stop repairing the current `/integrated-services/` rescue runtime. Rebuild the Integrated Services model using the **same proven process used for the existing working ADAM masterplan model in this repository**.

The user is correct: we have already solved this once. Treat the finished masterplan implementation as the architectural reference and reproduce that pipeline for the new Integrated Services Spline scene.

## Repository

`NAPROJECTS-MOBILE/adam-masterplan-3d`

Work on `main` unless you prefer a short-lived branch first.

## Most important instruction

**Do not use the Base64 / zstd / runtime-fetch-interception architecture created during the recent rescue attempts as the production solution.**

Those experiments proved that the recovered payload can sometimes parse, but they created repeated asset, byte-range, outline, WebGL and scene-fit problems. They are forensic material only.

The known-good masterplan instead hosts a real binary GLB directly.

## Known-good reference pipeline

Study these first:

- `README.md`
- `model/adam-masterplan.min.glb`
- `model/adam_landscape_in_use_fullerversion.glb`
- `model/adam_landscape_in_use_fullerversion_m2split.glb`
- `calibrate.html`
- `embed.html`
- `index.html`
- `calibrate/app-v2.js`
- `calibrate/config-m2split.js`
- `calibrate/responsive-keyframes.js`
- `calibrate/final-final-calibrator-sync.js`
- relevant motion/material/shadow/glow modules in `/calibrate/`

Important existing constraints from `README.md`:

1. Real GLB is hosted directly under `/model/`.
2. Preserve the binary model rather than reconstructing it in the browser.
3. Three.js is pinned to `0.160.0`.
4. Keep `MeshoptDecoder` where required.
5. No npm/bundler/build step is needed for the Webflow embed.
6. GitHub Pages / jsDelivr should serve the asset directly with normal CORS.

## New source

The new source is the user's **Integrated Services Spline scene**, referred to during the previous work as:

`adam_integrated_services_final.spline`

The active motion is **Spline Timeline 2**, approximately 6 seconds long.

If the original `.spline` source is not available in the repo, **ask the user for the original source file immediately**. Do not rebuild the production model from the fragmented `.b64` files unless you are only using them to understand naming or compare transforms.

## What was already reverse-engineered

Previous work decoded approximately **25 live object tracks** from Spline Timeline 2. The animation includes:

- walls growing / constructing
- roof and floor elements appearing
- crane rope movement
- crane stone movement
- crane travel
- sequential floor-line reveals

The important discovery was that much of the source animation is Spline **shape-size/property animation**, not normal glTF animation clips. Therefore the final Three.js runtime may need deterministic transforms driven by scroll/timeline progress, just like the successful masterplan runtime handles authored motion outside standard glTF clips.

Existing files under `/integrated-services/` such as `timeline-v2.js`, `animation-data.js`, and current runtime files may be useful as forensic references for timing and object names, but verify all mappings against the clean export.

## Current broken experiments — reference only

Do **not** build on these as the production architecture:

- `integrated-services-calibrate-v10.html` through `v15`
- `integrated-services-model-only-v16.html`
- browser-side Base64 chunk assembly
- zstd reconstruction in the page
- synthetic `window.fetch` interception for `model.glb.zst.b64`
- GLTFLoader byte-buffer monkey patches
- Object3D traversal monkey patches

Observed failures included:

- truncated model chunk 04
- incorrect relative model URL / 404
- valid GLB header but incorrect ArrayBuffer range handed to GLTFLoader
- recursive outline generation (`LineSegments2` being outlined repeatedly)
- `LineSegmentsGeometry` NaN / invalid vertex buffers
- WebGL `GL_INVALID_OPERATION: glDrawElements: Vertex buffer is not big enough`
- timeline mappings missing objects when using names alone
- unreliable scene auto-fitting / blank screen

These are exactly why this should now be rebuilt from the clean source using the proven masterplan pattern.

## Required rebuild process

### Phase 1 — reproduce the successful asset workflow

1. Inspect how the existing masterplan GLB was exported/optimised and loaded.
2. Export the Integrated Services Spline scene to a clean GLB using the equivalent process.
3. Keep the resulting GLB as a **normal binary file** under something like:

   `model/adam-integrated-services.glb`

4. Do not Base64-split it.
5. Do not zstd-wrap it for browser reconstruction.
6. Verify the raw GLB independently before integrating animation:
   - loads in a minimal Three.js viewer
   - geometry is intact
   - hierarchy/nodes are intact
   - materials are sane enough to inspect
   - bounds are finite
   - no WebGL errors

### Phase 2 — deterministic Timeline 2 reconstruction

1. Inspect Timeline 2 from the original Spline source.
2. Build an explicit map between Spline animated objects and the clean GLB nodes.
3. Prefer stable identifiers / verified node mapping rather than fragile display-name guessing.
4. Reproduce shape-size animation with Three.js transforms where glTF does not contain normal animation clips.
5. Preserve original authored timing/easing as closely as practical.
6. Confirm the sequence visually at:
   - 0%
   - 50%
   - 100%
   - then play continuously through the full ~6 seconds.

### Phase 3 — clone the successful calibrator architecture

Create a clean Integrated Services calibrator by copying the **working masterplan calibrator pattern**, not the rescue pages.

The Integrated Services calibrator needs three saved scroll frames:

- 0%
- 50%
- 100%

For desktop and mobile independently.

Each frame must store:

- camera azimuth
- camera elevation
- zoom
- pan X/Y/Z
- Timeline 2 progress / construction state

Also carry over the established visual baseline from the finished masterplan:

- background/base: `#f2f3f0`
- white architectural materials
- same edge/glow visual language
- same lighting philosophy
- exposure/shadow treatment consistent with the approved masterplan

Do **not** add edges/glow until the raw clean model and timeline are visibly correct.

### Phase 4 — production embed

Once calibrated:

1. produce the equivalent of the existing `embed.html` for Integrated Services
2. load the direct hosted GLB from GitHub Pages or pinned jsDelivr
3. connect model progress to the intended `.h-scroll` progress
4. keep desktop/mobile states independent where required
5. leave unrelated Webflow interactions untouched

## Acceptance gates

Do not call this finished until all of these pass:

### Gate A — raw asset

A standalone minimal page shows the complete Integrated Services model with no animation and no custom edge/glow effects.

- no blank screen
- no NaN geometry
- no WebGL buffer errors
- model clearly resembles the Spline source

### Gate B — animation

Timeline 2 reconstructed cleanly.

- 0%, 50%, 100% are correct
- walls/roof/floors/crane/rope/stone/floor-lines animate in the correct order
- no exploding transforms
- no disappearing unrelated meshes

### Gate C — calibrator

User can visibly calibrate 0/50/100 frames for desktop and mobile.

### Gate D — styling

Only after A–C pass, restore the masterplan visual treatment: material, shadows, edges and glow.

### Gate E — hosted production

Direct GLB URL loads reliably and production embed works on GitHub Pages/Webflow without browser-side model reconstruction hacks.

## Useful current facts

The recovered experimental GLB reported approximately 5.82 MB decompressed, but do not assume it is the correct production export.

The original experimental track list contained about 25 tracks. Existing `timeline-v2.js` should be reviewed for timings but not blindly trusted for node identities.

A previous model-inspection pass identified one giant near-white zero-height plane named approximately `Rectangle` (~75.13 × 0 × 33.40, colour near `#f4f5f4`) as a slab/blank field. Verify whether that plane is truly needed in this Integrated Services source before carrying it into production.

## First action Claude should take

Before editing anything:

1. inspect the working masterplan implementation and identify its actual asset/export/runtime path end-to-end
2. inspect the original Integrated Services `.spline` source
3. state the exact clean reproduction plan
4. then execute it

The goal is not to rescue the current experiment. The goal is to **repeat the already successful masterplan process for the Integrated Services scene**.
