/** Per-session command history. Only confirmed, submitted drafts are pushed (never raw PTY keys). */

export interface HistoryOptions {
  max?: number;
}

export class History {
  private list: string[] = [];
  private readonly max: number;
  /** Index into the navigation list, or null when not navigating. */
  private cursor: number | null = null;
  private nav: string[] = [];
  private stash = '';

  constructor(opts: HistoryOptions = {}) {
    this.max = opts.max ?? 1000;
  }

  /** Oldest first. */
  get entries(): readonly string[] {
    return this.list;
  }

  push(command: string): void {
    this.reset();
    if (command.trim() === '') return;
    this.list = this.list.filter((c) => c !== command);
    this.list.push(command);
    if (this.list.length > this.max) this.list = this.list.slice(this.list.length - this.max);
  }

  /** Matching entries, newest first. */
  search(prefix: string): string[] {
    return this.list.filter((c) => c.startsWith(prefix)).reverse();
  }

  /**
   * Up. On the first call the current draft is stashed (never lost) and, with `prefix`,
   * the stashed text becomes the prefix filter. Returns the entry to show.
   */
  previous(currentDraft: string, opts: { prefix?: boolean } = {}): string {
    if (this.cursor === null) {
      this.stash = currentDraft;
      this.nav = opts.prefix ? [...this.search(currentDraft)].reverse() : [...this.list];
      this.cursor = this.nav.length;
    }
    if (this.nav.length === 0) return this.stash;
    this.cursor = Math.max(0, this.cursor - 1);
    return this.nav[this.cursor]!;
  }

  /** Down. Returns the next newer entry, then the stashed draft; null when not navigating. */
  next(): string | null {
    if (this.cursor === null) return null;
    this.cursor += 1;
    if (this.cursor >= this.nav.length) {
      const draft = this.stash;
      this.reset();
      return draft;
    }
    return this.nav[this.cursor]!;
  }

  /** Call when the user edits the recalled text. */
  reset(): void {
    this.cursor = null;
    this.nav = [];
    this.stash = '';
  }
}
