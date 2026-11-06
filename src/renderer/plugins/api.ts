import { App } from '../core/app';
import { Notice } from '../ui/notice';
import { Modal } from '../ui/modal';
import { Setting } from '../ui/setting';
import { Plugin, PluginSettingTab } from './plugin';
import { View, ItemView, FileView } from '../views/view';
import { TFile, TFolder, TAbstractFile, Vault } from '../core/vault';
import { Events } from '../core/events';
import { MarkdownView } from '../views/markdown-view';
import { renderMarkdown } from '../markdown/renderer';
import { setIcon } from '../core/dom';
import type { PluginManifest } from './plugin';

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isMacOS: navigator.platform.toLowerCase().includes('mac'),
  isWin: navigator.platform.toLowerCase().includes('win'),
  isLinux: navigator.platform.toLowerCase().includes('linux'),
};

export async function requestUrl(options: { url: string; method?: string; headers?: Record<string, string>; body?: string }) {
  const response = await fetch(options.url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text: await response.text(),
    json: await response.json().catch(() => null),
  };
}

export const MarkdownRenderer = {
  render: async (app: App, markdown: string, el: HTMLElement, sourcePath: string) => {
    renderMarkdown(app, markdown, el, sourcePath);
  },
};

/** Object handed to plugins as `require('obsidian')`. */
export function buildObsidianApi() {
  return {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    Modal,
    View,
    ItemView,
    FileView,
    TFile,
    TFolder,
    TAbstractFile,
    Vault,
    Events,
    MarkdownView,
    MarkdownRenderer,
    Platform,
    normalizePath,
    requestUrl,
    setIcon,
    debounce: <T extends (...args: any[]) => void>(fn: T, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    },
  };
}

export type ObsidianApi = ReturnType<typeof buildObsidianApi> & {
  PluginManifest: PluginManifest;
};
