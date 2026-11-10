/** Events a harness process reports. The registry assigns seq and timestamps; adapters never do. */
export type HarnessEvent =
  | { kind: 'running' }
  | { kind: 'output'; text: string }
  | { kind: 'tool_call'; tool: string; summary: string }
  | { kind: 'needs_input'; prompt: string }
  | { kind: 'checkpoint'; checkpoint: Checkpoint }
  | { kind: 'exit'; code: number; reason: 'completed' | 'stopped' | 'error' };

/** Opaque, JSON-serialisable adapter progress marker. Persisted by the registry. */
export interface Checkpoint {
  step: number;
}

/** Identifies a live harness process. Persisted so a restarted registry can look for the same process. */
export interface ProcessHandle {
  processId: string;
}

export type HarnessSink = (event: HarnessEvent) => void;

export interface StartRequest {
  sessionId: string;
  task: string;
  /** Non-null only when the registry is re-creating a dead process from saved progress. */
  checkpoint: Checkpoint | null;
}

export interface AgentHarnessAdapter {
  readonly id: string;
  readonly capabilities: { readonly resumeFromCheckpoint: boolean };
  start(req: StartRequest, sink: HarnessSink): Promise<ProcessHandle>;
  /** Is the exact process behind this handle still running? */
  probe(handle: ProcessHandle): Promise<'alive' | 'gone'>;
  /**
   * Re-connects a sink to a live process. Events produced while no sink was attached must be
   * delivered, in order, exactly once.
   */
  attach(handle: ProcessHandle, sink: HarnessSink): Promise<void>;
  /** Disconnects the sink; the process keeps running and buffers events. */
  detach(handle: ProcessHandle): void;
  /** Asks the process to stop. Resolves once it has reported its exit event. */
  stop(handle: ProcessHandle): Promise<void>;
}
