/** Minimal typed event emitter, mirroring Obsidian's Events class. */
export class Events {
  private handlers = new Map<string, Set<(...args: any[]) => void>>();

  on(name: string, callback: (...args: any[]) => void, ctx?: unknown): void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(ctx ? callback.bind(ctx) : callback);
    this.handlers.set(name, set);
  }

  off(name: string, callback: (...args: any[]) => void): void {
    this.handlers.get(name)?.delete(callback);
  }

  offref(ref: { name: string; callback: (...args: any[]) => void }): void {
    this.off(ref.name, ref.callback);
  }

  trigger(name: string, ...args: any[]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[events] handler for "${name}" failed`, err);
      }
    }
  }
}
