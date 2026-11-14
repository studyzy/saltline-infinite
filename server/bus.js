// Tiny synchronous event bus for the authoritative simulation.

export class Bus {
  constructor() {
    this.handlers = new Map();
  }

  on(kind, fn) {
    let list = this.handlers.get(kind);
    if (!list) this.handlers.set(kind, (list = []));
    list.push(fn);
    return this;
  }

  emit(kind, payload) {
    const list = this.handlers.get(kind);
    if (!list) return;
    for (const fn of list) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] ${kind} handler threw`, err);
      }
    }
  }
}