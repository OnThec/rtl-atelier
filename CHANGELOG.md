# Changelog

All notable changes to **RTL Atelier** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.6.0] — 2026-09-26

### Fixed

- **Settings now reach existing chats (Qwen, Claude, ChatGPT)** — three defects compounded into "only new sessions change": units wrapped in author `dir="auto"` were excluded from font styling and RTL-coverage accounting; nested containers were processed outer-before-inner so inner paragraphs merged into their parent's analysis; and background/throttled tabs never learned about settings changed elsewhere. Author-set direction now only suppresses direction patches (never fonts, typography, or the coverage ring), innermost units are processed first, and a `storage.onChanged` listener in the content script re-applies state in every tab the moment settings persist.
- **Claude.ai text detection without manual toggles** — the adapter now declares message-container unit hints (`data-testid` roles, framework classes) that act as paragraph-unit boundaries where block tags and custom elements miss them; the same hints ship for ChatGPT, Gemini, DeepSeek, Qwen, Kimi and Z.ai. Leaves without a block ancestor group under their shared parent instead of fragmenting into per-leaf units. The `readable` font scope covers rich-text editors and hinted message containers, and switching scope now re-runs the direction engine instead of only swapping CSS.
- **Sites tab toggle** — the switch now renders optimistically from the authoritative settings model; it previously repainted from the lagging active-sites registry and appeared to ignore clicks. The Site-tab switch gets the same treatment.
- **"Re-apply on this page"** — the forced re-apply path skips the settings-signature no-op, and the worker answers `{ok, reason}` so the popup distinguishes success from unreachable pages instead of always toasting success.
- **Panel weight** — the panel's design system is weight-tokenized (`--rtla-fw-body/strong/heading`); hardcoded `font-weight` values used to win over the user setting on titles, stats, tabs and badges.
- **SVG content safety** — user-facing text inside `<text>/<title>/<tspan>` is repaired while SVG markup is never written to, and geometry strings (`<path>` data) are never treated as content.

### Added

- **CSP-Immune Font Loader (`FontFace` API)** — Completely bypasses Claude.ai and strict Content Security Policies by having the background service worker fetch font binaries in privileged context and transfer ArrayBuffers directly to the content script, loading fonts in-memory via `new FontFace(family, buffer)` and `document.fonts.add()`.
- **60fps Frame-Budget Scheduler** — Replaced `requestIdleCallback` with a 16ms `requestAnimationFrame` and `setTimeout(0)` scheduling loop, eliminating main-thread starvation during React 18 hydration loops on Claude and DeepSeek.
- **SPA Navigation Clean Slate & Hydration Sweeps** — Added multi-stage sweeps (`[80ms, 200ms, 500ms, 1200ms, 2500ms]`) and clean state flushes (`engine.refresh()`) on single-page-application route changes, ensuring newly mounted conversations format instantly without manual re-apply or page refresh.
- **High-Specificity CSS Cascade Boost** — Added targeted selectors for Claude (`.font-claude-message`), DeepSeek (`.ds-markdown`), and standard chat message containers to ensure custom fonts take immediate precedence.
- **Bilingual Diagnostics & Troubleshooting Center** — Added an interactive real-time diagnostics dashboard featuring live page inspection, telemetry grid (paragraphs, direction mode, chat containers, queue depth), font & CSP security checks, dynamic actionable recommendations, one-click "Run Deep Scan & Quick Fix", and full technical Markdown report export.
- **Real-time observation of show transitions** — the MutationObserver now watches `class/hidden/style/dir`; tooltips, popups and hover cards revealed by attribute flips are processed immediately (own writes and hover churn filtered). Non-destructive `rescan()` heals subtrees missed while a tab was backgrounded.
- **Fault taxonomy + user-facing notifications** — recovered faults are classified (`csp-blocked`, `detached-node`, `dom-mismatch`, `generic`); at 10+ faults a page pushes an `rtlm:fault` notice and the popup shows a warning banner that opens the page analysis with a plain-language breakdown.
- **Brand artwork pipeline** — `icons/SFA_RTL.png` is now the source of truth: the icon build decodes it, area-averages it (premultiplied alpha, pure JS) to 16/32/48/128, and the popup's brand tile and About dialog use it. The 1.2 MB master is excluded from the release ZIP; the procedural rasterizer remains as fallback.

## [1.5.0] — 2026-08-25

### Fixed

- **Blank Site tab (DeepSeek and others)** — when the service-worker round-trip failed (cold start, transient `chrome.tabs.get` errors), the popup clobbered its tab object with `null` and rendered an empty shell. Tab identity is now derived locally from `tabs.query` first, and the worker's richer data merges in only when it actually resolves. The dashboard can no longer go blank.

### Added

- **RTL coverage ring** on the Site dashboard: a conic-gradient meter showing what share of detected paragraphs read right-to-left — an at-a-glance signal unique to RTL Atelier.
- **Page analysis** panel: one-click diagnostics straight from the live engine — adapter, paragraph units, RTL blocks, edits, tracked inputs, last scan duration, scan count, recovered faults.
- **Panel weight control** (`uiFontWeight`): the extension's own UI now exposes family, *weight* and size independently.

## [1.4.1] — 2026-08-25

### Fixed

- **Typography module dead (root cause found)** — `renderFontRows` referenced `weightsForFamily` without importing it (leftover from the font-options refactor); the thrown `ReferenceError` aborted the render before the font selectors populated and before stepper indicators updated, which also explains the panel-size readout stuck at 100%. Import restored; one crash had been cascading into three reported symptoms.
- **Blank page at small zoom** — panel zoom was applied to `<body>`, leaving an unstyled blank region around it; zoom now scales `<html>` and the background is painted at that level too.
- **Layout breaking on LobeHub/DeepSeek** — setting `dir="rtl"` on flex/grid containers reverses child order, shattering host layouts. New `layoutSafe` guard (on by default, toggle in Advanced typography) skips direction/alignment on structural containers while still repairing their text and applying fonts.
- **Misleading zeros** — tabs with no report yet (still loading, blocked pages) showed 0; they now display "No data yet" with neutral bars until real data arrives.

### Changed

- Scrollbars polished globally: rounded translucent thumb with hover accent, transparent track/corner, Firefox thin-scrollbar support.

## [1.4.0] — 2026-08-25

### Fixed

- **Fonts doing nothing on non-Persian pages** — injected font rules only targeted engine-detected RTL units, so picking a font on a mostly-English page changed nothing. New "Applies to" scope control: *RTL text* (precise, default) or *All readable text* (paragraphs, headings, list items, table cells…).
- **Panel size was a no-op** — the control set root `font-size` while the design system is built from px tokens; scaling now uses CSS `zoom`, so steps visibly resize the panel.
- **Sites section looked empty/broken** — built-in platforms were invisible (only custom domains listed). All preset platforms are now toggleable chips with on/off state; custom domains keep their own manager.

### Changed

- **Site tab rebuilt as a dashboard:** status pill (Running / Waiting for RTL text / Not activated / Disabled / Off everywhere), animated stat cards with progress bars and count-up numbers, an "Activate on this site" one-click CTA when Smart mode blocks the current host, reset-counters action, and an inline explainer for why counts stay at zero.
- Steppers support hold-to-repeat for smooth size adjustments.
- Visual refresh: inline SVG icon set replaces glyph buttons, staggered card reveal animations, pulsing live indicator — all honoring `prefers-reduced-motion`.

## [1.3.2] — 2026-08-25

### Fixed

- **Blank panel on open** — the Site view was only revealed as the *last* step of popup init; any failure during data loading left every tab hidden until the user switched away and back. The default view now renders immediately, before any async work, and each init stage is fault-isolated.
- **Dead Typography controls** — listener wiring was sequential and unguarded: one failed binding silenced all later ones while tab buttons (wired first) kept working. All bindings are now null-tolerant and logged individually.
- **Stale monitoring** — mutation-driven unit rescans updated internal counters without ever reporting, so paragraph/edit/input statistics froze between full scans; rescans now push debounced snapshots. The service worker additionally pushes each report to the popup (`rtlm:stats-changed`), making the Site card update live while open.

### Changed

- Popup render pipeline is section-isolated: a fault in one card logs a warning and degrades that card only.

## [1.3.1] — 2026-08-25

### Fixed

- **Style-element litter** — inactive pages (non-whitelisted sites, extension off) accumulated empty `<style>` placeholder nodes; style injection now removes elements whose content is empty, so disabled pages receive zero injected nodes.
- **Stop/apply race** — a settings broadcast in flight when the user stopped the extension could resurrect a freshly stopped engine with stale data; apply operations are now epoch-stamped at message arrival and abort if a stop intervened.
- **"Active sites" accuracy** — pages where RTL Atelier was *disabled* were listed as active because their zero-stat reports were recorded verbatim; reports now carry an `active` flag and inactive hosts are evicted from the registry.

### Changed

- Pure page-style builders (`pageFontCss`, `fontFaceRule`, weight/format validation) extracted to `src/core/page-style.js` with full unit coverage; content script consumes them instead of private copies.
- Broadcasts reuse settings already loaded by their callers, and font add/remove skips the tab-wide broadcast entirely when storage did not change.
- Smoke suite expanded to three sandboxed scenarios: happy path with idempotent re-applies, zero-injection on disabled pages, and stale-apply invalidation after stop.

## [1.3.0] — 2026-08-24

### Fixed

- **Weight selection now matches the font** — the weight picker is generated from the selected family's real faces (bundled + uploaded); a two-weight font shows two options, never five. Stored weights that a family lacks resolve back to Auto, and picking a family with an unavailable stored weight reconciles both keys atomically.
- **Weight/size apply without a family** — font weight and text size previously emitted no CSS unless a family was chosen; they now work independently (engine applies `.rtlm-font` whenever any font styling is active), and the class-mode flip correctly triggers a rebuild instead of a style-only swap.
- **Site visibility & control** — new live "Active sites" registry: the service worker records hosts reporting stats and the Sites tab lists every page where the engine is running, each with a per-site on/off switch and edit counter.

### Changed

- **Tabbed popup** — complete interface restructure into four focused views (Site / Typography / Sites / Settings) with direct-access appearance controls (Auto/Light/Dark segmented instead of cycling button), labeled data actions replacing icon-only footer buttons, contextual site status hints, and fully optimistic rendering so every control repaints instantly before persistence confirms.
- Persian translations added for all new surfaces (tabs, dashboard, hints).

## [1.2.1] — 2026-08-24

### Fixed

- **Service worker registration failure (critical)** — the 1.2.0 custom-font module imported `scripts/fonts.js`, pulling `node:fs`/`node:path`/`node:url` into the extension's module graph. MV3's `script-src 'self'` policy blocks those specifiers, so the service worker (and popup) failed to load entirely. The pure font-name parser now lives in `src/core/font-names.js`; both the build script and runtime modules share it, and a new static guard test walks every extension-reachable import graph to reject Node built-ins or build-script imports permanently.
- **Apply race** — concurrent settings broadcasts could interleave `stop()`/`start()` mid-flight; apply operations are now serialized through a promise chain.
- **Custom `@font-face` hardening** — family, weight and format are re-validated at injection time instead of trusting stored records; unknown formats are skipped.

## [1.2.0] — 2026-08-24

### Added

- **Targeted activation** — the engine now runs only on built-in AI-platform presets plus user-whitelisted domains by default (`activationMode: targeted`); an "Everywhere" mode restores legacy always-on behavior. New Activation card with mode toggle and a site-list manager (add/remove custom domains).
- **Custom font uploads** — upload `.ttf/.otf/.woff/.woff2` files from the popup; fonts are stored locally in a virtual `/fonts` library (`chrome.storage.local`, up to 8 MB per file / 24 MB total) and injected as data-URL `@font-face` rules on pages. Duplicate filenames trigger a Replace/Skip dialog; weights are inferred from filenames using the same conventions as the bundled pipeline.
- **Font weight & size controls** — page-font weight selector (Auto/Light→Bold) and granular text-size stepper (50–250 %) applied to RTL units; independent panel-size stepper for the extension UI.
- **Vazir as default page font** — new installs default to the bundled Vazir family; stored v1 settings are migrated automatically.
- **Site favicons** — the site card shows the active tab's favicon via Chrome's internal `_favicon` source; missing icons hide the placeholder entirely.

### Fixed

- **Font-switch stability** — switching fonts or pressing "Re-apply" previously rebuilt the whole engine, causing visible flicker/layout shifts. Style injection is now replace-by-id (never stacked), code/mono regions are shielded from page-font inheritance, and font-only changes take a fast path that swaps injected styles without re-scanning the page.

### Changed

- Settings storage moved to `chrome.storage.local` with a schema version for future migrations; new `unlimitedStorage` and `favicon` permissions.
- Popup reorganized into a clearer hierarchy: Site control → Activation → Typography (advanced options collapsed) → Interface → Preview.

## [1.1.0] — 2026-08-24

### Added

- **Mixed-text detection** — new `mostlyRtl` engine strategy: lines that open with a Latin brand word ("ChatGPT چیست؟") are resolved RTL when Persian-specific characters confirm the language or RTL letters clearly dominate (≥ 45 % of letters, or ≥ ⅓ with Persian markers). Toggleable in the popup.
- **Persian UI** — full, hand-written Persian localization of the popup (`src/ui/i18n.js`) with an interface-language selector (Auto / English / فارسی); the panel flips to a proper RTL layout via logical CSS.
- **Independent extension font** — new `uiFont` setting styles the popup itself, fully decoupled from the page font; bundled families now expose per-face weight data (`faces` in the font manifest) and the selectors show available weight counts.
- **DOM robustness** — custom elements (`<chat-message>` etc.) act as paragraph-unit boundaries; units falling back to the engine root are never merged into one page-wide unit; open shadow roots are traversed during scans; per-unit fault isolation records errors instead of aborting the page scan.

### Fixed

- **Theme toggle** — switching appearance required two clicks on light-scheme systems because "auto" resolved to the same palette as "light"; the cycle now advances optimistically on click and tracks live OS scheme changes while the popup is open.
- Font-family names are escaped as proper CSS strings (the previous `CSS.escape` use was identifier escaping).

## [1.0.2] — 2026-08-24

### Added

- **Bundled Persian fonts** — 19 font faces across 7 open-source Persian families (Gandom, Parastoo, Sahel, Samim, Shabnam, Tanha, Vazir) ship inside the extension; a new page-font selector in the popup applies the chosen family to RTL-detected paragraphs and active text inputs via generated `@font-face` rules (`scripts/fonts.js` → `dist/fonts.css`, `dist/fonts.ui.css`, `dist/fonts.manifest.json`).
- Font pipeline tests (`tests/fonts.test.js`), `pageFont` sanitization tests, and an engine test covering `rtlm-font` class application on units and inputs.
- Release packaging now bundles `fonts/` and the generated dist CSS/manifest into the ZIP; build and verify pipelines run the font step.

### Fixed

- Popup modal backdrop no longer traps pointer events when hidden (`.modal-backdrop { display: grid }` overrode the `[hidden]` attribute); a global `[hidden] { display: none !important; }` guard was added.
- `RtlEngine` now initializes its input font-tracking set in the constructor instead of only on `stop()`.

## [1.0.1] — 2026-08-24

### Fixed

- **Live updates** — content inserted *inside* an already-processed paragraph (the common streaming-AI case) is now processed; previously only brand-new subtrees were picked up.
- **Direction re-evaluation** — paragraph units are now reset and re-analyzed when their text changes; a unit whose content flips RTL → LTR no longer keeps a stale `dir="rtl"` and alignment class. Page-authored `dir` attributes are never destroyed by a reset.
- **Arabic safety** — Persian letter unification (`ي/ك/ى → ی/ک`) and half-spacing now apply only when the paragraph actually looks Persian (Persian-specific letters or the می/نمی verb prefix). Pure Arabic text is left byte-for-byte intact.
- **Memory** — `PatchStore` now bounds both recorded text nodes (8 192) and patched elements (12 288), pruning oldest-first on very long-lived chat pages; scheduler error log is bounded as well.
- **Statistics** — chat inputs are counted once per field instead of once per keystroke; paragraph counters no longer inflate on re-scans.
- **Re-apply** — the popup's "Re-apply on this page" now goes through the service worker and works even when the engine was previously stopped for the site.
- Popup no longer clips at Chrome's 600 px popup height (main area max-height corrected).
- Digit-conversion context scan is now bounded (constant lookahead), eliminating quadratic worst-case behavior on pathological text nodes.

### Security

- Settings normalizer now whitelists known keys; arbitrary keys from imported JSON or messages can no longer be persisted to sync storage or broadcast, and own `__proto__` keys from `JSON.parse` are ignored.
- Per-site override keys are sanitized through strict hostname validation (charset + length); garbage and prototype-shaped keys are dropped.
- Service-worker report handler now coerces stat payloads to non-negative integers before storing/badge use.
- Popup switches are built with DOM APIs instead of `innerHTML` (defense-in-depth under MV3 CSP).

### Changed

- Content-script stats reporting is debounced (400 ms trailing) to avoid message floods on fast-streaming pages; disable/stop still reports immediately.

## [1.0.0] — 2026-08-24

### Added

- **Direction engine** — UAX #9-first-strong paragraph direction resolution for mixed Persian/Arabic + English text, applied per block with full reversibility.
- **Typography intelligence** — Persian letter normalization (`ي/ك → ی/ک`), tatweel removal, smart half-spacing (ZWNJ) for `می/نمی/بی` prefixes and `ها/های/ترین` suffixes, punctuation spacing repair, whitespace collapsing, and optional context-aware digit conversion (Latin ⇄ Persian digits).
- **Site adapters** — dedicated behavior for ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok, Copilot, HuggingChat, Poe, meta.ai, Mistral Le Chat, Google AI Studio, aistudio, v0, bolt.new, Lovable, Replit, and more — with automatic code-block LTR protection and live input direction switching.
- **Patch store** — every DOM touch is recorded and can be reverted instantly; disabling the extension restores the page byte-for-byte (no `dir` change, no class remnant).
- **Idle scheduler** — mutation-driven chunked processing with a 6 ms frame budget; pauses on hidden tabs.
- **Popup** — glass/neumorphic design system with light, dark and auto themes, per-site overrides, live bilingual preview, statistics, settings export/import/reset.
- **Zero-dependency toolchain** — custom ES-module bundler, pure-JS ZIP writer, and a from-scratch PNG icon renderer for the build pipeline; `node --test` suite (60 tests) plus a bundle boot smoke test, all with no runtime dependencies.
- Keyboard shortcuts: `Alt+Shift+R` (toggle site), `Alt+Shift+T` (toggle everywhere).
