export const TEXT_CAP = 8192;
export const ELEMENT_CAP = 12288;

export class PatchStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.elements = [];
    this.elementSet = new Set();
    this.textOriginals = new Map();
    this.classPatches = new Map();
    this.attrOriginals = new Map();
    this.styleOriginals = new Map();
    this.textEdits = 0;
  }

  _track(el) {
    if (this.elementSet.has(el)) return;
    this.elementSet.add(el);
    this.elements.push(el);
    if (this.elements.length > ELEMENT_CAP) this._dropOldest();
  }

  _dropOldest() {
    const dropped = this.elements.splice(0, this.elements.length - ELEMENT_CAP);
    for (const el of dropped) {
      this.elementSet.delete(el);
      this.classPatches.delete(el);
      this.attrOriginals.delete(el);
      this.styleOriginals.delete(el);
    }
  }

  _pruneTextOriginals() {
    while (this.textOriginals.size > TEXT_CAP) {
      const oldest = this.textOriginals.keys().next().value;
      this.textOriginals.delete(oldest);
    }
  }

  setText(node, text) {
    if (node.data === text) return false;
    const record = this.textOriginals.get(node);
    if (record) {
      if (node.data !== record.last) {
        // The page rewrote this node since our last patch (SPA in-place
        // update). Re-base: revert must only undo OUR edits on top of the
        // page's current content, never resurrect a stale pre-update text.
        record.original = node.data;
      }
      record.last = text;
    } else {
      this.textOriginals.set(node, { original: node.data, last: text });
      this._pruneTextOriginals();
    }
    node.data = text;
    this.textEdits++;
    return true;
  }

  addClass(el, cls) {
    this._track(el);
    let set = this.classPatches.get(el);
    if (!set) {
      set = new Set();
      this.classPatches.set(el, set);
    }
    set.add(cls);
    try {
      el.classList.add(cls);
    } catch {}
  }

  setAttribute(el, name, value) {
    this._track(el);
    let map = this.attrOriginals.get(el);
    if (!map) {
      map = new Map();
      this.attrOriginals.set(el, map);
    }
    if (!map.has(name)) {
      map.set(name, el.hasAttribute && el.hasAttribute(name) ? el.getAttribute(name) : null);
    }
    try {
      el.setAttribute(name, value);
    } catch {}
  }

  setStyle(el, prop, value) {
    this._track(el);
    let map = this.styleOriginals.get(el);
    if (!map) {
      map = new Map();
      this.styleOriginals.set(el, map);
    }
    const style = el.style || {};
    if (!map.has(prop)) {
      map.set(prop, style.getPropertyValue ? style.getPropertyValue(prop) : style[prop] || "");
    }
    try {
      if (style.setProperty) style.setProperty(prop, value);
      else style[prop] = value;
    } catch {}
  }

  revertAll() {
    for (const [node, record] of this.textOriginals) {
      try {
        // Only restore while the node still holds exactly what we last wrote.
        // If the page replaced the text since (SPA in-place updates), the
        // stored original is stale and restoring it would destroy live
        // content — leave the page's text alone.
        if (node.data === record.last) node.data = record.original;
      } catch {}
    }
    for (const el of this.elements) {
      const classes = this.classPatches.get(el);
      if (classes) {
        for (const cls of classes) {
          try {
            el.classList.remove(cls);
          } catch {}
        }
      }
      const attrs = this.attrOriginals.get(el);
      if (attrs) {
        for (const [name, original] of attrs) {
          try {
            if (original === null) {
              if (el.removeAttribute) el.removeAttribute(name);
            } else {
              el.setAttribute(name, original);
            }
          } catch {}
        }
      }
      const styles = this.styleOriginals.get(el);
      const style = el.style;
      if (styles && style) {
        for (const [prop, original] of styles) {
          try {
            if (!original) {
              if (style.removeProperty) style.removeProperty(prop);
              else delete style[prop];
            } else if (style.setProperty) {
              style.setProperty(prop, original);
            } else {
              style[prop] = original;
            }
          } catch {}
        }
      }
    }
    this.reset();
  }

  get size() {
    return this.elements.length;
  }
}
