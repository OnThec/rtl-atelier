export class FakeStyle {
  constructor() {
    this.props = new Map();
  }

  get direction() {
    return this.props.get("direction") || "";
  }

  set direction(val) {
    if (val) this.props.set("direction", val);
    else this.props.delete("direction");
  }

  get textAlign() {
    return this.props.get("text-align") || "";
  }

  set textAlign(val) {
    if (val) this.props.set("text-align", val);
    else this.props.delete("text-align");
  }

  getPropertyValue(prop) {
    return this.props.get(prop) || "";
  }

  setProperty(prop, value) {
    this.props.set(prop, value);
  }

  removeProperty(prop) {
    this.props.delete(prop);
  }
}

export class FakeClassList {
  constructor() {
    this.set = new Set();
  }

  add(...names) {
    for (const name of names) this.set.add(name);
  }

  remove(...names) {
    for (const name of names) this.set.delete(name);
  }

  contains(name) {
    return this.set.has(name);
  }

  toggle(name, force) {
    const shouldAdd = typeof force === "boolean" ? force : !this.contains(name);
    if (shouldAdd) this.add(name);
    else this.remove(name);
    return shouldAdd;
  }
}

export class FakeText {
  constructor(data) {
    this.data = data;
    this.nodeType = 3;
    this.parentNode = null;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
}

export class FakeDocument {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    if (this.listeners.has(type)) this.listeners.get(type).delete(fn);
  }

  dispatchEvent(evt) {
    const set = this.listeners.get(evt.type);
    if (set) {
      for (const fn of set) fn(evt);
    }
  }
}

export class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.childNodes = [];
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.parentNode = null;
    this.isContentEditable = false;
    this.ownerDocument = new FakeDocument();
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.ownerDocument = this.ownerDocument;
      this.childNodes.push(node);
    }
    return this;
  }

  appendChild(node) {
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument;
    this.childNodes.push(node);
    return node;
  }

  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  remove() {
    if (this.parentNode && typeof this.parentNode.removeChild === "function") {
      this.parentNode.removeChild(this);
    }
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  get textContent() {
    return this.childNodes
      .map((node) => (node.nodeType === 3 ? node.data : node.textContent))
      .join("");
  }

  set textContent(value) {
    const textNode = new FakeText(String(value ?? ""));
    textNode.parentNode = this;
    textNode.ownerDocument = this.ownerDocument;
    this.childNodes = [textNode];
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.childNodes || []) {
        if (child.nodeType === 1) {
          results.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return results;
  }

  getBoundingClientRect() {
    return {
      top: 100,
      bottom: 200,
      left: 0,
      right: 500,
      width: 500,
      height: 100,
    };
  }

  matches(selector) {
    if (!selector) return false;
    const parts = selector.split(",").map((s) => s.trim());
    for (const part of parts) {
      if (part === "*" || part.toUpperCase() === this.tagName) return true;
      if (part.startsWith(".") && this.classList.contains(part.slice(1))) return true;
      if (part.startsWith("#") && this.getAttribute("id") === part.slice(1)) return true;
      if (part.startsWith("[") && part.endsWith("]")) {
        const attrContent = part.slice(1, -1);
        if (attrContent.includes("=")) {
          const [name, val] = attrContent.split("=");
          const cleanVal = val.replace(/['"]/g, "");
          if (this.getAttribute(name) === cleanVal) return true;
        } else if (this.hasAttribute(attrContent)) {
          return true;
        }
      }
    }
    return false;
  }

  closest(selector) {
    let curr = this;
    while (curr && curr.nodeType === 1) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }
}

export function el(tag, ...children) {
  const element = new FakeElement(tag);
  element.append(...children);
  return element;
}

export function text(data) {
  return new FakeText(data);
}
