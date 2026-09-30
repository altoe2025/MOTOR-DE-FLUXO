import type { components } from '../api/generated';
import type { CommunicationDocumentV1 } from '../communication/domain';

export type BoardChatDocument = components['schemas']['BoardChatDocumentV1'];
export type BoardChatRow = components['schemas']['BoardChatRowV1'];
export type BoardEvidence = components['schemas']['BoardEvidenceV1'];
export type StudyChatContext = Readonly<{ kind: 'STUDY'; document: CommunicationDocumentV1 }>;
export type BoardChatContext = Readonly<{ kind: 'BOARD'; document: BoardChatDocument }>;
export type ChatContext = StudyChatContext | BoardChatContext;

export function contextFingerprint(context: ChatContext | null): string | null {
  return context?.document.contextFingerprint ?? null;
}
