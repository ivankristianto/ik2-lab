// Just enough DOM for render.js to run under node --test, so renderer behaviour is tested without a browser or a dependency.
class Style {
  #props = new Map();
  setProperty(name, value) { this.#props.set(name, String(value)); }
  getPropertyValue(name) { return this.#props.get(name) ?? ''; }
}

class Text {
  constructor(text) { this.data = String(text); this.parentNode = null; }
  get textContent() { return this.data; }
}

class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.style = new Style();
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.open = false;
  }

  get id() { return this.getAttribute('id') ?? ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', v); }
  get children() { return this.childNodes.filter((n) => n instanceof Element); }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === this.ownerDocument.body;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, force) {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
    return on;
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = node instanceof Element || node instanceof Text ? node : new Text(node);
      if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }

  appendChild(node) { this.append(node); return node; }

  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }

  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, extra = {}) {
    const event = { type, target: this, preventDefault() {}, ...extra };
    for (const fn of this.listeners.get(type) || []) fn(event);
  }

  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }

  /** Every element below this one, depth first. */
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }

  // Only what render.js asks for: comma-separated tag names.
  querySelector(selector) {
    const tags = selector.split(',').map((t) => t.trim().toUpperCase());
    return this.all().find((n) => tags.includes(n.tagName)) || null;
  }
}

export function installDom() {
  const doc = {
    activeElement: null,
    createElement: (tag) => new Element(tag, doc),
  };
  doc.body = new Element('body', doc);
  doc.activeElement = doc.body;
  globalThis.document = doc;
  return doc;
}

/** Elements under root whose class list has every given class. */
export const byClass = (root, ...names) => root.all().filter((n) => names.every((c) => n.className.split(/\s+/).includes(c)));
