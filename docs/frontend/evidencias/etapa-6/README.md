# Evidências da Etapa 6 / MOT-99

Este diretório documenta o que deve acompanhar o aceite. Até a publicação autorizada, só há evidência local. **PUBLISHED_ACCEPTANCE=NOT_RUN**; não há URL, deploy ID, screenshots Render ou credenciais neste repositório.

| Artefato | Origem | Estado |
|---|---|---|
| `web/test-results/stage6-acceptance-*/stage6-acceptance.pdf` e `pages/page-*.png` | Playwright local, demonstração sintética; gerados sob demanda e ignorados pelo Git | Reproduzível localmente |
| `web/e2e/stage6-visual.spec.ts-snapshots/*-local-win32.png` | sete baselines Windows/Chromium; `demo` e `chat` revistas novamente após expor a lixeira | Versionado |
| `*-local-linux.png` | runner Linux/CI | NOT_RUN/BLOCKED; não criar a partir de PNG Windows |
| `web/test-results/stage6-performance.json` | 20 amostras D3, lidas por `measure_stage6.py --assert-budget` | Gerado sob demanda |
| `web/test-results/**/trace.zip` e `error-context.md` | falhas Playwright locais/CI | Temporário; não versionado |
| PDF, screenshots, health/cold start e deploy ID de Render | smoke HTTPS opt-in, após autorização | NOT_RUN |

O workflow preserva `web/test-results/` por sete dias como artifact de CI, quando a CI for executada. Não copie conversas, tokens, XLSX reais ou dados financeiros observados para anexos. No smoke futuro, use somente o XLSX sintético do repo e uma pergunta sintética. A matriz e os bloqueios estão em `docs/frontend/etapa-6-aceitacao.md`.
