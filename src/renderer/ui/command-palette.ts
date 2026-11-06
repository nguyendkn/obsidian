import { PromptModal } from './prompt-modal';
import type { App } from '../core/app';

/** Cmd/Ctrl+P: fuzzy search over the command registry. */
export class CommandPalette extends PromptModal {
  constructor(app: App) {
    super(app, {
      placeholder: 'Type a command…',
      getItems: () =>
        app.commands.listCommands().map((command) => ({
          id: command.id,
          label: command.name,
          hint: command.id,
          action: () => app.commands.executeCommandById(command.id),
        })),
    });
  }
}
