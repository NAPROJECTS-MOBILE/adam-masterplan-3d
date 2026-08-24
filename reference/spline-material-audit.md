# ADAM Spline material audit

Source-of-truth extracted from the two supplied `.spline` files. No mesh/material assignments were changed.

## Verification

- Shared material recipes identical across both files: **True**
- Mesh base assignments identical across both files: **True**
- Shared materials: **13**
- Meshes with base material assignments: **234**

## Base assignment counts

- `window`: 78
- `toon`: 71
- `window 2`: 25
- `inline`: 21
- `path`: 15
- `toon 2`: 7
- `toon wo`: 6
- `c toon`: 4
- `roof`: 3
- `villa borders`: 2
- `floor`: 1
- `toon 3`: 1

## Shared material layer recipes

- `toon` — `e6bc7808-7964-41fe-a627-d125ad7fb20d` — 3 layers: outline, light, toon
- `toon 2` — `a7379dc5-23fd-4eab-aac4-c13b25511a02` — 3 layers: outline, light, toon
- `toon 3` — `aeb09d2e-8304-4908-af99-afdedf1656b9` — 3 layers: outline, light, toon
- `window` — `b2fa0234-8c27-4235-a36e-37732cf4a150` — 2 layers: light, color
- `window 2` — `91705951-e377-4dee-9607-56cd3e0c393c` — 2 layers: light, color
- `c toon` — `04f8ad07-da72-4728-b683-0cd412aa16f5` — 3 layers: outline, light, toon
- `toon wo` — `0d8cae94-f0a2-4264-b572-deebb04c80d7` — 3 layers: outline, light, toon
- `roof` — `1c97c8ee-d04a-45b1-8c08-6f39b3dbd6a9` — 3 layers: outline, light, toon
- `path` — `fa0b7fa5-e6c0-4b9e-9b42-0256fb0880b6` — 3 layers: color, light, color
- `fact` — `0b37cf40-5751-46f7-b9f7-d11eda70d284` — 3 layers: outline, light, toon
- `villa borders` — `4ce8f4a8-d8ef-4f4d-8f61-a562ac623779` — 2 layers: light, color
- `floor` — `0dc39787-9303-485f-a71f-a0c31208a358` — 3 layers: outline, light, toon
- `Untitled Material` — `b3f7b2c1-b23f-49aa-bd1a-5f552595aa6d` — 4 layers: depth, color, light, color

## Baseline safety

The known-good Webflow Preview 5 baseline is frozen separately at `freeze/webflow-preview5-working-20260824` / `df81a76a14a6c456a5ee203f362be91103a07377`. Material experiments must not modify that branch.
