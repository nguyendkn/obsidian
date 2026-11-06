import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import Prism from 'prismjs';
import type { App } from '../core/app';
import { resourceUrl } from '../core/resource';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(code: string, lang: string): string {
    if (lang && Prism.languages[lang]) {
      try {
        return `<pre class="language-${lang}"><code class="language-${lang}">${Prism.highlight(
          code,
          Prism.languages[lang],
          lang,
        )}</code></pre>`;
      } catch {
        // fall through to escaping
      }
    }
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  },
})
  .use(taskLists, { enabled: true })
  .use(footnote);

/** Raw HTML is enabled, so we sanitize the obvious script vectors. */
function sanitize(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Turn `[[wikilinks]]` and `![[embeds]]` into anchors/images, skipping code
 * fences and inline code so literal syntax survives.
 */
export function preprocessWikiLinks(app: App, source: string, sourcePath: string): string {
  const lines = source.split('\n');
  let inFence = false;
  let fence = '';
  const out = lines.map((line) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fence = fenceMatch[1][0];
      } else if (fenceMatch[1][0] === fence) {
        inFence = false;
      }
      return line;
    }
    if (inFence) return line;

    // Split on inline-code spans and only transform the text outside them.
    return line
      .split(/(`[^`]*`)/g)
      .map((segment, index) => {
        if (index % 2 === 1) return segment;
        return segment.replace(/(!?)\[\[([^\]]+)\]\]/g, (_match, bang: string, inner: string) => {
          const [target, alias] = inner.split('|');
          if (bang) {
            const src = resourceUrl(app, target, sourcePath);
            return src
              ? `<img class="internal-embed" src="${src}" alt="${escapeAttr(target)}">`
              : `<span class="internal-embed is-missing">${escapeHtml(inner)}</span>`;
          }
          return `<a class="internal-link" data-href="${escapeAttr(target)}">${escapeHtml(alias ?? target)}</a>`;
        });
      })
      .join('');
  });
  return out.join('\n');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

export interface RenderContext {
  sourcePath: string;
  docId: string;
}

/** Render markdown into `el`, then run core and plugin post-processors. */
export function renderMarkdown(app: App, source: string, el: HTMLElement, sourcePath: string): void {
  const withoutFrontmatter = stripFrontmatter(source);
  const html = md.render(preprocessWikiLinks(app, withoutFrontmatter, sourcePath));
  el.innerHTML = sanitize(html);
  el.classList.add('markdown-rendered');

  addExternalLinkIcons(el);
  addCopyButtons(el);

  const ctx: RenderContext = { sourcePath, docId: `doc-${Math.random().toString(36).slice(2)}` };
  for (const processor of app.plugins.postProcessors) {
    try {
      void processor(el, { ...ctx, frontmatter: app.metadataCache.getCache(sourcePath)?.frontmatter, addChild: () => {} });
    } catch (err) {
      console.error('[markdown] post-processor failed', err);
    }
  }
}

function stripFrontmatter(source: string): string {
  if (!source.startsWith('---')) return source;
  const end = source.indexOf('\n---', 3);
  if (end === -1) return source;
  return source.slice(source.indexOf('\n', end + 1) + 1);
}

function addExternalLinkIcons(el: HTMLElement): void {
  for (const anchor of el.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (/^https?:/i.test(anchor.getAttribute('href') ?? '')) {
      anchor.classList.add('external-link');
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener');
    }
  }
}

function addCopyButtons(el: HTMLElement): void {
  for (const pre of el.querySelectorAll('pre')) {
    const button = createEl('button', { cls: 'copy-code-button', text: 'Copy' });
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? pre.textContent ?? '');
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy'), 1200);
    });
    pre.append(button);
  }
}

/** Shared instance for plugins that call MarkdownRenderer.render. */
export { md as markdownIt };
