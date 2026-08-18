# Adam Masterplan 3D hosting test

Static test repository for the optimised `adam-masterplan.min.glb` used by the Webflow Three.js embed.

## Repository structure

```text
adam-masterplan-3d/
├── model/
│   └── adam-masterplan.min.glb
├── index.html
├── embed.html
└── README.md
```

## Files

- `model/adam-masterplan.min.glb` — source binary, preserved unchanged.
- `embed.html` — Webflow pasteable embed using the pinned jsDelivr URL.
- `index.html` — standalone scroll/lazy-load test page using the relative model path.

## Intended public URLs

- GitHub Pages: `https://naprojects-mobile.github.io/adam-masterplan-3d/`
- Pinned model CDN: `https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@v1.0.0/model/adam-masterplan.min.glb`

## Local test

Serve over HTTP, not `file://`:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Publish checklist

1. Create `NAPROJECTS-MOBILE/adam-masterplan-3d` as a **public** repository.
2. Push this repository's `main` branch.
3. Push the existing `v1.0.0` tag.
4. Enable GitHub Pages from the `main` branch root.
5. Verify the jsDelivr response:

```bash
curl -sI "https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@v1.0.0/model/adam-masterplan.min.glb" \
  | grep -iE "access-control-allow-origin|content-length|content-type"
```

Expected CORS: `access-control-allow-origin: *`.
Expected content length: `75364`.

## Webflow installation

1. In Webflow Designer, open the `#services` section and find `.h-scroll-scene`.
2. Delete both Spline elements: `.h-scroll-spline` and `.h-scroll-spline-mob`.
3. Add a **Code Embed** inside `.h-scroll-scene`.
4. Paste the contents of `embed.html`.
5. Publish to the staging domain and test there rather than relying on Designer preview.

The existing `.h-scroll-layer-1` through `.h-scroll-layer-4` interactions remain untouched.

## Important constraints

- Do not re-export, recompress, or otherwise modify the GLB.
- Keep `loader.setMeshoptDecoder(MeshoptDecoder)`.
- Keep Three.js pinned to `0.160.0`.
- Do not add OrbitControls, npm, a bundler, or a build step.
- If Webflow already contains an import map, merge these imports into the existing map rather than adding a second map.
