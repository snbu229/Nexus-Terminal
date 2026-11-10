export interface OpenOptions {
  cols: number;
  rows: number;
}

/** A live terminal: one shell on one PTY. Output is raw bytes (not necessarily valid UTF-8 on a chunk boundary). */
export interface TerminalProvider {
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  onData(cb: (data: Uint8Array) => void): void;
  /** Called once with the shell exit code (128+signal when killed). */
  onExit(cb: (code: number) => void): void;
  /** Stops the shell (if running) and releases resources. Idempotent. */
  close(): Promise<void>;
}

/** A factory for terminals of one kind. */
export interface TerminalProviderFactory {
  open(opts: OpenOptions): Promise<TerminalProvider>;
}
