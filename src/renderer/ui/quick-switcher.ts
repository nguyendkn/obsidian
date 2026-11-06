import { PromptModal } from './prompt-modal';
import type { App } from '../core/app';

/** Cmd/Ctrl+O: jump to a note, or create it when the name is new. */
export class QuickSwitcher extends PromptModal {
  constructor(app: App) {
    super(app, {
      placeholder: 'Open or create a note…',
      getItems: () =>
        app.vault.getMarkdownFiles().map((file) => ({
          id: file.path,
          label: file.basename,
          hint: file.path,
          action: () => void app.workspace.openFile(file),
        })),
      onEmpty: (query) => {
        const name = query.trim();
        if (!name) return;
        void app.fileManager.createMarkdownFile(undefined, name);
      },
    });
  }
}
