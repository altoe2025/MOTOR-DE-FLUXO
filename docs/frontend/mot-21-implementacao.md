# MOT-21 — cliente tipado e integração navegador–motor

## Estado

Implementação na branch `codex/mot21-client-integracao`, criada da `origin/main`
`835c7ca1a0df27732c03256cd595a509c3d231b0`. A MOT-21 permanece **In Progress**
até revisão e merge autorizados.

## Fronteiras implementadas

- O cliente usa os tipos gerados do OpenAPI e validadores AJV para o exemplo, a
  entrada e o envelope. JSON inválido, HTML, versão incompatível e decimais fora do
  contrato falham antes do cache ou da renderização.
- O token é consultado no `AuthProvider` para cada request. Um 401 expira a sessão;
  403 não é repetido; 429 e 503 podem repetir somente o GET, uma vez. Mutações têm
  `retry: false`, inclusive timeout e falha de transporte.
- `ApiError` não retém corpo, headers, Bearer nem propriedades extras do erro remoto.
- O `QueryClient` acompanha a identidade autenticada e é limpo ao ser substituído.
  A prévia aborta na troca de conta e aceita somente envelope com `request_id`,
  `study_id`, `scenario_id` e `scenario_revision` iguais aos enviados.
- O envelope validado é clonado e congelado como snapshot. Falhas mantêm o nome e o
  resultado anterior; navegação e execução ativa não disparam outro POST.
- A interface mostra diretamente os campos canônicos do servidor. TypeScript apenas
  formata valores: não executa P0/EDF nem recalcula custos, economia ou netabilidade.

## Percurso E2E controlado

`npm --prefix web run test:e2e` gera um build exclusivo de teste, inicia uma factory
FastAPI com verificador local e token sintéticos e usa Chromium para executar o
exemplo. Nenhuma resposta é interceptada: GET e POST atravessam as rotas reais, o
adaptador e o pacote `motor`. O teste confirma uma única chamada de cada método,
economia de R$ 1.026.000,00, netabilidade de 58,82%, origem sintética, aviso de não
calibração e preservação do nome ao navegar.

O módulo de sessão controlada só entra no bundle `--mode e2e`; o build de produção
contém o cliente Supabase. O launcher recusa qualquer token diferente do valor
sintético fixo e encerra a própria instância ao final, sem processo órfão.

## Gate Supabase real

O build de produção foi iniciado com a URL, publishable key e allowlist dos arquivos
locais ignorados herdados da MOT-20. Após login local pela pessoa autorizada, o
Bearer real foi validado pelo JWKS público e o percurso Carteira → FastAPI →
adaptador → motor → Diagnóstico reproduziu R$ 1.026.000,00, 58,82%, `PREVIA`,
fingerprint, origem sintética e aviso de não calibração. O nome `teste` permaneceu
após uma primeira falha causada pela sandbox sem acesso de saída ao JWKS e depois da
navegação. Nenhum e-mail, senha, token ou UUID real foi lido ou registrado.

## Comandos de verificação

```powershell
python -m pytest -q
python -O -m pytest -q
npm --prefix web run test:unit
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
npm --prefix web run test:e2e
```

Os resultados finais e o link do PR são registrados no Linear após publicação.

Na verificação local final passaram 633 testes Python (2 ignorados) em modo normal
e sob `python -O`, 88 testes Vitest, Ruff, mypy, typecheck, ESLint, build de produção
e o percurso Playwright controlado. O Vite apenas repetiu o aviso não bloqueante do
bundle principal acima de 500 kB, já visível na base da etapa.
