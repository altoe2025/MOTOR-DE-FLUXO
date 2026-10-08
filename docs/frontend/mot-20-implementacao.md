# MOT-20 — login, convite e recuperação de rascunho

## Estado

Implementação concluída na branch `codex/mot20-auth`, base `64bf303`, e publicada no
PR #32. O projeto Supabase real está provisionado, seu JWKS público anuncia
ES256/P-256 e o gate real de convite, primeiro acesso e API autenticada passou.

## Contratos implementados

- `useAuth()` publica `status`, `userId`, `signIn`, `signOut` e `getAccessToken`.
- Estados: `loading`, `authenticated`, `unauthenticated`, `expired` e `unavailable`.
- O adaptador de `supabase-js` não expõe o cliente administrativo e usa somente
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `detectSessionInUrl` fica desativado. O callback próprio aceita somente `invite`
  e `recovery`, remove a query com `history.replaceState` e chama `verifyOtp` uma vez.
- Definição inicial chama `updateUser({password})` somente com sessão validada e no
  mínimo 12 caracteres.
- `DraftRecovery` valida o documento mínimo e o proprietário também na leitura. Não
  aceita campos extras; falhas de quota ou storage caem para memória sem ocultar a
  perda de persistência após recarga.

## Configuração local

Valores reais ficam em `web/.env.local`, ignorado por `.gitignore`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

O servidor continua usando `.env` com `SUPABASE_URL`, issuer `/auth/v1`, audience
`authenticated` e a allowlist de UUIDs. Nenhum secret/service-role é necessário no
navegador ou no servidor do Motor de Fluxo.

## Verificação local

```powershell
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
```

Nesta revisão passaram 57 testes Vitest, typecheck, ESLint e build; a suíte Python
permaneceu verde com 632 testes tanto no modo normal quanto sob `python -O` (dois
testes de symlink ignorados no Windows). `motor/` permaneceu sem alterações.

O teste real usou convite emitido pelo Dashboard após configurar SMTP próprio e os
templates `token_hash`. O callback abriu na origem compilada, definiu a primeira
senha e autenticou. O nome do estudo persistiu após F5 e após logout seguido de novo
login. Com o UUID guardado apenas na allowlist local, `GET /api/v1/session`, o exemplo
privado e `POST /api/v1/previas` passaram com token emitido pelo Supabase real. O
POST reproduziu `economia_periodo_brl = 1026000.000000` e
`motor_build_sha = a55df777299b10c8e7564a50add16e6b21c4f494`. E-mail, senha,
token e UUID não foram gravados no repositório. Troca de conta, expiração, refresh e
sincronização entre abas permanecem cobertos pelos testes controlados.
