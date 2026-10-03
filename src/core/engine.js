import { analyzeText, looksPersian, resolveDirection, resolveDirectionSmart } from "./analyzer.js";
import { transformText } from "./typography.js";
import { IdleScheduler } from "./scheduler.js";
import { PatchStore } from "./patch-store.js";
import { globalErrors, SUBSYSTEMS } from "./errors.js";

const SKIP_SUBTREE = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SELECT",
  "TEXTAREA",
  "INPUT",
  "PRE",
  "MATH",
  "HEAD",
  "TITLE",
]);

const SKIP_LEAF = new Set([...SKIP_SUBTREE, "CODE", "KBD", "SAMP", "TT", "VAR", "BUTTON"]);

const INLINE_CODE = new Set(["CODE", "KBD", "SAMP", "TT", "VAR"]);
const BLOCK_CODE = new Set(["PRE"]);

/*
 * SVG text containers. SVG is skipped as layout, but its text-family nodes
 * are real user-facing strings (chart labels, icon badges, tooltips) on
 * platforms like Qwen. Note the case-insensitive tag matching in collectTree:
 * SVG-namespace elements keep lowercase tagNames in real DOMs, while HTML
 * elements and the test fake DOM report uppercase.
 */
const SVG_TEXT_TAGS = new Set(["TEXT", "TSPAN", "TEXTPATH", "TITLE", "DESC"]);

/*
 * Class-token hints for show transitions: popups, hover cards, tooltips and
 * dropdowns usually appear by toggling one of these names. Broader matching
 * would rescan on every hover-color/status churn for no benefit.
 */
const SHOW_HINT_RE =
  /(^|\s)(show|shown|open|opened|active|visible|displayed|expanded|popover|tooltip|popup|dropdown|menu)(-|$|\s)/i;
const OWN_CLASS_RE = /(^|\s)rtlm-[a-z-]+/;

const LANDMARK_TAGS = new Set(["BODY", "HTML", "MAIN"]);

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "CAPTION",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LEGEND",
  "LI",
  "MENU",
  "NAV",
  "OL",
  "P",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

const LIST_CONTAINERS = new Set(["OL", "UL"]);
const LIST_ITEMS = new Set(["LI"]);

function findAncestor(el, tagSet) {
  let cur = el ? (el.parentElement || el.parentNode) : null;
  while (cur && cur.nodeType === 1) {
    const tag = String(cur.tagName || "").toUpperCase();
    if (tagSet.has(tag)) return cur;
    cur = cur.parentElement || cur.parentNode;
  }
  return null;
}

function significantText(data) {
  return typeof data === "string" && /[^\s]/.test(data);
}

/*
 * Fault taxonomy: raw errors are classified so the diagnostics panel (and
 * the user-facing fault banner) can say WHAT resisted processing instead of
 * showing an opaque counter.
 */
function classifyError(error) {
  const message = String((error && error.message) || error || "unknown");
  let kind = "generic";
  if (/security|csp|denied|permission/i.test(message)) kind = "csp-blocked";
  else if (/removed|detached|not.?found|notavailable/i.test(message)) kind = "detached-node";
  else if (/typed|undefined is not|cannot read|null/i.test(message)) kind = "dom-mismatch";
  return { kind, message: message.slice(0, 200) };
}

export class RtlEngine {
  constructor(config = {}) {
    if (!config.root) throw new Error("RtlEngine requires a root element");
    if (!config.settings) throw new Error("RtlEngine requires settings");
    this.root = config.root;
    this.settings = config.settings;
    this.adapter = config.adapter || { id: "generic", inputSelectors: [] };
    this.computeAlign = config.computeAlign || ((el) => getComputedStyle(el).textAlign);
    // Structural-display probe for the layoutSafe guard. Must always resolve
    // to a function: assigning a bare `null` here would shadow the fallback
    // and silently disable flex/grid protection outside of tests.
    this.computeDisplay =
      config.computeDisplay ||
      ((el) => {
        try {
          if (typeof getComputedStyle === "function") {
            return getComputedStyle(el).display;
          }
        } catch {}
        return "";
      });
    this.observerCtor =
      config.observerCtor || (typeof MutationObserver === "function" ? MutationObserver : null);
    this.report = config.report || (() => {});
    this.hintSelector = this.compileUnitHints();
    this.patches = new PatchStore();
    this.scheduler = new IdleScheduler({
      budgetMs: config.budgetMs ?? 6,
      idle: config.idle ?? null,
    });
    this.processed = new Set();
    this.unitState = new WeakMap();
    this.countedUnits = new WeakSet();
    this.rtlCounted = new WeakSet();
    this.trackedInputs = new WeakSet();
    this.fontInputs = new WeakSet();
    this.written = new WeakMap(); // text node -> last value written by us
    this.settleTimer = null;
    this.errors = [];
    this.observer = null;
    this.inputHandler = null;
    this.running = false;
    this.stats = { paragraphs: 0, rtlBlocks: 0, textEdits: 0, inputs: 0 };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.processSubtree(this.root);
    this.observe();
    if (this.settings.autoDirInputs) this.enableInputs();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.inputHandler) {
      const doc = this.root.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (doc?.removeEventListener) {
        doc.removeEventListener("input", this.inputHandler, true);
        doc.removeEventListener("focusin", this.inputHandler, true);
        doc.removeEventListener("keyup", this.inputHandler, true);
      }
      this.inputHandler = null;
    }
    this.scheduler.clear();
    this.patches.revertAll();
    this.processed = new Set();
    this.unitState = new WeakMap();
    this.countedUnits = new WeakSet();
    this.rtlCounted = new WeakSet();
    this.trackedInputs = new WeakSet();
    this.fontInputs = new WeakSet();
    this.written = new WeakMap(); // text node -> last value written by us
    this.errors = [];
    this.stats = { paragraphs: 0, rtlBlocks: 0, textEdits: 0, inputs: 0 };
  }

  refresh() {
    this.stop();
    this.start();
  }

  /**
   * Schedule a debounced sweep to settle streaming chat output (DeepSeek, Claude, ChatGPT).
   * Once streaming stops and DOM mutations pause, this ensures any unit that was
   * evaluated with only partial tokens is re-evaluated in its full, final state.
   */
  scheduleSettle(delayMs = 200) {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.running) {
        this.rescanVisible();
        this.rescan(true);
      }
    }, delayMs);
  }

  /**
   * Re-walk the page WITHOUT reverting: catches subtrees the observer missed
   * while the tab was hidden (background tabs starve requestIdleCallback and
   * MutationObserver callbacks), or re-verifies all units when force is true.
   */
  rescan(force = false) {
    if (!this.running) return;
    if (force) {
      this.processed.clear();
    }
    this.processSubtree(this.root, force);
  }

  /** Ancestor distance from the engine root — deeper units sort first. */
  unitDepth(el) {
    let depth = 0;
    let node = el;
    while (node && node !== this.root && node.nodeType === 1) {
      depth++;
      node = node.parentNode;
    }
    return depth;
  }

  updateSettings(settings) {
    this.settings = settings;
    this.refresh();
  }

  snapshot() {
    return { ...this.stats };
  }

  /**
   * Fast viewport-bounded rescan for virtualized scrolling (Claude, DeepSeek, ChatGPT).
   * Checks elements currently in or approaching the viewport to apply RTL styling
   * without blocking scrolling or waiting for throttled idle deadlines.
   */
  rescanVisible() {
    if (!this.running || !this.root) return;
    if (typeof window === "undefined") {
      this.rescan();
      return;
    }
    const viewHeight = window.innerHeight || 800;
    const viewWidth = window.innerWidth || 1200;
    const candidates = [];
    if (this.hintSelector) {
      try {
        const matches = this.root.querySelectorAll(this.hintSelector);
        for (const el of matches) candidates.push(el);
      } catch {}
    }
    try {
      const blocks = this.root.querySelectorAll(
        "p, li, blockquote, h1, h2, h3, h4, h5, h6, [role='article'], [class*='message'], [class*='markdown'], [class*='prose'], [class*='ds-'], [class*='font-claude'], [dir='auto']"
      );
      for (const el of blocks) candidates.push(el);
    } catch {}

    const OVERSCAN = 900;
    for (const el of candidates) {
      if (!el || el.nodeType !== 1) continue;
      try {
        if (typeof el.getBoundingClientRect === "function") {
          const rect = el.getBoundingClientRect();
          if (
            rect.bottom >= -OVERSCAN &&
            rect.top <= viewHeight + OVERSCAN &&
            rect.right >= -OVERSCAN &&
            rect.left <= viewWidth + OVERSCAN
          ) {
            this.processSubtree(el, true);
          }
        }
      } catch {}
    }
  }

  /**
   * Rich diagnostics for the popup's page-analysis panel: identity, counters,
   * reason codes, and troubleshooting guidance.
   */
  diagnostics() {
    const kinds = {};
    for (const fault of this.errors) kinds[fault.kind] = (kinds[fault.kind] || 0) + 1;
    const paragraphs = this.stats.paragraphs;
    const rtlBlocks = this.stats.rtlBlocks;
    const coveragePct = paragraphs > 0 ? Math.round((rtlBlocks / paragraphs) * 100) : 0;

    let status = "active";
    let reasonCode = "ACTIVE_RTL";
    let reasonText = "RTL engine active and formatting Persian text";
    let troubleshooting = [];

    if (!this.running) {
      status = "inactive";
      reasonCode = "ENGINE_STOPPED";
      reasonText = "Engine is currently stopped";
      troubleshooting.push("Enable master switch or check site activation");
    } else if (this.settings.directionMode === "ltr") {
      status = "active";
      reasonCode = "FORCED_LTR";
      reasonText = "Orientation is set to LTR (English mode); Persian layout is not applied";
      troubleshooting.push("Switch text orientation to Auto or RTL in the popup");
    } else if (this.errors.length > 5) {
      status = "warning";
      reasonCode = "PROCESSING_FAULTS";
      reasonText = `${this.errors.length} faults recovered during scanning`;
      troubleshooting.push("Click 'Re-apply on this page' to perform a fresh scan");
    } else if (paragraphs === 0) {
      status = "standby";
      reasonCode = "NO_PARAGRAPHS_FOUND";
      reasonText = "No paragraph units detected yet; page may be loading or chat history pending";
      troubleshooting.push("Wait for conversation to load, or scroll to bring messages into view");
    } else if (rtlBlocks === 0) {
      status = "standby";
      reasonCode = "NO_RTL_TEXT_DETECTED";
      reasonText = `${paragraphs} paragraphs detected, but none contain Persian/Arabic text`;
      troubleshooting.push("Type or receive Persian text in chat to trigger RTL formatting");
    }

    let adapterMatched = 0;
    if (this.hintSelector && this.root && typeof this.root.querySelectorAll === "function") {
      try {
        adapterMatched = this.root.querySelectorAll(this.hintSelector).length;
      } catch {}
    }

    return {
      adapterId: this.adapter?.id || "generic",
      rootTag: this.root?.tagName || "",
      paragraphs,
      rtlBlocks,
      coveragePct,
      textEdits: this.stats.textEdits,
      inputs: this.stats.inputs,
      scans: this.scanCount || 0,
      lastScanMs: Math.round((this.lastScanMs || 0) * 100) / 100,
      errors: this.errors.length,
      faultKinds: kinds,
      running: this.running,
      status,
      reasonCode,
      reasonText,
      troubleshooting,
      queueSize: this.scheduler ? this.scheduler.size : 0,
      directionMode: this.settings?.directionMode || "auto",
      pageFont: this.settings?.pageFont || "default",
      pageFontWeight: this.settings?.pageFontWeight || "auto",
      pageFontSize: this.settings?.pageFontSize || 100,
      fontScope: this.settings?.fontScope || "rtl",
      fontActive: this.fontActive(),
      adapterMatched,
    };
  }

  observe() {
    if (!this.observerCtor) return;
    this.observer = new this.observerCtor((records) => this.onMutations(records));
    this.observer.observe(this.root, {
      childList: true,
      subtree: true,
      characterData: true,
      // Popups, tooltips, hover cards and dropdowns usually appear by
      // flipping class / hidden / style on an existing subtree — for those
      // reveals childList and characterData never fire, which is why
      // dynamically shown text stayed unstyled until a full reload. The
      // filter keeps the stream narrow (see onAttributeMutation).
      attributes: true,
      attributeFilter: ["class", "hidden", "style", "dir"],
    });
  }

  onMutations(records) {
    if (!this.running) return;
    this.scheduleSettle();
    for (const record of records) {
      if (record.type === "characterData") {
        const target = record.target;
        // Ignore the records our own setText() produces. Without this guard
        // every edit re-entered onMutations and re-queued a unit-wide rescan
        // (a full collectTree pass) per write.
        if (target && this.written.get(target) === target.data) continue;
        const owner = target?.parentElement || target?.parentNode;
        const block = this.nearestBlock(owner);
        if (block) this.queueUnitRescan(block);
      } else if (record.type === "childList") {
        this.onChildList(record);
      } else if (record.type === "attributes") {
        this.onAttributeMutation(record);
      }
    }
  }

  /**
   * React to show transitions: a popup/tooltip becoming visible. Everything
   * else (hover-color churn, our own rtlm-* class writes, hide transitions)
   * is filtered out — the unit rescan itself is cheap, but the filter keeps
   * long-running pages from rescanning on every style tick.
   */
  onAttributeMutation(record) {
    const target = record.target;
    if (!target || target.nodeType !== 1) return;
    const tag = String(target.tagName || "").toUpperCase();
    if (tag === "BUTTON" || tag === "A" || tag === "INPUT") return;
    const role = typeof target.getAttribute === "function" ? target.getAttribute("role") : null;
    if (role === "button" || role === "tab" || role === "menuitem") return;

    const attr = record.attributeName;
    if (attr === "class") {
      let names = "";
      if (typeof target.className === "string") names = target.className;
      else if (target.classList && typeof target.classList.value === "string") {
        names = target.classList.value;
      }
      if (!names) return;
      if (OWN_CLASS_RE.test(names)) return; // our own class writes
      if (/hover|focus|pointer|active|selected/i.test(names) && !/(show|open|popover|tooltip|dropdown)/i.test(names)) return;
      if (!SHOW_HINT_RE.test(names)) return; // not a show transition
    } else if (attr === "hidden") {
      if (!target.hidden) return; // only show transitions
    } else if (attr === "style") {
      const style = target.style;
      if (!style) return;
      const display =
        typeof style.getPropertyValue === "function"
          ? style.getPropertyValue("display")
          : style.display;
      if (!display || display === "none") return;
    } else if (attr !== "dir") {
      return;
    }
    const block = this.nearestBlock(target);
    if (block) this.queueUnitRescan(block);
  }

  onChildList(record) {
    for (const node of record.addedNodes) {
      if (node.nodeType === 1) {
        const tag = String(node.tagName || "").toUpperCase();
        if (BLOCK_TAGS.has(tag) || tag.includes("-")) {
          this.scheduler.enqueue(node, () => this.processSubtree(node));
        } else {
          const block = this.nearestBlock(node.parentElement || node.parentNode || record.target);
          if (block) this.queueUnitRescan(block);
        }
      } else if (node.nodeType === 3) {
        const block = this.nearestBlock(node.parentElement || node.parentNode || record.target);
        if (block) this.queueUnitRescan(block);
      }
    }
    if (record.removedNodes && record.removedNodes.length > 0) {
      const block = this.nearestBlock(record.target);
      if (block) this.queueUnitRescan(block);
      for (const node of record.removedNodes) {
        if (node.nodeType === 1) this.forget(node);
      }
    }
  }

  queueUnitRescan(unit) {
    if (!unit || unit.nodeType !== 1) return;
    this.scheduler.enqueue(unit, () => {
      this.processUnit(unit, true);
      // Mutation-driven edits previously updated internal counters without
      // ever reporting, leaving popup/badge statistics stale. The reporter
      // debounces, so streaming pages stay cheap.
      this.report(this.snapshot());
    });
  }

  forget(element) {
    if (!element || element.nodeType !== 1) return;
    this.processed.delete(element);
    const children = element.children || [];
    for (const child of children) this.forget(child);
  }

  collectLeaves(el, leaves) {
    if (!el || el.nodeType !== 1) return;
    const upperTag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (upperTag === "SVG") {
      // SVG is layout, but its text family carries real user-facing strings
      // (Qwen model badges, chart labels). Register the svg as a leaf marker
      // so unit resolution maps it onto its block ancestor; collectTree then
      // extracts the text nodes safely via collectSvgText — never the markup.
      if (this.hasSvgText(el)) leaves.push(el);
      return;
    }
    if (SKIP_LEAF.has(upperTag)) return;
    let direct = false;
    const children = el.childNodes || [];
    for (const child of children) {
      if (child.nodeType === 3) {
        if (significantText(child.data)) direct = true;
      } else if (child.nodeType === 1) {
        this.collectLeaves(child, leaves);
      }
    }
    // Open shadow roots are invisible to childNodes but hold real content on
    // web-component-heavy pages; descend into them when exposed.
    if (el.shadowRoot) {
      for (const child of el.shadowRoot.childNodes || []) {
        if (child.nodeType === 3) {
          if (significantText(child.data)) direct = true;
        } else if (child.nodeType === 1) {
          this.collectLeaves(child, leaves);
        }
      }
    }
    if (direct) leaves.push(el);
  }

  /**
   * Compile the adapter's unit-boundary selectors into one matcher string.
   * Pure — no DOM probe (a throwaway element here polluted smoke-test style
   * counting). Selector validity is enforced at first use in nearestBlock,
   * where a throw permanently disables hint matching for this engine.
   */
  compileUnitHints() {
    const hints = this.adapter && this.adapter.unitHints;
    if (!Array.isArray(hints) || hints.length === 0) return "";
    return hints.join(",");
  }

  nearestBlock(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      if (node === this.root) return null;
      const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
      if (LANDMARK_TAGS.has(tag)) return null;
      if (BLOCK_TAGS.has(tag)) return node;
      // Custom elements (e.g. <chat-message>) act as block boundaries so that
      // web-component layouts form per-component units instead of collapsing
      // into one page-sized unit.
      if (tag.includes("-")) return node;
      // Adapter-declared message containers (data-testid roles, framework
      // class names) are unit boundaries when standard tags and custom
      // elements miss them — e.g. span/class-based streaming containers.
      if (this.hintSelector) {
        try {
          if (node.matches && node.matches(this.hintSelector)) return node;
        } catch {
          // An adapter shipped an invalid selector: disable hints for this
          // engine's lifetime instead of throwing on every leaf.
          this.hintSelector = "";
        }
      }
      node = node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null;
    }
    return null;
  }

  /**
   * Choose the paragraph unit for a leaf element. Falls back to the leaf
   * itself when the only block ancestor is the engine root, which prevents
   * unrelated subtrees from being merged into one page-wide unit on DOM
   * structures without semantic block elements.
   */
  resolveUnit(leaf) {
    const block = this.nearestBlock(leaf);
    if (block && block !== this.root && !LANDMARK_TAGS.has(String(block.tagName || "").toUpperCase())) return block;
    // Structureless-DOM fallback: a leaf whose only block ancestor is the
    // engine root previously became its own unit, so short fragments (list
    // rows, streaming chunks) were analyzed in isolation with unstable
    // direction results. Grouping them under their shared parent keeps
    // related fragments in one paragraph unit.
    const parent = leaf.parentNode;
    if (parent && parent.nodeType === 1 && parent !== this.root && !LANDMARK_TAGS.has(String(parent.tagName || "").toUpperCase())) return parent;
    return leaf.nodeType === 1 ? leaf : null;
  }

  processSubtree(el, isRescan = false) {
    if (!this.running || !el || el.nodeType !== 1) return;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const leaves = [];
    try {
      this.collectLeaves(el, leaves);
    } catch (error) {
      this.noteError(error);
      return;
    }
    if (leaves.length === 0) {
      this.report(this.snapshot());
      return;
    }
    const units = new Map();
    for (const leaf of leaves) {
      const unit = this.resolveUnit(leaf);
      if (unit && !units.has(unit)) units.set(unit, true);
    }
    // Innermost units first: a container processed before its inner block
    // would collect (and re-transform) the inner unit's text nodes, and its
    // merged analysis would mix two paragraphs into one direction decision.
    // Depth-sorted processing keeps every text node owned by exactly one
    // unit per pass.
    const ordered = [...units.keys()].sort((a, b) => this.unitDepth(b) - this.unitDepth(a));
    for (const unit of ordered) {
      try {
        this.processUnit(unit, isRescan);
      } catch (error) {
        // One malformed unit must never abort the whole page scan.
        this.noteError(error);
      }
    }
    const elapsed =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    this.scanCount = (this.scanCount || 0) + 1;
    this.lastScanMs = elapsed;
    this.report(this.snapshot());
  }

  noteError(error) {
    const classified = classifyError(error);
    this.errors.push(classified);
    if (this.errors.length > 50) this.errors.shift();
    try {
      globalErrors.captureException(error, {
        subsystem: SUBSYSTEMS.ENGINE,
        title: classified.kind,
      });
    } catch {}
  }

  collectTree(unit) {
    const nodes = [];
    const codes = [];
    const walk = (el) => {
      const children = el.childNodes || [];
      for (const child of children) {
        if (child.nodeType === 3) {
          nodes.push(child);
          continue;
        }
        if (child.nodeType !== 1) continue;
        if (child !== unit && this.processed.has(child)) continue;
        // SVG/MathML elements keep lowercase tagNames in real DOMs while the
        // fake test DOM uppercases everything — normalize before set checks.
        const tag = String(child.tagName || "").toUpperCase();
        if (SKIP_SUBTREE.has(tag)) {
          if (BLOCK_CODE.has(tag) && this.settings.forceCodeLtr) codes.push(child);
          // SVG is skipped as layout, but its <text>-family nodes carry real
          // content. Descend only into those, collecting text nodes only, so
          // writes below stay pure text-node edits and can never corrupt
          // markup — while svg-embedded <style>/<script> stay protected.
          if (tag === "SVG") this.collectSvgText(child, nodes);
          continue;
        }
        if (INLINE_CODE.has(tag)) {
          if (this.settings.forceCodeLtr) codes.push(child);
          continue;
        }
        walk(child);
      }
      // Open shadow roots hold real content on web-component-heavy pages.
      // The unit's own shadowRoot must be walked too: custom elements are
      // unit boundaries in nearestBlock(), and excluding them here meant
      // every shadow-hosted block was silently never processed.
      if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(unit);
    return { nodes, codes };
  }

  /** True when an SVG subtree contains text inside its text-family elements. */
  hasSvgText(el) {
    const walk = (node) => {
      const children = node.childNodes || [];
      for (const child of children) {
        if (child.nodeType === 3) {
          if (significantText(child.data)) return true;
        } else if (child.nodeType === 1) {
          const tag = String(child.tagName || "").toUpperCase();
          if (SVG_TEXT_TAGS.has(tag) && walk(child)) return true;
        }
      }
      return false;
    };
    return walk(el);
  }

  /** Collect text nodes inside an SVG subtree, restricted to text elements. */
  collectSvgText(el, nodes) {
    const walkSvg = (node) => {
      const children = node.childNodes || [];
      for (const child of children) {
        if (child.nodeType === 3) {
          nodes.push(child);
          continue;
        }
        if (child.nodeType !== 1) continue;
        if (SVG_TEXT_TAGS.has(String(child.tagName || "").toUpperCase())) walkSvg(child);
      }
    };
    walkSvg(el);
  }

  processUnit(unit, rescan = false) {
    if (!this.running || !unit || unit.nodeType !== 1) return;
    if (unit.isConnected === false) return;
    if (!this.settings.processEditable && unit.isContentEditable) return;

    // An author-set dir only settles the block's DIRECTION — it must not
    // veto typography repair. ChatGPT/Claude message containers ship
    // dir="auto" and Persian blogs ship dir="rtl", so the previous blanket
    // skip disabled the whole pipeline exactly on the flagship platforms.
    let authorDir = false;
    let authorDirValue = "";
    try {
      if (unit.hasAttribute && unit.hasAttribute("dir")) {
        authorDir = true;
        authorDirValue = String(unit.getAttribute("dir") || "").toLowerCase();
      }
    } catch (error) {
      this.noteError(error);
      return;
    }

    const { nodes, codes } = this.collectTree(unit);
    if (nodes.length === 0) {
      if (this.unitState.has(unit)) {
        this.resetUnit(unit);
        if (this.rtlCounted.has(unit)) {
          this.rtlCounted.delete(unit);
          this.stats.rtlBlocks = Math.max(0, this.stats.rtlBlocks - 1);
        }
      }
      return;
    }
    const merged = nodes.map((node) => node.data).join(" ");
    const state = this.unitState.get(unit);

    // If this unit was already processed and this is not a force-rescan:
    // Check if the unit's text has actually changed. If text matches our previous
    // record, nothing new was streamed or edited; we can safely early-return.
    if (this.processed.has(unit) && !rescan && state) {
      if (merged === state.lastInputText || merged === state.lastProcessedText) {
        return;
      }
    }
    this.processed.add(unit);
    const analysis = analyzeText(merged);
    // Every detected text unit is a paragraph; RTL blocks are the subset
    // whose resolved direction is right-to-left. Counting both in one place
    // keeps the popup's coverage ring meaningful (previously the counters
    // moved in lockstep, pinning coverage at a meaningless 100%).
    if (!this.countedUnits.has(unit)) {
      this.countedUnits.add(unit);
      if (analysis.letters > 0) this.stats.paragraphs++;
    }

    let direction = "ltr";
    if (this.settings.directionMode === "rtl") {
      direction = "rtl";
    } else if (this.settings.directionMode === "ltr") {
      direction = "ltr";
    } else {
      direction =
        this.settings.mostlyRtl === false
          ? analysis.firstStrong || "ltr"
          : resolveDirectionSmart(merged, "ltr");
    }

    const forcedRtl = this.settings.directionMode === "rtl";
    const forcedLtr = this.settings.directionMode === "ltr";
    const isRtl = !forcedLtr && (forcedRtl || (direction === "rtl" && (analysis.rtl > 0 || forcedRtl)));

    // On generic sites in Auto mode, an explicit author dir="ltr" on a paragraph is respected.
    // On AI chat platforms (Claude, DeepSeek, ChatGPT...), UI shells often ship dir="ltr"
    // by default, which must not prevent formatting Persian chat responses.
    const authorForcedLtr =
      !forcedRtl &&
      (!this.adapter || this.adapter.id === "generic") &&
      authorDirValue === "ltr";

    if (isRtl && !authorForcedLtr) {
      this.recordUnitState(unit);

      // Layout protection: setting dir on a bare flex/grid container reverses
      // the visual order of its children (avatars, icons, action buttons).
      // Structural protection should NOT apply to list items (LI) or text blocks.
      const upperTag = String(unit.tagName || "").toUpperCase();
      const display = this.computeDisplay ? String(this.computeDisplay(unit)) : "";
      const structural = (/^(inline-)?(flex|grid)$/.test(display) || display === "table") && upperTag !== "LI";
      const skipDirection = !forcedRtl && this.settings.layoutSafe !== false && structural;

      if (!skipDirection) {
        if (unit.getAttribute("dir") !== "rtl") {
          this.patches.setAttribute(unit, "dir", "rtl");
        }
        if (this.settings.alignRtl) {
          const centered = this.settings.keepCenter && this.computeAlign(unit) === "center";
          const targetCls = centered ? "rtlm-center" : "rtlm-align";
          const currentClasses = this.unitState.get(unit).classes;
          if (!currentClasses.includes(targetCls)) {
            this.applyUnitClass(unit, targetCls);
          }
        }

        // List & Ordered Marker Synchronization for Persian:
        // Synchronize dir="rtl" and rtlm-align onto enclosing LI and list containers (OL/UL).
        // This guarantees ordered numbers (1., 2., 3.) and bullet points (•) render on the right.
        const enclosingLi = upperTag === "LI" ? unit : findAncestor(unit, LIST_ITEMS);
        if (enclosingLi && enclosingLi !== unit) {
          const unitRecord = this.unitState.get(unit);
          if (enclosingLi.getAttribute?.("dir") !== "rtl") {
            this.patches.setAttribute(enclosingLi, "dir", "rtl");
            unitRecord.attached.push({ el: enclosingLi, dir: true });
          }
          if (!enclosingLi.classList?.contains("rtlm-align")) {
            this.patches.addClass(enclosingLi, "rtlm-align");
            unitRecord.attached.push({ el: enclosingLi, cls: "rtlm-align" });
          }
        }
        const enclosingList = findAncestor(enclosingLi || unit, LIST_CONTAINERS);
        if (enclosingList && (forcedRtl || (this.adapter && this.adapter.id !== "generic"))) {
          const unitRecord = this.unitState.get(unit);
          if (enclosingList.getAttribute?.("dir") !== "rtl") {
            this.patches.setAttribute(enclosingList, "dir", "rtl");
            unitRecord.attached.push({ el: enclosingList, dir: true });
          }
          if (!enclosingList.classList?.contains("rtlm-align")) {
            this.patches.addClass(enclosingList, "rtlm-align");
            unitRecord.attached.push({ el: enclosingList, cls: "rtlm-align" });
          }
        }
      } else if (this.settings.alignRtl) {
        // Layout protection for flex/grid: outer container keeps its layout,
        // but direct children containing Persian text receive dir="rtl" and rtlm-align.
        const unitRecord = this.unitState.get(unit);
        for (const node of nodes) {
          const parent = node.parentElement || node.parentNode;
          if (parent && parent !== unit && parent.isConnected !== false && parent.nodeType === 1) {
            if (parent.getAttribute("dir") !== "rtl") {
              this.patches.setAttribute(parent, "dir", "rtl");
              unitRecord.attached.push({ el: parent, dir: true });
            }
            if (!parent.classList.contains("rtlm-align")) {
              this.patches.addClass(parent, "rtlm-align");
              unitRecord.attached.push({ el: parent, cls: "rtlm-align" });
            }
          }
        }
      }

      if (this.settings.forceCodeLtr) {
        for (const code of codes) {
          const cls = BLOCK_CODE.has(String(code.tagName || "").toUpperCase())
            ? "rtlm-block-ltr"
            : "rtlm-ltr";
          if (!code.classList?.contains(cls)) {
            this.patches.addClass(code, cls);
            this.unitState.get(unit).codes.push({ el: code, cls });
          }
        }
      }
      if (!this.rtlCounted.has(unit)) {
        this.rtlCounted.add(unit);
        this.stats.rtlBlocks++;
      }
      if (this.fontActive()) {
        const currentClasses = this.unitState.get(unit).classes;
        if (!currentClasses.includes("rtlm-font")) {
          this.applyUnitClass(unit, "rtlm-font");
        }
      }
    } else {
      // Revert styling smoothly if previously marked RTL without unstyled flicker
      if (this.unitState.has(unit)) {
        this.resetUnit(unit);
        if (this.rtlCounted.has(unit)) {
          this.rtlCounted.delete(unit);
          this.stats.rtlBlocks = Math.max(0, this.stats.rtlBlocks - 1);
        }
      }
      if (forcedLtr && this.fontActive()) {
        this.recordUnitState(unit);
        const currentClasses = this.unitState.get(unit).classes;
        if (!currentClasses.includes("rtlm-font")) {
          this.applyUnitClass(unit, "rtlm-font");
        }
      }
    }

    // In forced LTR, the entire UI structure is optimized for English and only font is applied
    if (forcedLtr || (analysis.rtl === 0 && !forcedRtl)) return;

    let processedText = merged;
    const context = { persian: looksPersian(merged), direction };
    for (const node of nodes) {
      const result = transformText(node.data, this.settings, context);
      if (result.changed && this.patches.setText(node, result.text)) {
        this.written.set(node, result.text);
        this.stats.textEdits++;
      }
    }
    processedText = nodes.map((node) => node.data).join(" ");
    const finalState = this.unitState.get(unit);
    if (finalState) {
      finalState.lastInputText = merged;
      finalState.lastProcessedText = processedText;
    }
  }

  recordUnitState(unit) {
    if (!this.unitState.has(unit)) {
      this.unitState.set(unit, { classes: [], codes: [], attached: [] });
    }
  }

  /** True when any page-font styling (family, weight or size) is active. */
  fontActive() {
    const family = this.settings.pageFont;
    if (family && family !== "default") return true;
    if (String(this.settings.pageFontWeight) !== "auto") return true;
    return Number(this.settings.pageFontSize) !== 100;
  }

  applyUnitClass(unit, cls) {
    this.patches.addClass(unit, cls);
    this.unitState.get(unit).classes.push(cls);
  }

  resetUnit(unit) {
    const state = this.unitState.get(unit);
    if (!state) return;
    try {
      if (unit.getAttribute && unit.getAttribute("dir") === "rtl") {
        unit.removeAttribute("dir");
      }
    } catch {}
    for (const cls of state.classes) {
      try {
        unit.classList.remove(cls);
      } catch {}
    }
    for (const { el, cls } of state.codes) {
      try {
        el.classList.remove(cls);
      } catch {}
    }
    if (Array.isArray(state.attached)) {
      for (const item of state.attached) {
        try {
          if (item.dir && item.el?.getAttribute?.("dir") === "rtl") {
            item.el.removeAttribute("dir");
          }
          if (item.cls && item.el?.classList) {
            item.el.classList.remove(item.cls);
          }
        } catch {}
      }
    }
    this.unitState.delete(unit);
  }

  enableInputs() {
    const selectors = [
      ...(this.adapter.inputSelectors || []),
      "textarea",
      "input:not([type])",
      "input[type='text']",
      "input[type='search']",
      "input[type='url']",
      "[contenteditable='true']",
    ];
    const selector = Array.from(new Set(selectors)).join(",");
    const doc = this.root.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc || !doc.addEventListener) return;
    this.inputHandler = (event) => {
      const el = event.target;
      if (!el || el.nodeType !== 1) return;
      const target = el.matches && el.matches(selector) ? el : (el.closest ? el.closest(selector) : null);
      if (!target) return;
      this.applyInputDirection(target);
      if (el !== target && el.tagName === "P") {
        this.applyInputDirection(el);
      }
    };
    doc.addEventListener("input", this.inputHandler, true);
    doc.addEventListener("focusin", this.inputHandler, true);
    doc.addEventListener("keyup", this.inputHandler, true);
    if (this.root.querySelectorAll) {
      for (const el of this.root.querySelectorAll(selector)) this.applyInputDirection(el);
    }
  }

  applyInputDirection(el) {
    const value = typeof el.value === "string" ? el.value : el.textContent || "";
    if (!significantText(value)) {
      if (this.trackedInputs.has(el)) {
        const style = el.style;
        if (style) {
          try {
            if (style.removeProperty) {
              style.removeProperty("direction");
              style.removeProperty("text-align");
            } else {
              delete style.direction;
              delete style.textAlign;
            }
          } catch {}
        }
        if (this.fontInputs.has(el)) {
          try {
            el.classList.remove("rtlm-font");
          } catch {}
          this.fontInputs.delete(el);
        }
      }
      return;
    }
    const dir = resolveDirection(value, "ltr");
    const align = dir === "rtl" ? "right" : "left";
    const style = el.style;
    if (
      style &&
      style.getPropertyValue &&
      style.getPropertyValue("direction") === dir &&
      style.getPropertyValue("text-align") === align
    ) {
      return;
    }
    this.patches.setStyle(el, "direction", dir);
    this.patches.setStyle(el, "text-align", align);
    if (this.fontActive()) {
      if (dir === "rtl") {
        this.patches.addClass(el, "rtlm-font");
        this.fontInputs.add(el);
      } else if (this.fontInputs.has(el)) {
        try {
          el.classList.remove("rtlm-font");
        } catch {}
        this.fontInputs.delete(el);
      }
    }
    if (!this.trackedInputs.has(el)) {
      this.trackedInputs.add(el);
      this.stats.inputs++;
    }
  }
}
