const SVG_NS = 'http://www.w3.org/2000/svg';

const applyAttributes = (element, attributes) => {
  for (const [key, value] of Object.entries(attributes || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'className') {
      element.setAttribute('class', value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([name, data]) => {
        element.dataset[name] = String(data);
      });
    } else if (key === 'textContent') {
      element.textContent = String(value);
    } else {
      element.setAttribute(key, value === true ? '' : String(value));
    }
  }
};

const appendChildren = (element, children) => {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    element.appendChild(
      typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child
    );
  }
};

export function createElement(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName);
  applyAttributes(element, attributes);
  appendChildren(element, children);
  return element;
}

export function createSvgElement(tagName, attributes = {}, children = []) {
  const element = document.createElementNS(SVG_NS, tagName);
  applyAttributes(element, attributes);
  appendChildren(element, children);
  return element;
}

export function append(parent, ...children) {
  appendChildren(parent, children);
  return parent;
}

export function clear(element) {
  if (!element) return element;
  element.replaceChildren();
  return element;
}

export default { createElement, createSvgElement, append, clear };
