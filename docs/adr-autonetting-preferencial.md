# ADR: autonetting preferencial em cada fechamento P0

## Contexto

A P0 fechava uma fila única por direção em EDF/id. Assim, a entrada de outro cliente
podia cobrir um OUT antes da entrada já aberta do próprio participante. Essa seleção
era determinística, mas não atendia à política aprovada: quando OUT e IN do mesmo
cliente coexistem num fechamento, o volume comum deve casar intracliente antes de
participar da pool multilateral.

O requisito não autoriza fechar o lote quando a segunda ponta aparece, reservar
liquidez para o futuro nem vincular juridicamente uma ordem específica a outra. O
Modelo B e os gatilhos temporais da P0 permanecem.

## Decisão

Cada fechamento executa duas fases:

1. agrupa as ordens abertas por `cliente_id` e consome o volume comum de OUT/IN de
   cada cliente em EDF/id, registrando `OrigemCasamento.INTRA_CLIENTE`;
2. envia somente os saldos restantes para uma fila global e consome OUT/IN em
   EDF/id, registrando `OrigemCasamento.INTER_CLIENTE`.

A preferência intracliente é superior ao EDF global. EDF/id continua sendo o
desempate determinístico dentro de cada cliente e na fase residual. O fechamento só
ocorre pelos gatilhos existentes — janela, vencimento de ordem aberta ou fim do
horizonte — e usa apenas ordens conhecidas e ainda abertas naquele dia.

`origem_casamento` é classificação auditável da alocação, não pareamento físico de
operações. `CASADO` exige origem; `REMETIDO` exige origem nula. Volumes, taxas, ledger,
custos atribuídos, API e interface derivam das alocações efetivamente produzidas.

## Alternativas rejeitadas

- **Pré-netar por cliente antes da P0.** Perde prazos, finalidade, custo, ordem de
  chegada e sobreposição temporal; também impede auditar qual política resolveu o
  volume.
- **Manter EDF global puro.** Permite que outro participante consuma a contraparte
  antes do próprio cliente e viola a preferência aprovada.
- **Reservar ou olhar ordens futuras.** Usa informação indisponível no fechamento e
  muda a causalidade da simulação.
- **Fechar assim que a segunda ponta aparece.** Altera os gatilhos da P0 e os números
  de espera/custo sem autorização.
- **Criar pares ordem-a-ordem.** Contradiz o Modelo B; a origem é agregada por
  mecanismo, não vínculo físico ou jurídico entre operações.

## Consequências

- `cliente_id` passa a participar da política de seleção, não apenas da análise.
- A soma dos volumes `INTRA_CLIENTE` e `INTER_CLIENTE` deve reconciliar exatamente
  com o volume `CASADO`; custo e economia por destino reconciliam com o agregado.
- O baseline continua sendo cada operação executada sozinha; fórmulas de IOF, carry,
  spread, espera e custo fixo não mudam.
- Resultados, CSVs, fixtures e conclusões produzidos pela política de EDF global são
  legado. Não devem ser sobrescritos; a política nova usa schema público 2.0.0.
- A grade completa só pode ser regenerada depois de uma amostra pequena e de
  aprovação explícita do Gabriel.

Para contexto de negócio e proveniência da decisão, consultar o vault Obsidian.
