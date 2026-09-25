import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { applyImportCommand, createImportReview, type ImportCommand, type ImportReview } from './eligibility';
import type { ParsedImport } from './xlsxParser';

export type ImportFlowStatus = 'SELECTING_SOURCE' | 'INSPECTING' | 'PARSING' | 'REVIEW_REQUIRED' | 'READY_TO_CONFIRM' | 'CONFIRMING' | 'CONFIRMED';
export type ImportFlowSnapshot = Readonly<{
  status: ImportFlowStatus;
  file: File | null;
  review: ImportReview | null;
  confirmedCase: ObservedCase | null;
  error: string | null;
}>;
export type ImportFlowPorts = Readonly<{
  parse(file: File, signal: AbortSignal): Promise<ParsedImport>;
  publish(review: ImportReview, operationId: string): Promise<ObservedCase>;
  operationId?: () => string;
  now?: () => string;
}>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a importação.';
}

/** Session-local orchestration. The publisher owns the sole durable mutation. */
export class ImportFlowController {
  readonly #ports: ImportFlowPorts;
  readonly #listeners = new Set<() => void>();
  #snapshot: ImportFlowSnapshot = { status: 'SELECTING_SOURCE', file: null, review: null, confirmedCase: null, error: null };
  #abort: AbortController | null = null;
  #generation = 0;
  #closed = false;
  #operationId: string | null = null;

  constructor(ports: ImportFlowPorts) { this.#ports = ports; }
  get snapshot(): ImportFlowSnapshot { return this.#snapshot; }
  subscribe(listener: () => void): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #publish(change: Partial<ImportFlowSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...change };
    this.#listeners.forEach((listener) => listener());
  }
  #assertOpen(): void { if (this.#closed) throw new Error('Sessão de importação encerrada.'); }
  selectFile(file: File): void {
    this.#assertOpen();
    if (this.#snapshot.status === 'CONFIRMING') throw new Error('Confirmação em andamento.');
    this.cancel();
    this.#publish({ file });
  }
  async read(input: { company: CompanyRecord | null; ownerSub: string; positionIdentified: boolean }): Promise<void> {
    this.#assertOpen();
    const file = this.#snapshot.file;
    if (file === null) throw new Error('Selecione um arquivo XLSX.');
    if (this.#snapshot.status !== 'SELECTING_SOURCE') throw new Error('Leitura já iniciada.');
    const generation = ++this.#generation;
    const abort = new AbortController();
    this.#abort = abort;
    this.#publish({ status: 'INSPECTING', error: null });
    try {
      this.#publish({ status: 'PARSING' });
      const parsed = await this.#ports.parse(file, abort.signal);
      if (generation !== this.#generation || this.#closed) return;
      const review = createImportReview({
        parsed, company: input.company, ownerSub: input.ownerSub,
        positionIdentified: input.positionIdentified,
        now: (this.#ports.now ?? (() => new Date().toISOString()))(),
      });
      this.#operationId = (this.#ports.operationId ?? (() => crypto.randomUUID()))();
      this.#publish({ status: 'REVIEW_REQUIRED', review });
      if (review.blockers.length === 0) this.#publish({ status: 'READY_TO_CONFIRM' });
    } catch (error) {
      if (generation !== this.#generation || this.#closed) return;
      this.#publish({ status: 'SELECTING_SOURCE', error: message(error) });
      throw error;
    } finally {
      if (this.#abort === abort) this.#abort = null;
    }
  }
  applyCommand(command: ImportCommand): void {
    this.#assertOpen();
    const review = this.#snapshot.review;
    if (review === null || !['REVIEW_REQUIRED', 'READY_TO_CONFIRM'].includes(this.#snapshot.status)) throw new Error('Revisão indisponível.');
    const next = applyImportCommand(review, command);
    if (next === review) return;
    this.#operationId = (this.#ports.operationId ?? (() => crypto.randomUUID()))();
    this.#publish({ review: next, status: next.blockers.length === 0 ? 'READY_TO_CONFIRM' : 'REVIEW_REQUIRED', error: null });
  }
  async confirm(): Promise<ObservedCase> {
    this.#assertOpen();
    const review = this.#snapshot.review;
    if (this.#snapshot.status !== 'READY_TO_CONFIRM' || review === null || this.#operationId === null) throw new Error('Resolva os bloqueios antes de confirmar.');
    const generation = this.#generation;
    this.#publish({ status: 'CONFIRMING', error: null });
    try {
      const confirmedCase = await this.#ports.publish(review, this.#operationId);
      if (this.#closed || generation !== this.#generation) throw new Error('Sessão de importação encerrada.');
      this.#publish({ status: 'CONFIRMED', confirmedCase });
      return confirmedCase;
    } catch (error) {
      if (!this.#closed && generation === this.#generation) this.#publish({ status: 'READY_TO_CONFIRM', error: message(error) });
      throw error;
    }
  }
  cancel(): void {
    this.#assertOpen();
    ++this.#generation;
    this.#abort?.abort();
    this.#abort = null;
    this.#operationId = null;
    this.#publish({ status: 'SELECTING_SOURCE', file: null, review: null, confirmedCase: null, error: null });
  }
  dispose(): void {
    if (this.#closed) return;
    this.cancel();
    this.#closed = true;
    this.#listeners.clear();
  }
}
