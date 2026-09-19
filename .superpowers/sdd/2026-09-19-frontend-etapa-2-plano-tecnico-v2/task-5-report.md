# T5 / MOT-27 — migrations, recuperação e lixeira

## Entrega

- `migrateDatabase` valida a versão física e o marcador lógico, prepara todas as
  conversões antes de escrever e confirma destino, original e marcador numa única
  transação IndexedDB. Repetição com a mesma origem é idempotente; digest divergente,
  documento inválido e versão futura geram erros tipados.
- `StudyDocument 1.0.0` é convertido para o agregado 2.0 como fonte `AUTHORED`, sem
  inventar participantes. O input explícito, período, custos, proveniência e envelopes
  compatíveis são preservados; a saída passa pelo validator atual antes do commit.
- O rascunho da Etapa 1 é preservado como recuperação parcial (`saved: false`) e não
  aparece como estudo salvo. A base experimental do importador é arquivada sem
  conversão semântica, pois não contém todos os campos do Caso Observado atual.
- Leituras de estudo validam o documento armazenado. Schema futuro retorna
  `SCHEMA_UNSUPPORTED`; conteúdo inválido retorna `DOCUMENT_CORRUPT`.
- Recuperação terminaliza apenas `PREPARING`/`RUNNING` como `INTERRUPTED`, conserva o
  request original e persiste a transição por CAS/operação, sem qualquer POST.
- Restore continua incrementando revisão via CAS. Purge remove estudo e execuções e
  substitui o histórico de operações por tombstones sem conteúdo sensível, na mesma
  transação; Casos Observados permanecem inalterados.

## Proveniência das fixtures

- `stage1-draft-v1.json`: contrato e ordem de serialização de
  `a55df77:web/src/study/draftRecovery.ts` e seu teste histórico.
- `study-document-v1.json`: `StudyDocument 1.0.0` e fixture removidos por `b265896`,
  recuperados do pai desse commit.
- `importer-database-v1.json`: stores e registros exercitados em
  `3cdd628:web/src/importer/indexedDbRepository.test.ts` sobre o schema físico de
  `indexedDbRepository.ts`.

As fixtures são JSON legados estáveis; nenhuma é produzida pelo schema 2.0 atual.

## Evidência

- `npm --prefix web run test:unit -- src/storage/migrations.test.ts src/storage/recovery.test.ts` — PASS
- `npm --prefix web run typecheck` — PASS
- `npm --prefix web run lint` — PASS
- `git diff --check` — PASS

Também foi executado durante o ciclo focado:

- `npm --prefix web run test:unit -- src/storage/indexedDbApplicationRepository.test.ts` — 13 testes PASS

O build não foi executado: não houve mudança de grafo, bundling ou configuração além
do que typecheck, lint e os testes Vitest cobrem.

## Limite da prova

Os testes com `fake-indexeddb` demonstram abort transacional, ausência de estado
parcial observável, repetição e CAS. Eles não simulam perda elétrica nem quota física
do navegador e nenhuma garantia desse tipo é afirmada.
