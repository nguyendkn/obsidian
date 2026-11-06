export interface DomElementInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  href?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  parent?: HTMLElement;
  prepend?: boolean;
}

type ChildSpec = string | Node | DomElementInfo;

function applyInfo(el: HTMLElement, info?: DomElementInfo): void {
  if (!info) return;
  if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
  if (info.text != null) el.textContent = info.text;
  if (info.title != null) el.setAttribute('title', info.title);
  if (info.href != null) el.setAttribute('href', info.href);
  if (info.attr) {
    for (const [key, value] of Object.entries(info.attr)) {
      if (value === null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, String(value));
    }
  }
  if (info.type != null) el.setAttribute('type', info.type);
  if (info.value != null) (el as HTMLInputElement).value = info.value;
  if (info.placeholder != null) el.setAttribute('placeholder', info.placeholder);
}

function appendChild(el: HTMLElement, child?: ChildSpec | ChildSpec[]): void {
  if (child == null) return;
  const items = Array.isArray(child) ? child : [child];
  for (const item of items) {
    if (typeof item === 'string') el.append(document.createTextNode(item));
    else if (item instanceof Node) el.append(item);
    else el.append(create('div', item));
  }
}

function create<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  info?: DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[T]) => void,
): HTMLElementTagNameMap[T] {
  const el = document.createElement(tag);
  const opts = typeof info === 'string' ? { cls: info } : info;
  applyInfo(el, opts);
  if (opts?.parent) {
    if (opts.prepend) opts.parent.prepend(el);
    else opts.parent.append(el);
  }
  if (typeof info === 'string') el.className = info;
  callback?.(el);
  return el;
}

export function createEl<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  info?: DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[T]) => void,
): HTMLElementTagNameMap[T] {
  return create(tag, info, callback);
}

export function createDiv(info?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void) {
  return create('div', info, callback);
}

export function createSpan(info?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void) {
  return create('span', info, callback);
}

export function appendChildren(parent: HTMLElement, children: ChildSpec[]): void {
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') parent.append(document.createTextNode(child));
    else if (child instanceof Node) parent.append(child);
    else {
      const el = create('div', child);
      parent.append(el);
    }
  }
}

export function empty(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function setIcon(el: HTMLElement, name: string): void {
  el.setAttribute('data-icon', name);
}

/** debounce helper used by editor saves. */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as T & { cancel(): void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export function installGlobals(): void {
  const g = globalThis as any;
  g.createEl = createEl;
  g.createDiv = createDiv;
  g.createSpan = createSpan;
  g.empty = empty;
  g.setIcon = setIcon;
}
