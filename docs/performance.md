# Performance audit and verification

The boundary for this work is the existing appearance, resolution, animation
timings, content, routes, scrolling, and interactions. No quality presets are
lowered to manufacture a speed improvement.

## Measured before and after

Measured on 2026-10-16 against the original production build at commit
`3a9f7f5`, using Chromium 149.0.7827.55. These are medians of three runs per
device. The browser uses SwiftShader software rendering; timing figures are
local comparisons, not hardware-GPU or field performance claims.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Desktop resources downloaded through project preview | 3,402,478 B | 1,087,260 B | 68.0% |
| Mobile resources downloaded through project preview | 3,372,801 B | 1,057,545 B | 68.6% |
| Desktop main-thread task time after pointer exit | 124.39 ms/s | 58.48 ms/s | 53.0% |
| Desktop animation callbacks after pointer exit | 257.69/s | 0.00/s | 100.0% |
| Cursor pixels cleared after pointer exit | 445.29 million/s | 0.00 million/s | 100.0% |
| Mobile cumulative long tasks through project preview | 18 | 9 | 50.0% |
| Mobile cumulative long-task duration | 8,230 ms | 6,340 ms | 23.0% |
| Desktop project preview readiness | 6,869 ms | 6,286 ms | 8.5% |
| Mobile project preview readiness | 5,838 ms | 5,586 ms | 4.3% |
| Desktop post-GC JavaScript heap at preview | 10.21 MiB | 10.15 MiB | 0.6% |
| Mobile post-GC JavaScript heap at preview | 9.81 MiB | 9.60 MiB | 2.2% |

The large gains are fewer downloads, less idle work, and graphics storage—not
a large reduction in JavaScript heap. During the desktop preview's active
animation, software-renderer task time remained about 1,000 ms/s in both builds; this test
does **not** establish an active-animation FPS improvement. Initial landing
payload is essentially unchanged (about 220 kB desktop / 190 kB mobile).
Initial compressed JS changed from 121.1 to 121.3 KiB; CSS remains 14.9 KiB.

Machine-readable medians are retained in [performance-results.json](./performance-results.json).

The separate allocation probe includes texture mip levels, render-target color
textures, multisample color/depth renderbuffers and context release. At the
same desktop scroll positions:

| Requested graphics storage | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Live textures + renderbuffers at project preview | 1,426.79 MiB | 1,034.94 MiB | 27.5% |
| Live textures + renderbuffers after scrolling to Skills | 707.33 MiB | 52.01 MiB | 92.6% |
| Stationary cursor RGBA backing store | 19.775 MiB | 0.141 MiB | 99.3% |

These are requested-storage estimates, **not total browser RAM**. The cursor
temporarily grows to contain fast movement and its trailing ring. The largest
retained-storage reduction comes from releasing ParkiWell after it is far
offscreen; approaching it again reconstructs the renderer. Nearby previews
still retain full-resolution, antialiased scene targets.

## Findings and implemented plan

The existing site already splits interactive features, renders its background
in a worker, and stops most offscreen WebGL drawing. The remaining work targets
avoidable allocations and work:

1. Measure the production build on desktop and mobile, retaining screenshots
   and the original build for comparison.
2. Bound the cursor canvas to its visible ink and trail. Stop its loop when the
   pointer leaves; the existing trail keeps inserting points indefinitely.
3. Stop target-cursor rotation once its corners are invisible, and avoid
   restarting hover tweens on every pointer event over the same target.
4. Remove the role renderer's redundant canvas antialias/depth buffers (its
   scene still uses the same 4-sample render target), avoid unchanged resizes,
   and avoid regenerating product mipmaps when the composite does not use them.
5. Load journey-only screenshots, rooms and code on journey entry across all
   four projects, retaining the same full-resolution assets and prefetching
   them together. Keep the arrival artwork available in each home preview.
6. Close decoded bitmaps even when an upload is cancelled; release detached
   WebGL contexts and reuse glyph atlases when their metrics are unchanged.
   Invalidate the atlas when the font finishes loading even if its cell metrics
   match the fallback font, preserving the original glyph appearance.
7. Release ParkiWell's renderer when far away, matching the other chapters,
   and re-arm loading for return visits. Let the smooth-scroll engine sleep
   between scrolls while retaining wheel, anchor and programmatic navigation.
8. Repeat the benchmark, compare screenshots, and run build, lint, unit and
   desktop/mobile interaction checks.

## Method

`node scripts/benchmark-performance.mjs <output-directory>` runs three fresh
browser contexts for each viewport: desktop 1440×900 at DPR 2 and mobile
393×851 at DPR 2. Each stage records a two-second sample using Chrome DevTools
metrics, resource timing, frame/draw counters, and canvas backing dimensions.
Heap measurements follow explicit garbage collection. API writes are mocked.
Results and screenshots are stored under `output/playwright/performance/`.
Readiness measures scrolling from the landing page until the project reports
`is-gl`; it is not navigation LCP. Resource counts are cumulative encoded
resource bodies through the sampled stage, not total wire bytes. Long-task
counts and duration are cumulative from navigation; CPU/animation counters
cover only the two-second sample. Each build is tested separately without
concurrent browser tests.

`npm run perf:storage -- <output-directory> <before-url> <after-url>` measures
requested WebGL2 texture and renderbuffer bytes by observing allocations,
deletions and context loss. It retains no GPU handles in its accounting. The
RGBA cursor estimate is backing width × height × 4 bytes. Neither estimate
includes browser buffering, driver overhead, geometry or shader programs.

`npm run perf:visual -- <output-directory> <before-url> <after-url>` captures
settled project previews, direct project journeys and a role journey on desktop
and mobile. It saves before/after images, layout state and pixel-difference
summaries; continuously animated content can differ in phase.

Main-thread task time is not GPU frame time. Canvas pixel storage estimates
are not browser process RAM, and the JavaScript heap excludes GPU allocations.
Local browser results are not field Core Web Vitals or a production-network
speed guarantee.

References: [Three.js renderer options](https://threejs.org/docs/pages/WebGLRenderer)
and [MDN canvas performance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).

## Verification

- Production build, TypeScript and bundle budgets passed.
- ESLint passed; all 128 unit tests passed.
- The full desktop/mobile browser suite passed 121 tests, with one desktop-only
  test skipped on mobile. The final follow-up ran all performance regressions:
  8 passed, with two desktop-only tests skipped on mobile.
- Regression checks cover cursor bounds and shutdown/restart, smooth-scroll
  wake-up and navigation, deferred artwork on entry, and release/reconstruction
  of a distant ParkiWell renderer.
- All 16 desktop/mobile visual comparisons have identical layout and active-act
  state. Thirteen are pixel-identical, including both ParkiWell views on both
  devices after correcting the font-cache invalidation. The other three capture
  different phases of the existing Agoriai/Tarocchi animations; their screenshots
  were reviewed for content and layout changes. No page errors were recorded.

The local baseline is retained at `output/playwright/performance/before/dist`.
Serve it on port 4398 and the current production build on port 4397, then run
the following sequentially (not alongside browser tests):

```sh
PERF_URL=http://127.0.0.1:4398 npm run perf:benchmark -- output/playwright/performance/before-final
npm run perf:benchmark -- output/playwright/performance/after-final
npm run perf:storage -- output/playwright/performance/storage-final http://127.0.0.1:4398 http://127.0.0.1:4397
npm run perf:visual -- output/playwright/performance/visuals http://127.0.0.1:4398 http://127.0.0.1:4397
```

Raw samples, allocation snapshots and screenshots remain in the ignored
`output/playwright/performance/` directory. Scene resolution, product
antialiasing and existing animations are preserved. No dependency was added
and no deployment was performed.
