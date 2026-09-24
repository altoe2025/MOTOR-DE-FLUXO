import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('loads every browser validation boundary when CSP forbids runtime code generation', async () => {
  vi.resetModules();
  vi.stubGlobal('Function', function blockedCodeGeneration() {
    throw new EvalError('CSP forbids dynamic code generation');
  });
  const validators = await import('./validators');
  expect(validators.validatePreviaRequest({})).toBe(false);
  expect(validators.validatePreviaRequest.errors?.length).toBeGreaterThan(0);
  const cases = await import('../cases/validation');
  expect(cases.validateObservedCase({}).ok).toBe(false);
  const profiles = await import('../profiles/validation');
  expect((await profiles.validateOperationalProfile({})).ok).toBe(false);
  await import('../study/validation');
  const demo = await import('../demo/validation');
  expect((await demo.validateDemoStudyPackage({})).ok).toBe(false);
  const communication = await import('../communication/validation');
  expect((await communication.validateCommunicationDocument({})).ok).toBe(false);
  const chat = await import('../chat/validation');
  expect(chat.validateChatConversation({}, 'owner').ok).toBe(false);
}, 30_000);
