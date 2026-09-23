import { useEffect, useRef } from 'react';

import { useChat } from '../ChatProvider';
import { ChatComposer } from './ChatComposer';
import { ChatHistory } from './ChatHistory';

export function ChatPanel() {
  const chat = useChat();
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (chat.open) heading.current?.focus(); }, [chat.open]);
  if (chat.routeContext === null) return null;
  function close() { chat.hide(); opener.current?.focus(); }
  return <>
    <button ref={opener} type="button" aria-expanded={chat.open} aria-controls={chat.open ? 'chat-panel' : undefined} onClick={chat.show}>Perguntar</button>
    {chat.open && <aside id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-panel-heading">
      <div className="chat-panel-header">
        <h2 id="chat-panel-heading" ref={heading} tabIndex={-1}>Chat</h2>
        <button type="button" onClick={close} aria-label="Fechar chat">Fechar</button>
      </div>
      {chat.error && <p role="alert">Histórico do chat indisponível. O restante do produto continua disponível.</p>}
      <nav aria-label="Conversas do chat">
        <ul>{chat.conversations.map((row) => <li key={row.id}>
          <button type="button" aria-current={row.id === chat.activeConversation?.id ? 'true' : undefined}
            onClick={() => chat.selectConversation(row.id)}>{row.title}</button>
        </li>)}</ul>
      </nav>
      <button type="button" disabled={chat.loading || chat.error} onClick={() => void chat.newConversation()}>Nova conversa</button>
      <ChatHistory conversation={chat.activeConversation} contextFingerprint={chat.contextFingerprint} />
      <ChatComposer />
    </aside>}
  </>;
}
