import { useEffect, useRef, useState } from 'react';

import type { ChatConversation } from '../domain';

export function ChatHistory({ conversation, contextFingerprint }: Readonly<{
  conversation: ChatConversation | null;
  contextFingerprint: string | null;
}>) {
  const latest = conversation?.messages.at(-1) ?? null;
  const previous = useRef<{ conversationId: string | null; messageId: string | null; status: string | null }>({ conversationId: null, messageId: null, status: null });
  const [announcement, setAnnouncement] = useState('');
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
  if (conversation === null) return <p>Nenhuma conversa neste contexto.</p>;
  return <>
    <ol className="chat-messages" aria-label="Mensagens da conversa">
      {conversation.messages.map((item, index) => <li key={item.id}>
        {index > 0 && conversation.messages[index - 1]?.contextFingerprint !== item.contextFingerprint
          && <p className="chat-context-divider">Contexto alterado</p>}
        <article className="chat-message">
          <strong>{item.role === 'USER' ? 'Você' : 'Assistente'}</strong>
          <p>{item.text || (item.status === 'PENDING' ? 'Respondendo…' : 'Resposta indisponível.')}</p>
          {item.status === 'FAILED' && <span>Falha ao responder. Tente novamente.</span>}
        </article>
      </li>)}
    </ol>
    {latest?.contextFingerprint !== null && latest?.contextFingerprint !== contextFingerprint
      && <p className="chat-context-divider">Contexto anterior</p>}
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
  </>;
}
