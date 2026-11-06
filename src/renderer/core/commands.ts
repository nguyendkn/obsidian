import type { App } from './app';

export interface Command {
  id: string;
  name: string;
  callback: (...args: any[]) => any;
  hotkeys?: Array<{ modifiers: string[]; key: string }>;
  checkCallback?: (checking: boolean) => boolean | void;
}

/** Command registry + global hotkey dispatch. */
export class CommandManager {
  private commands = new Map<string, Command>();
  private elements: HTMLElement | null = null;

  constructor(private readonly app: App) {}

  addCommand(command: Command): Command {
    this.commands.set(command.id, command);
    return command;
  }

  removeCommand(id: string): void {
    this.commands.delete(id);
  }

  listCommands(): Command[] {
    return [...this.commands.values()];
  }

  findCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  executeCommandById(id: string): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    if (command.checkCallback) {
      if (command.checkCallback(false) === false) return false;
    }
    void command.callback();
    return true;
  }

  initialize(): void {
    this.registerHotkeys();
    this.elements = document.body;
  }

  private registerHotkeys(): void {
    window.addEventListener('keydown', (event) => {
      const parts: string[] = [];
      if (event.metaKey) parts.push('Mod');
      if (event.ctrlKey && !event.metaKey) parts.push('Ctrl');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');
      if (!parts.length) return;
      const combo = [...parts, event.key.toLowerCase()].join('+');
      for (const command of this.commands.values()) {
        for (const hotkey of command.hotkeys ?? []) {
          const candidate = [...hotkey.modifiers, hotkey.key.toLowerCase()].join('+');
          if (candidate === combo) {
            event.preventDefault();
            this.executeCommandById(command.id);
            return;
          }
        }
      }
    });
  }
}
