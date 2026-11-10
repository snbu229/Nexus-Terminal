import { randomUUID } from 'node:crypto';
import type {
  AgentHarnessAdapter,
  Checkpoint,
  HarnessEvent,
  HarnessSink,
  ProcessHandle,
  StartRequest,
} from './adapter.js';

export interface MockAdapterOptions {
  /** Delay between scripted steps. */
  stepDelayMs?: number;
  /** How long the scripted needs_input pause lasts before the mock carries on (contract v0 has no input route). */
  needsInputMs?: number;
  /** Set false to simulate a harness that cannot continue from a checkpoint. */
  resumeFromCheckpoint?: boolean;
}

interface MockProcess {
  sink: HarnessSink | null;
  buffer: HarnessEvent[];
  timer: NodeJS.Timeout | null;
  finished: boolean;
  step: number;
}

type Step = (task: string) => HarnessEvent[];

// Step N runs after N completed steps. Task text is echoed only in a bounded form.
const SCRIPT: readonly Step[] = [
  (task) => [{ kind: 'output', text: `Starting task: ${task.slice(0, 200)}` }],
  () => [{ kind: 'tool_call', tool: 'read_file', summary: 'scripts/build.sh' }],
  () => [{ kind: 'needs_input', prompt: 'Overwrite scripts/build.sh? (mock)' }],
  () => [{ kind: 'running' }, { kind: 'output', text: 'Applying change (mock)...' }],
  () => [{ kind: 'exit', code: 0, reason: 'completed' }],
];
const NEEDS_INPUT_STEP = 2;

/**
 * Development-only simulated agent. It runs inside this Node process, so it survives a registry
 * being discarded and re-created over the same adapter instance (the reattach path under test),
 * but not a real API process restart (the resume-from-checkpoint path).
 */
export class MockHarnessAdapter implements AgentHarnessAdapter {
  readonly id = 'mock';
  readonly capabilities: { readonly resumeFromCheckpoint: boolean };
  private readonly procs = new Map<string, MockProcess>();
  private readonly stepDelayMs: number;
  private readonly needsInputMs: number;

  constructor(opts: MockAdapterOptions = {}) {
    this.stepDelayMs = opts.stepDelayMs ?? 400;
    this.needsInputMs = opts.needsInputMs ?? 5000;
    this.capabilities = { resumeFromCheckpoint: opts.resumeFromCheckpoint ?? true };
  }

  async start(req: StartRequest, sink: HarnessSink): Promise<ProcessHandle> {
    if (req.checkpoint !== null && !this.capabilities.resumeFromCheckpoint) {
      throw new Error('Mock harness cannot resume from a checkpoint.');
    }
    const processId = `mock-${randomUUID()}`;
    const proc: MockProcess = {
      sink,
      buffer: [],
      timer: null,
      finished: false,
      step: req.checkpoint?.step ?? 0,
    };
    this.procs.set(processId, proc);
    this.emit(proc, { kind: 'running' });
    this.schedule(proc, req.task, this.stepDelayMs);
    return { processId };
  }

  async probe(handle: ProcessHandle): Promise<'alive' | 'gone'> {
    const proc = this.procs.get(handle.processId);
    return proc !== undefined && !proc.finished ? 'alive' : 'gone';
  }

  async attach(handle: ProcessHandle, sink: HarnessSink): Promise<void> {
    const proc = this.procs.get(handle.processId);
    if (!proc) throw new Error('No such mock process.');
    const pending = proc.buffer.splice(0);
    proc.sink = sink;
    for (const e of pending) sink(e);
  }

  detach(handle: ProcessHandle): void {
    const proc = this.procs.get(handle.processId);
    if (proc) proc.sink = null;
  }

  async stop(handle: ProcessHandle): Promise<void> {
    const proc = this.procs.get(handle.processId);
    if (!proc || proc.finished) return;
    if (proc.timer) clearTimeout(proc.timer);
    proc.finished = true;
    this.emit(proc, { kind: 'exit', code: 143, reason: 'stopped' });
  }

  /** Test hook: simulate the process dying without reporting anything. */
  kill(handle: ProcessHandle): void {
    const proc = this.procs.get(handle.processId);
    if (!proc) return;
    if (proc.timer) clearTimeout(proc.timer);
    proc.finished = true;
    proc.buffer.length = 0;
  }

  /** Stops every timer so a test run or shutdown leaves nothing behind. */
  dispose(): void {
    for (const proc of this.procs.values()) {
      if (proc.timer) clearTimeout(proc.timer);
      proc.finished = true;
    }
  }

  private emit(proc: MockProcess, event: HarnessEvent): void {
    if (proc.sink) proc.sink(event);
    else proc.buffer.push(event);
  }

  private schedule(proc: MockProcess, task: string, delayMs: number): void {
    proc.timer = setTimeout(() => this.runStep(proc, task), delayMs);
    proc.timer.unref();
  }

  private runStep(proc: MockProcess, task: string): void {
    if (proc.finished) return;
    const step = SCRIPT[proc.step];
    if (!step) return;
    for (const e of step(task)) {
      this.emit(proc, e);
      if (e.kind === 'exit') proc.finished = true;
    }
    const checkpoint: Checkpoint = { step: proc.step + 1 };
    proc.step += 1;
    this.emit(proc, { kind: 'checkpoint', checkpoint });
    if (!proc.finished) {
      this.schedule(
        proc,
        task,
        proc.step - 1 === NEEDS_INPUT_STEP ? this.needsInputMs : this.stepDelayMs,
      );
    }
  }
}
