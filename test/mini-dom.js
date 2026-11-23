const selectorCache = new Map();

const parseCompound = (compound) => {
  const parsed = { tag: null, id: null, classes: [], attrs: [] };
  let rest = compound;
  const tag = rest.match(/^([a-zA-Z][\w-]*)/);
  if (tag) {
    parsed.tag = tag[1].toLowerCase();
    rest = rest.slice(tag[0].length);
  }
  while (rest.length) {
    if (rest.startsWith('#')) {
      const value = rest.slice(1).match(/^[\w-]+/);
      if (!value) throw new Error(`Bad selector: ${compound}`);
      parsed.id = value[0];
      rest = rest.slice(value[0].length + 1);
    } else if (rest.startsWith('.')) {
      const value = rest.slice(1).match(/^[\w-]+/);
      if (!value) throw new Error(`Bad selector: ${compound}`);
      parsed.classes.push(value[0]);
      rest = rest.slice(value[0].length + 1);
    } else if (rest.startsWith('[')) {
      const end = rest.indexOf(']');
      if (end === -1) throw new Error(`Bad selector: ${compound}`);
      const body = rest.slice(1, end);
      const equals = body.indexOf('=');
      if (equals === -1) {
        parsed.attrs.push({ name: body.trim().toLowerCase(), value: null });
      } else {
        const name = body.slice(0, equals).trim().toLowerCase();
        let value = body.slice(equals + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        parsed.attrs.push({ name, value });
      }
      rest = rest.slice(end + 1);
    } else {
      throw new Error(`Bad selector: ${compound}`);
    }
  }
  return parsed;
};

const compile = (selector) => {
  if (selectorCache.has(selector)) return selectorCache.get(selector);
  const groups = selector.split(',')
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => group.split(/\s+/).map(parseCompound));
  selectorCache.set(selector, groups);
  return groups;
};

const matchesCompound = (element, compound) => {
  if (compound.tag && element.tagName !== compound.tag) return false;
  if (compound.id && element.getAttribute('id') !== compound.id) return false;
  for (const name of compound.classes) {
    if (!element.classList.contains(name)) return false;
  }
  for (const attr of compound.attrs) {
    if (!element.hasAttribute(attr.name)) return false;
    if (attr.value !== null && element.getAttribute(attr.name) !== attr.value) return false;
  }
  return true;
};

class MiniNode {
  constructor(nodeType, text = '') {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
    this._text = text;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === globalThis.document;
  }

  get textContent() {
    if (this.nodeType === 3) return this._text;
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    if (this.nodeType === 3) {
      this._text = String(value);
      return;
    }
    this.childNodes = [];
    if (value !== '') this.appendChild(new MiniText(String(value)));
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return true;
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  prepend(...children) {
    children.forEach((child) => {
      child.parentNode = this;
    });
    this.childNodes.unshift(...children);
  }

  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
    this.parentNode = null;
  }
}

class MiniText extends MiniNode {
  constructor(text) {
    super(3, text);
  }
}

class MiniElement extends MiniNode {
  constructor(tagName) {
    super(1);
    this.tagName = tagName.toLowerCase();
    this.attributes = new Map();
    this.rects = 1;
    this.disabled = false;
    this.clicks = 0;
    this.dataset = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
  }

  classNames() {
    return (this.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  }

  get classList() {
    const element = this;
    return {
      contains(name) {
        return element.classNames().includes(name);
      },
      add(...names) {
        const values = new Set(element.classNames());
        names.forEach((name) => values.add(name));
        element.setAttribute('class', [...values].join(' '));
      },
      remove(...names) {
        const values = new Set(element.classNames());
        names.forEach((name) => values.delete(name));
        element.setAttribute('class', [...values].join(' '));
      }
    };
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(value) {
    this.setAttribute('class', value);
  }

  getAttribute(name) {
    const key = name.toLowerCase();
    return this.attributes.has(key) ? this.attributes.get(key) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name.toLowerCase(), String(value));
  }

  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }

  getClientRects() {
    if (!this.rects) return [];
    let node = this.parentNode;
    while (node) {
      if (node.nodeType === 1 && (!node.rects || node.hasAttribute('hidden'))) return [];
      node = node.parentNode;
    }
    return [{}];
  }

  matches(selector) {
    for (const compounds of compile(selector)) {
      const last = compounds[compounds.length - 1];
      if (!matchesCompound(this, last)) continue;
      let current = this.parentElement;
      let index = compounds.length - 2;
      while (index >= 0 && current) {
        if (matchesCompound(current, compounds[index])) index -= 1;
        current = current.parentElement;
      }
      if (index < 0) return true;
    }
    return false;
  }

  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  click() {
    if (this.disabled) return;
    this.clicks += 1;
  }

  createElement(tagName) {
    return createElement(tagName);
  }

  createDocumentFragment() {
    return createElement('#fragment');
  }
}

class MiniVideoElement extends MiniElement {
  constructor() {
    super('video');
    this.paused = true;
    this.readyState = 4;
    this.duration = 0;
    this.currentTime = 0;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }
}

class MiniDocument extends MiniElement {
  constructor() {
    super('#document');
    this.documentElement = new MiniElement('html');
    this.body = new MiniElement('body');
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }
}

export const createElement = (tagName) => (
  tagName.toLowerCase() === 'video' ? new MiniVideoElement() : new MiniElement(tagName)
);
export const createText = (text) => new MiniText(text);

export const createDocument = () => new MiniDocument();

export const installDom = (document) => {
  globalThis.document = document;
  globalThis.Element = MiniElement;
  globalThis.HTMLVideoElement = MiniVideoElement;
};

export const uninstallDom = () => {
  delete globalThis.document;
  delete globalThis.Element;
  delete globalThis.HTMLVideoElement;
};

export { MiniElement };
