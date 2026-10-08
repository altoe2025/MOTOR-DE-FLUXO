export function requireRenderSmokeConfig(env: Readonly<Record<string, string | undefined>>): Readonly<{
  baseUrl: string;
  email: string;
  password: string;
}>;

export function assertCompletedChatExchange(input: Readonly<{
  status: number | null;
  request: unknown;
  response: unknown;
  assistant: unknown;
  knownHelpIds?: readonly string[];
}>): void;
