import type { components } from '../api/generated';

export type ReplayDocument = components['schemas']['ReplayDocumentV1'];
export type ReplayDay = components['schemas']['ReplayDayV1'];
export type ReplayOrder = components['schemas']['ReplayOrderV1'];
export type ReplayClosing = components['schemas']['ReplayClosingV1'];
export type ReplayFlowSegment = components['schemas']['ReplayFlowSegmentV1'];
export type ReplayEndState = components['schemas']['ReplayEndStateV1'];
export type ReplayRequest = components['schemas']['ReplayRequestV1'];
export type ReplayAllocationEvent = components['schemas']['AllocationEventV1'];

export type ReplayPhase = 'WARMUP' | 'MEASUREMENT' | 'SETTLEMENT';
export type ReplaySort = 'ARRIVAL' | 'EDF';

export type OpenReplayOrder = Readonly<{
  orderId: string;
  clientId: string;
  direction: 'OUT' | 'IN';
  cohort: 'WARMUP' | 'MEASUREMENT';
  knownDay: number;
  deadlineDay: number;
  originalValueBrl: string;
  openValueBrl: string;
}>;

export type ReplayState = Readonly<{
  day: number;
  phase: ReplayPhase;
  openOrders: readonly OpenReplayOrder[];
  closing: ReplayClosing | null;
  endState: ReplayEndState;
}>;

export type ReplayTransition =
  | Readonly<{ kind: 'ARRIVAL'; day: number; orderId: string }>
  | Readonly<{ kind: 'CLOSING'; day: number; triggers: ReplayClosing['triggers'] }>
  | Readonly<{ kind: 'FLOW_SEGMENT'; day: number; segment: ReplayFlowSegment }>
  | Readonly<{ kind: 'BALANCE_UPDATED'; day: number; orderId: string; openValueBrl: string }>
  | Readonly<{ kind: 'REMITTANCE'; day: number; orderId: string; direction: 'OUT' | 'IN'; valueBrl: string }>
  | Readonly<{ kind: 'ORDER_SETTLED'; day: number; orderId: string }>;

export class ReplayStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayStateError';
  }
}
