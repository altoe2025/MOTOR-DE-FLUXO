# MOT-20 — login, convite e recuperação de rascunho

## Estado

Implementação local na branch `codex/mot20-auth`, base `64bf303`. O projeto Supabase
real está provisionado e seu JWKS público anuncia ES256/P-256. O gate de convite e
primeiro acesso depende do envio humano do convite depois desta implementação.

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

O teste real restante exige convidar uma conta pelo Dashboard, abrir o link na origem
local configurada, definir a senha, obter o UUID público do usuário para a allowlist e
confirmar login, logout, recarga, troca de conta e chamada autenticada ao FastAPI.
