# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone browser-based 3D digital twin visualization for KMG oil & gas assets (pilot: Молдабек Восточный field). No build tools, no package manager, no dependencies to install — everything runs by opening HTML files in a browser or serving them with a static file server.

## Running

A static server is **required** — v2/v3 (and `_glb_viewer.html`) fetch `.glb` files over HTTP, which `file://` blocks with CORS. Only `первый_слайд_макет.html` (fully procedural, no GLB) opens directly.

```sh
python3 -m http.server 8080
# then open http://localhost:8080/  (index.html redirects to v3)
```

The `_glb_viewer.html` utility also posts to `/save?name=...` to write screenshots to disk.

## Publishing (GitHub Pages)

Repo settings → Pages → deploy from branch `main`, folder `/ (root)`. The site is static; no build step. Entry points:

- `index.html` — redirects to v3 (the Pages landing page)
- `.nojekyll` — present so Jekyll doesn't strip `_`-prefixed files (`_glb_viewer.html`, `_frames_ref_*.png`)

Cyrillic filenames are percent-encoded in URLs (see `index.html`'s redirect and `encodeURIComponent(...)` in the loaders).

## File versions

Three iterations of the main slide, each self-contained:

| File | Description |
|---|---|
| `первый_слайд_макет.html` | v1/prototype — all geometry procedural (Three.js primitives, no GLB) |
| `первый_слайд_v2.html` | v2 — loads one consolidated GLB (`модель_i23d.glb`) via `GLTFLoader.load()` |
| `первый_слайд_v3.html` | v3 (current) — loads per-layer GLBs directly via `GLTFLoader.load()`; adds sub-zone drill-down for the plast layer |

`_glb_viewer.html` — dev utility to inspect any `.glb` file; pass `?f=filename.glb` in the URL.

GLBs are loaded directly from the `.glb` files (v3 maps layer ids → filenames in `GLB_FILES`; v2 loads `модель_i23d.glb`). This is lighter on RAM than the earlier approach of inlining base64 payloads as JS globals — if you see references to `window.__GLB_B64` / `window.__GLB_LAYERS` or `модель_данные.js` / `слои_данные.js`, they are gone.

## Architecture

### Domain data (`ZONES` object)

All content lives in the `ZONES` constant at the top of each HTML's `<script type="module">`. Four zones, each with a fixed ID:

- `grr` — ЦД ресурсной базы (purple `#9B7BE8`, "контур 2027")
- `plast` — ЦД пласта (amber `#F0AE4A`; in v3, split into 3 sub-models: `plast1`/`plast2`/`plast3`)
- `skv` — ЦД скважины (blue `#8FBAF0`)
- `naz` — ЦД добычи и наземной инфраструктуры (teal `#35D0C2`)

`ORDER = ['naz','skv','plast','grr']` — top-to-bottom in the left-side list; bottom-to-top in the 3D scene.

### Interaction state machine

```js
state = { hover: zoneId | null, locked: zoneId | null }
active() = locked || hover
```

`refresh()` is the single function that syncs everything: zone `target` values (0 or 1), `.hot` class on list buttons, panel visibility, and autoRotate speed. Call it whenever `state` changes.

### Physical ↔ digital transition

Each zone has `mix` (0–1, smoothed toward `target` each frame) that drives:
- Physical meshes: `opacity = 1 - mix * 0.93` (fade out)
- Hologram parts (`fill`, `grid`, `edge`, `corners`): fade in with a `pulse = sin(t)` factor
- In v3: `wireMats` on GLB geometry also fade in as wireframe overlays

### 3D scene layout

The scene uses a vertical Y-band system. In the procedural макет version, bands are hardcoded constants. In v2/v3, bands are computed proportionally from the loaded GLB's bounding box height.

**макет** Y-bands (absolute values):
```
grrB:-150, grrT:-104   ← ГРР (foundation)
oilB/watB:-104 → -46   ← Пласт (oil + water layers)
midB:-46, soilB:-14    ← Скважина (overburden)
soilT:0                ← Наземка (surface)
```

### Color system (CSS variables)
```css
--cyan: #4FE3FF   --amber: #F0AE4A   --blue: #8FBAF0
--teal: #35D0C2   --viol:  #9B7BE8
--bg0:  #050810   --bg1:   #0C1626
--glass: rgba(10,18,32,.82)   --txt: #D7E2F2   --dim: #7C8DA6
```

### Debug hook

All versions expose `window.__dbg` with `{ renderer, scene, camera, state, zones, refresh, THREE, clockRef }` for console inspection.

## Key patterns to follow

- **Self-contained HTMLs**: CSS, JS, and DOM in one file. Don't split into separate files.
- **`refresh()` is the sync point**: never mutate visual state without calling it.
- **Zone colors come from `ZONES[id].color`**, not hardcoded at the call site.
- **Three.js is self-hosted in `vendor/`** (v0.160.0), loaded via importmap (`three` + `three/addons/`). No CDN at runtime — no SRI/supply-chain exposure. To upgrade, re-vendor `three.module.js`, `addons/controls/OrbitControls.js`, `addons/loaders/GLTFLoader.js`, and its dep `addons/utils/BufferGeometryUtils.js`.
- **Hologram materials** are always created with `blending: THREE.AdditiveBlending, depthWrite: false` to layer correctly over physical geometry.
