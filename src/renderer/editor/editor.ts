import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { App } from '../core/app';
import { livePreview } from './live-preview';

export interface EditorOptions {
  app: App;
  sourcePath: () => string;
  onChange: (text: string) => void;
  onSave: () => void;
  livePreviewEnabled: boolean;
  showLineNumbers: boolean;
  lineWidth: number;
  onLinkClick?: (href: string) => void;
  onCheckboxToggle?: (line: number, checked: boolean) => void;
}

/** CodeMirror 6 wrapper tuned for markdown, with Obsidian-ish defaults. */
export class MarkdownEditor {
  view: EditorView;
  private themeCompartment = new Compartment();
  private options: EditorOptions;

  constructor(parent: HTMLElement, options: EditorOptions) {
    this.options = options;
    const app = options.app;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
    });

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          options.onSave();
          return true;
        },
      },
    ]);

    const clickHandler = EditorView.domEventHandlers({
      click: (event) => {
        const anchor = (event.target as HTMLElement).closest('a.internal-link, a.external-link');
        if (!anchor) return false;
        event.preventDefault();
        const href = anchor.getAttribute('data-href') ?? anchor.getAttribute('href') ?? '';
        options.onLinkClick?.(href);
        return true;
      },
      mousedown: (event) => {
        const checkbox = (event.target as HTMLElement).closest('input[type=checkbox]') as HTMLInputElement | null;
        if (!checkbox) return false;
        event.preventDefault();
        const line = this.view.state.doc.lineAt(this.view.posAtDOM(checkbox));
        options.onCheckboxToggle?.(line.number, checkbox.checked);
        return true;
      },
    });

    const extensions = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      saveKeymap,
      updateListener,
      clickHandler,
      this.themeCompartment.of(this.theme()),
      options.showLineNumbers ? lineNumbers() : [],
      options.livePreviewEnabled ? livePreview(app, options.sourcePath) : [],
    ];

    this.view = new EditorView({
      state: EditorState.create({ doc: '', extensions }),
      parent,
    });
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(text: string): void {
    if (text === this.getValue()) return;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  setCursor(line: number, col = 1): void {
    const doc = this.view.state.doc;
    const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
    const pos = Math.min(target.from + col - 1, target.to);
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  }

  focus(): void {
    this.view.focus();
  }

  reconfigure(options: Partial<EditorOptions>): void {
    this.options = { ...this.options, ...options };
    this.view.dispatch({ effects: this.themeCompartment.reconfigure(this.theme()) });
  }

  destroy(): void {
    this.view.destroy();
  }

  private theme() {
    return EditorView.theme({
      '&': { fontSize: `${this.options.app.config.getConfig().editor.fontSize}px`, height: '100%' },
      '.cm-scroller': { fontFamily: 'var(--font-text)', lineHeight: '1.65' },
      '.cm-content': {
        maxWidth: `${this.options.lineWidth}px`,
        margin: '0 auto',
        padding: '2rem 1rem 40vh',
        caretColor: 'var(--accent)',
      },
      '.cm-line': { padding: '0 2px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
    });
  }
}
