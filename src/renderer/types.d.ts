/** Runtime globals provided by Electron's nodeIntegration in the renderer. */
declare function require(id: string): any;
declare const module: { exports: any };
declare const __dirname: string;

declare function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  info?: import('./core/dom').DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K];
declare function createDiv(
  info?: import('./core/dom').DomElementInfo | string,
  callback?: (el: HTMLDivElement) => void,
): HTMLDivElement;
declare function createSpan(
  info?: import('./core/dom').DomElementInfo | string,
  callback?: (el: HTMLSpanElement) => void,
): HTMLSpanElement;
declare function empty(el: Element): void;

interface Window {
  require: (id: string) => any;
  process: NodeJS.Process;
  createEl: typeof import('./core/dom').createEl;
  createDiv: typeof import('./core/dom').createDiv;
  createSpan: typeof import('./core/dom').createSpan;
  __obsidianRuntime: unknown;
}
