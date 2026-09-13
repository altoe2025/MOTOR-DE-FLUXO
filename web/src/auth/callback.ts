export async function consumeAuthCallback(
  rawUrl: string,
  replaceUrl: (cleanPath: string) => void,
  verifyOtp: (tokenHash: string, type: 'invite' | 'recovery') => Promise<void>,
): Promise<void> {
  const url = new URL(rawUrl);
  const tokenHash = url.searchParams.get('token_hash');
  const rawType = url.searchParams.get('type');
  replaceUrl(url.pathname);
  if (tokenHash === null || tokenHash.length === 0 || (rawType !== 'invite' && rawType !== 'recovery')) {
    throw new Error('O link de acesso é inválido.');
  }
  await verifyOtp(tokenHash, rawType);
}
