export type ApiErrorField = {
  path: string;
  code: string;
  message: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: readonly ApiErrorField[];
  readonly requestId: string | null;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    fields?: readonly ApiErrorField[];
    requestId?: string | null;
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    this.fields = Object.freeze([...(input.fields ?? [])]);
    this.requestId = input.requestId ?? null;
  }
}
