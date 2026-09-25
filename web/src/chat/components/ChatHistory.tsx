import { useEffect, useRef, useState } from 'react';

import type { ChatConversation } from '../domain';
import type { CommunicationDocumentV1 } from '../../communication/domain';
import type { ProductHelpCatalogV1 } from '../../help/catalog';
import type { RouteChatContext } from '../routeContext';
import { ChatCitation } from './ChatCitation';

export function ChatHistory({ conversation, contextFingerprint, catalog = null, communication = null,
  sentContext = null, routeContext, onRetry }: Readonly<{
  conversation: ChatConversation | null;
  contextFingerprint: string | null;
  catalog?: ProductHelpCatalogV1 | null;
  communication?: CommunicationDocumentV1 | null;
  sentContext?: CommunicationDocumentV1 | null;
  routeContext?: RouteChatContext | null;
  onRetry?(assistantId: string): void;
}>) {
  const latest = conversation?.messages.at(-1) ?? null;
  const previous = useRef<{ conversationId: string | null; messageId: string | null; status: string | null }>({ conversationId: null, messageId: null, status: null });
  const [announcement, setAnnouncement] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [conversation?.id, conversation?.messages.length, latest?.status]);
  useEffect(() => {
    const currentId = conversation?.id ?? null;
    if (currentId === previous.current.conversationId
      && (latest?.id !== previous.current.messageId || previous.current.status !== latest?.status)
      && latest?.role === 'ASSISTANT') {
      setAnnouncement(latest.status === 'SUCCEEDED' ? latest.text
        : latest.status === 'PENDING' ? 'Respondendo…' : 'Falha ao responder. Tente novamente.');
    } else setAnnouncement('');
    previous.current = { conversationId: currentId, messageId: latest?.id ?? null, status: latest?.status ?? null };
  }, [conversation?.id, latest?.id, latest?.role, latest?.status, latest?.text]);
  if (conversation === null) return <p className="chat-notice">Escreva sua dúvida abaixo para começar.</p>;
  return <>
    <ol className="chat-messages" aria-label="Mensagens da conversa">
      {conversation.messages.map((item, index) => <li key={item.id}>
        {index > 0 && conversation.messages[index - 1]?.contextFingerprint !== item.contextFingerprint
          && <p className="chat-context-divider">Contexto alterado</p>}
        <article className="chat-message" data-chat-role={item.role} data-chat-status={item.status} data-chat-message-id={item.id}>
          <strong className="visually-hidden">{item.role === 'USER' ? 'Você' : 'Assistente'}</strong>
          <p>{item.text || (item.status === 'PENDING' ? 'Respondendo…' : 'Resposta indisponível.')}</p>
          {item.status === 'FAILED' && <span>Falha ao responder. Tente novamente.</span>}
          {item.status === 'FAILED' && index === conversation.messages.length - 1 && onRetry
            && <button type="button" onClick={() => onRetry(item.id)}>Tentar novamente</button>}
          {item.status === 'SUCCEEDED' && item.citations.length > 0 && routeContext && <nav aria-label="Fontes da resposta"><ul>
            {item.citations.map((citation) => <li key={`${citation.kind}:${citation.id}`}>
              <ChatCitation citation={citation} fingerprint={item.contextFingerprint} catalog={catalog}
                document={sentContext?.contextFingerprint === item.contextFingerprint ? sentContext : communication}
                route={routeContext} />
            </li>)}
          </ul></nav>}
        </article>
      </li>)}
    </ol>
    {latest !== null && latest !== undefined && latest.contextFingerprint !== null && latest.contextFingerprint !== contextFingerprint
      && <p className="chat-context-divider">Contexto anterior</p>}
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
    <div ref={end} />
  </>;
}
