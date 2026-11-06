import { Decoration, ViewPlugin, WidgetType, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { App } from '../core/app';
import { resourceUrl } from '../core/resource';

class ImageWidget extends WidgetType {
  constructor(private readonly src: string, private readonly alt: string) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src;
  }

  toDOM(): HTMLElement {
    const wrapper = createDiv({ cls: 'cm-inline-image' });
    const img = createEl('img', { attr: { src: this.src, alt: this.alt } });
    wrapper.append(img);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class WikiLinkWidget extends WidgetType {
  constructor(private readonly href: string, private readonly label: string) {
    super();
  }

  eq(other: WikiLinkWidget): boolean {
    return other.href === this.href && other.label === this.label;
  }

  toDOM(): HTMLElement {
    return createEl('a', { cls: 'internal-link', text: this.label, attr: { 'data-href': this.href } });
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Hides markdown syntax on non-active lines and renders embeds inline. */
export function livePreview(app: App, getSourcePath: () => string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const sourcePath = getSourcePath();
        const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;

        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            if (line.number !== cursorLine && line.length > 0) {
              this.decorateLine(builder, line, sourcePath);
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }

      decorateLine(
        builder: RangeSetBuilder<Decoration>,
        line: { from: number; text: string },
        sourcePath: string,
      ): void {
        const text = line.text;
        const add = (from: number, to: number, deco: Decoration) => {
          if (to > from) builder.add(line.from + from, line.from + to, deco);
        };

        const heading = /^(#{1,6})(\s+)/.exec(text);
        if (heading) add(0, heading[0].length, Decoration.replace({}));

        const listMarker = /^(\s*)([-*+]|\d+\.)\s/.exec(text);
        if (listMarker && !/\[[ xX-]\]/.test(text)) {
          add(0, listMarker[0].length, Decoration.replace({}));
        }

        const task = /^(\s*)([-*+])\s+\[([ xX-])\]\s/.exec(text);
        if (task) add(0, task[0].length - 1, Decoration.replace({}));

        for (const match of text.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
          const start = match.index ?? 0;
          const inner = match[2];
          const [target, alias] = inner.split('|');
          if (match[1]) {
            const src = resourceUrl(app, target, sourcePath);
            if (src) {
              add(start, start + match[0].length, Decoration.replace({ widget: new ImageWidget(src, target) }));
              continue;
            }
          }
          add(
            start,
            start + match[0].length,
            Decoration.replace({ widget: new WikiLinkWidget(target, alias ?? target) }),
          );
        }

        for (const match of text.matchAll(/(?<!!)\[([^\]]*)\]\(([^)]+)\)/g)) {
          const start = match.index ?? 0;
          add(start, start + match[0].length, Decoration.replace({ widget: new WikiLinkWidget(match[2], match[1] || match[2]) }));
        }

        for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
          const start = match.index ?? 0;
          const src = resourceUrl(app, match[2], sourcePath);
          if (src) add(start, start + match[0].length, Decoration.replace({ widget: new ImageWidget(src, match[1]) }));
        }

        for (const match of text.matchAll(/\*\*(.+?)\*\*/g)) {
          const start = match.index ?? 0;
          add(start, start + 2, Decoration.replace({}));
          add(start + match[0].length - 2, start + match[0].length, Decoration.replace({}));
        }

        for (const match of text.matchAll(/`([^`]+)`/g)) {
          const start = match.index ?? 0;
          add(start, start + 1, Decoration.replace({}));
          add(start + match[0].length - 1, start + match[0].length, Decoration.replace({}));
          builder.add(line.from + start + 1, line.from + start + match[0].length - 1, Decoration.mark({ class: 'cm-inline-code' }));
        }

        for (const match of text.matchAll(/(^|\s)(#[A-Za-z0-9_\-/]+)/g)) {
          const start = (match.index ?? 0) + match[1].length;
          builder.add(line.from + start, line.from + start + match[2].length, Decoration.mark({ class: 'cm-tag' }));
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
