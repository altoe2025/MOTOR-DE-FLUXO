export type ChatClassification = 'IN_SCOPE' | 'INSUFFICIENT_EVIDENCE' | 'OUT_OF_SCOPE' | 'MIXED';

/** IDs address evidenceIndex, metric/limitation codes or help catalog IDs; never arbitrary URLs. */
export type ChatCitation = Readonly<{
  kind: 'EVIDENCE' | 'METRIC' | 'LIMITATION' | 'HELP';
  id: string;
}>;

export type ChatMessage = Readonly<{
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  classification: ChatClassification | null;
  citations: readonly ChatCitation[];
  contextFingerprint: string | null;
  createdAt: string;
}>;

export type ChatConversation = Readonly<{
  schemaVersion: '1.0.0';
  id: string;
  ownerSub: string;
  studyId: string | null;
  title: string;
  messages: readonly ChatMessage[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;
