# TODO

Findings from a full code review + Figma API documentation audit (June 2026).
Ranked from most confident & most severe to least. Confidence reflects how the
finding was established: **verified** (reproduced empirically or read directly
from code), **documented** (backed by current Figma API docs), or
**speculative** (reasoned but untested).

Context: my own screenshots come from Shottr (`SCR-YYYYMMDD-xxxx.png`, no
time component). Those names match no parser pattern and hit the alphabetical
fallback — which happens to sort chronologically because Shottr's suffix is
time-encoded. Items below are ranked for the published plugin's audience, not
just my own workflow.

## Tier 1 — Verified bugs

- [x] **Fix AM/PM parsing in `parseTimestampFromName`** — `code.ts:10`
  *Fixed 2026-06-11: optional `(AM|PM)` captured (case-insensitive, `\s?`
  covers U+202F), hour adjusted incl. 12 AM → 0 and 12 PM → 12 edge cases.*
  Verified: `...at 10.15.30 AM` and `...at 10.15.30 PM` parse to the identical
  timestamp, so a 1:05 PM screenshot sorts before 10:15 AM from the same day.
  Affects every macOS user with a 12-hour clock locale using the native
  screenshot tool — likely a large share of Community users. Capture an
  optional `(AM|PM)` and adjust the hour (+12 for PM, 0 for 12 AM).
  Confirmed detail: modern macOS puts a **narrow no-break space (U+202F)**,
  not a regular space, before AM/PM — match with `[\s ]?(AM|PM)`.
  *Confidence: verified · Severity: high (headline feature, published users)*

- [x] **Broaden timestamp coverage to the common screenshot tools** — `code.ts:8-40`
  *Fixed 2026-06-11: macOS 12h (AM/PM fix above), Shottr date-only pattern,
  and Windows Snipping Tool pattern added; all verified against sample names
  in Node. Remaining: CleanShot's regex match is confirmed, but whether
  `CleanShot YYYY-MM-DD at HH.MM.SS@2x` is the real default still needs a
  real file. Windows exact default format likewise unconfirmed in docs.*
  Goal: catch the big common formats, not every tool. Status per format:
  - macOS native 24h (`Screenshot 2026-06-11 at 14.30.15`) — ✅ already works
  - macOS native 12h (`...at 2.30.15 PM`, U+202F before AM/PM) — ❌ parses but
    ignores AM/PM (see item above; same fix)
  - CleanShot X default (`CleanShot 2026-06-11 at 14.30.15@2x`) — likely ✅
    already matched since the regex isn't anchored to "Screenshot"; verify
    with a real file (default format unconfirmed in docs; users can customize)
  - Shottr (`SCR-20260611-xxxx`) — ❌ no time in name; add date-only pattern
    `SCR-(\d{4})(\d{2})(\d{2})` parsed as midnight; suffix is time-encoded so
    alphabetical tiebreak preserves same-day order
  - Android (`Screenshot_20260611-143015`) — ✅ already works
  - Windows Snipping Tool (`Screenshot 2026-06-11 143015`) — ❌ not matched;
    add `(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})` (verify exact format)
  - iOS (`IMG_1234`) — no timestamp; out of scope, alphabetical fallback is
    already correct (sequential numbers)
  *Confidence: mixed per format · Severity: medium (core feature accuracy)*

- [x] **Mixed-source ordering pushes unparseable names last** — `code.ts:176-177`
  *Fixed 2026-06-11 via option (a): Shottr names now parse (midnight), and
  the comparator gained an alphabetical tiebreak for equal timestamps so
  same-day Shottr batches order by their time-encoded suffix. Names no
  parser reads (e.g. `IMG_1234`) still group last — accepted, since iOS
  sequential names have no date to interleave by.*
  The "timestamped files first" rule means any file the parser can't read
  (e.g. all Shottr names) sorts after *every* timestamped file, regardless of
  actual date. Fix options: (a) add a Shottr pattern `SCR-(\d{4})(\d{2})(\d{2})`
  parsed as midnight of that date, (b) fall back to alphabetical comparison
  between timestamped and non-timestamped instead of forced grouping.
  *Confidence: verified parser behavior · Severity: medium (latent for
  pure-Shottr or pure-macOS batches, wrong order for mixed batches)*

- [x] **Enter key bypasses the disabled Go button** — `ui.html:233`
  *Fixed 2026-06-11: keydown handler now checks `goBtn.disabled`. (`hasImages`
  global is still dead — see Tier 4 cleanup.)*
  The keydown handler calls `frameImages()` without checking button state, so
  Enter in the name field fires with zero images selected. Backend degrades
  gracefully (notify toast), but it's inconsistent with the disabled button.
  Guard with `if (!goBtn.disabled)` — and that makes the currently-dead
  `hasImages` global useful (see Tier 4 cleanup).
  *Confidence: verified · Severity: low (cosmetic inconsistency)*

## Tier 2 — Documented API gaps (conditional severity)

- [ ] **Horizontal arrangement breaks across different parents** — `code.ts:184-191`
  `x`/`y` are parent-relative (docs: "identical to `relativeTransform[0][2]`"),
  so arranging frames that live in different Sections/Groups positions them in
  mismatched coordinate spaces. Fix options: detect mixed parents and notify +
  skip arrangement, or compute via `absoluteTransform`. Severity depends on
  whether users select across containers (unknown for my workflow).
  *Confidence: documented · Severity: medium, conditional*

- [ ] **Arrangement silently no-ops inside auto-layout frames** — `code.ts:139-140, 187-190`
  Docs: setting `x` on a child of an auto-layout frame is a no-op. Framing
  images that live in an auto-layout container reinserts fine, but position
  restore and the entire horizontal-arrange loop silently do nothing. Either
  detect (`parent.layoutMode !== 'NONE'`) and notify, or accept and document.
  *Confidence: documented · Severity: low-medium (edge case, silent)*

- [ ] **No dark mode support** — `code.ts:79`, all of `ui.html` styling
  UI is hardcoded white; dark-theme Figma users get a glaring white panel.
  Current best practice: `figma.showUI(__html__, { ..., themeColors: true })`
  plus restyling with Figma's CSS variables (`--figma-color-bg`,
  `--figma-color-text`, `--figma-color-border`; status colors map to
  `-success`/`-warning`/`-danger` roles). Biggest polish gap for a published
  plugin.
  *Confidence: verified gap · Severity: medium (UX, all dark-theme users)*

- [ ] **Failure toasts aren't styled as errors** — `code.ts:227, 232`
  `figma.notify(msg, { error: true })` renders the documented red error
  styling. Two-word change per call site.
  *Confidence: verified gap · Severity: low*

## Tier 3 — Lower confidence / investigate

- [ ] **`ignoreNextSelectionUpdate` can swallow a real selection change** — `ui.html:222, 248-251, 259`
  Docs confirm `selectionchange` fires on programmatic changes, runs
  callbacks asynchronously, and **coalesces events** ("the callback will not
  necessarily be called each time"). If the user changes selection quickly
  after framing, the plugin-triggered and user-triggered changes can merge
  into one callback; the flag eats it and the UI shows a stale success state
  with Go wrongly disabled until the next selection change. More robust:
  suppress on the backend side (it knows it just set the selection) instead
  of guessing in the UI.
  *Confidence: documented mechanism, unreproduced · Severity: low (rare,
  self-healing)*

- [ ] **Rotated images: behavior unverified** — `code.ts:125-150`
  The x/y/width/height copying assumes no rotation; docs are silent on how
  `appendChild` treats transforms. Likely misplacement/clipping. Cheap
  insurance: skip rotated nodes with a warning, or test empirically first.
  *Confidence: speculative (~60%) · Severity: low (rare in screenshot flows)*

- [ ] **Android regex can false-positive** — `code.ts:20`
  Verified: `invoice_20240203-101530_final` parses as a timestamp. Any
  8-digits + separator + 6-digits run matches. Could anchor near "Screenshot"
  or validate ranges (month ≤ 12, hour ≤ 23). Only affects sort order of
  oddly-named layers.
  *Confidence: verified mechanism · Severity: very low*

## Tier 4 — Hygiene & polish

- [ ] **Remove dead UI state** — `ui.html:220-221`
  `hasImages` and `imageCount` are written but never read. Delete, or use
  `hasImages` for the Enter-key guard (Tier 1).
- [ ] **Replace `innerHTML` with safer DOM updates** — `ui.html:318`
  Only numbers are interpolated today, so it's safe — but `textContent` with
  `white-space: pre-line` removes the habit risk.
- [ ] **Fill in `package.json` metadata** — `description` is still
  "Your Figma Plugin"; `author` and `license` are empty. Pick a real license
  for a published plugin.
- [ ] **Pin `@figma/eslint-plugin-figma-plugins`** — currently `"*"`; a
  breaking release breaks lint unpredictably. Pin like the other deps.
- [ ] **Migrate to ESLint 9 / flat config** — ESLint 8 is EOL (late 2024).
  Lint passes today; do this before the Figma plugin ecosystem drops 8.
- [x] **Add a unit test for `parseTimestampFromName`** — the one pure function
  in the project, and it had a real bug (AM/PM). A tiny Node test file
  covering macOS 12h/24h, Android, ISO, Shottr, and false-positive cases
  would lock in the Tier 1 fixes.
  *Done 2026-06-11: `test/parseTimestampFromName.test.js`, run via `npm test`
  (builds first, then Node's built-in test runner — no new dependencies).
  12 tests covering every supported format, the AM/PM edge cases, null
  fallbacks, and the documented Tier 3 false positive.*
- [ ] **Consider `setRelaunchData`** — stamp created frames so the plugin can
  be re-run from the right sidebar when a frame is selected. Pure polish.

## Considered & rejected (for now)

- **Using file metadata (creation/modified date) instead of filename parsing.**
  Filesystem dates are flat-out unavailable: Figma plugins have no filesystem
  access, and when an image is dragged into Figma only the layer name and the
  image bytes survive — the source file's dates aren't stored anywhere in the
  document. The only variant that could work is reading metadata *embedded in
  the image bytes* (EXIF / PNG chunks) via
  `figma.getImageByHash(fill.imageHash).getBytesAsync()`, but that means
  writing a binary EXIF/PNG parser (project has a no-runtime-deps rule),
  going async per image, and — verified empirically on a Shottr PNG — most
  screenshot tools don't embed a capture time in the bytes anyway (only
  resolution/dimensions). High complexity, low yield. Filename parsing stays
  the primary mechanism; revisit only if a format with reliable embedded
  timestamps becomes important.

## Verified current (no action needed)

- `documentAccess: "dynamic-page"` — now required for new plugins; already
  compliant, and no restricted APIs are used.
- `networkAccess: ["none"]` — correct, best privacy posture.
- `parent.postMessage(..., '*')` — documented pattern for null-origin UIs.
- `lockAspectRatio()` → `targetAspectRatio` — current API; respected across
  drag, panel, constraints, and auto layout.
- `Array.isArray(node.fills)` guard — valid `figma.mixed` narrowing (mixed
  only occurs on text nodes, so it's belt-and-braces here).
- `@figma/plugin-typings` resolves to 1.128.0 — current latest.
