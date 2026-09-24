# Chat contextual no cliente — C5 / MOT-95

O `ChatProvider` mantém a conversa persistida no escopo do usuário e do Estudo.
O envio grava `USER` e `ASSISTANT/PENDING` antes do HTTP; a resposta troca a
pendência por CAS. Falha ou cancelamento marca `FAILED`. **Tentar novamente**
reutiliza a pergunta, cria um novo ID de resposta e não duplica o par anterior.
Se uma aba altera a conversa entre PENDING e a finalização, o serviço relê a
revisão vigente e finaliza apenas a sua pendência como FAILED, preservando as
alterações concorrentes. A UI recebe o snapshot reconciliado para permitir retry.

O cliente valida o contrato antes e depois de `POST /api/v1/chat`, com timeout
próprio de 45 segundos. A seleção de contexto envia apenas o item de ajuda, a
métrica e suas evidências, a seção de comparação, o dia de Replay, ou a seção
relacionada ao acionador. Pergunta ampla pode enviar o documento inteiro se couber
em 1 MiB. O documento é validado e o fragmento recebe fingerprint próprio.

As citações são verificadas contra o catálogo e o fragmento usado naquela
resposta. Apenas IDs existentes em rotas implementadas se tornam links; referências
sem correspondência aparecem como texto indisponível. O link de Replay leva ao dia
selecionado. Diagnóstico carrega cenário e executionId; comparação carrega IDs
da base e da hipótese. As páginas só restauram execuções persistidas, atuais e
compatíveis; uma seleção ausente fica indisponível. Limitações COMPARISON_n levam
à seção de limitações da comparação quando sua evidência é comparativa. A seleção
atual, inclusive dia Replay e par de comparação sem mudança de URL, determina o
marcador **Contexto anterior**; o fragmento enviado fica disponível para citar
o contexto histórico. O CTA da comparação envia sua seção por intenção
COMPARISON. O acionador **Perguntar sobre isto** abre o painel, identifica o
contexto e move o foco para o campo da pergunta.

C5 foi validada com transporte fake. O aceite no browser e os testes adversariais
de privacidade da C6 ainda são uma tarefa separada. A disponibilidade do provider
real depende da configuração do servidor; esta entrega não fez chamadas pagas.
