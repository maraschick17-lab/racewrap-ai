# RaceWrap AI engineering status

Last verified: 2026-11-11 21:54 (America/Chicago). Zero new spending. Render service: `srv-dbqgfa142hec73d2ejp0`, workspace `tea-dbpmpf59fdbs73fcqh10`. Live: https://racewrap-ai-studio.onrender.com

## Active app
- `index.html` loads **`studio-v3.js`** with a version query. `studio-v2.js` is historical; do not edit it expecting the live UI to change. Bump the script query/version when updating the active JS to avoid stale edge/browser caching.
- Browser-only static application; no paid API, no server-side processing, no checkout.
- Imports licensed SVG/PNG/JPG/WebP and PDF page 1 as rasterized concept background. Five Star MD3 is a **linked manufacturer reference only**, not bundled or licensed for commercial reuse.
- Drag and resize up to eight sponsor logos; SVG/PNG/JPG/WebP normalized to PNG in browser. Number and sponsor text are draggable.
- Trace one or more polygon artwork masks manually; patterns are clipped to these concept regions. **Not verified production panel cut paths.**
- Export concept SVG and editable JSON project, including all logos and polygon masks. Individual first-logo width now persists correctly even when another logo is selected at save time. Reference scale inputs are informational, not a verified print-scale export.
- Pattern composition now supports flowing ribbons and radial burst, plus manual direction (-75° to 75°), scale (50–180%) and opacity; on-device AI JSON output can set these controls, but a fresh AI model inference with the expanded JSON schema has not yet been tested.
- Browser-local IndexedDB autosave (after importing a template) and explicit Recover browser draft / Clear autosave actions. Storage is per browser/device and may be unavailable in private mode; downloadable JSON remains the portable backup.
- Optional real local AI: user explicitly clicks **Enable optional local AI**. On WebGPU browsers, WebLLM 0.2.88 loads `SmolLM2-360M-Instruct-q4f16_1-MLC` (or compatible fallback) and maps a prompt to style controls. The first download in testing was about **195 MB**. Rule-based fallback is clearly labeled when AI is unavailable. This is **text-to-style-control AI**, not AI image generation.

## Verification
- GitHub: `tests/browser-smoke.cjs` exercises template import, two logos, independent resizing, polygon masks, concept SVG export, JSON restore, rule-based generation, and zero page JS errors.
- Chrome headless on authorized test PC: existing smoke test **PASS** again after this update; separate `tests/browser-recovery.cjs` **PASS** at 390px, verifying two distinct logo sizes after autosave/reload/recovery, pattern angle/scale, SVG composition transform, no horizontal overflow, and zero page JS errors.
- WebGPU model was downloaded and **actual AI inference completed successfully** in Chrome headless: the app displayed `Local WebGPU AI design applied`. First load plus inference took approximately two minutes in that environment. This does not establish compatibility with iOS Safari or every GPU.
- Render deployment must be checked after every change; do not equate a GitHub commit with a verified live deployment.

## Next highest-value engineering work
1. Improve actual AI-generated visual composition beyond the present fixed pattern presets, while retaining the on-device/no-fee path.
2. Establish commercial reuse permission for a professionally drawn Five Star / Rocket template, or accept user-supplied licensed panel vectors; never substitute the rejected hand-drawn silhouette.
3. Add true per-panel geometry and measured 1:1 cut-file exports, bleed, safe zones, print shop validation. **Do not enable production checkout until verified.**
4. Test iPhone touch drag/drop and WebGPU support on real devices; provide graceful fallback.
5. Improve cross-device project transfer, autosave quota warnings, editable logo layer ordering, and direct touch interaction tests on real iPhone.

## Testing
Run `tests/browser-smoke.cjs` and `tests/browser-recovery.cjs` with Node.js, Playwright and Chrome/Chromium. Optional environment variables: `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `BASE_URL`. No paid test service required.
