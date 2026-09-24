import { useEffect, useRef, useState } from 'react';

import { useChat } from '../ChatProvider';
import { ChatComposer } from './ChatComposer';
import { ChatHistory } from './ChatHistory';

export function ChatPanel() {
  const chat = useChat();
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => { if (chat.open && chat.focusComposerToken === 0) heading.current?.focus(); }, [chat.open, chat.focusComposerToken]);
  if (chat.routeContext === null) return null;
  function close() { setDeleteId(null); chat.hide(); opener.current?.focus(); }
  return <>
    <button ref={opener} type="button" aria-expanded={chat.open} aria-controls={chat.open ? 'chat-panel' : undefined} onClick={chat.show}>Perguntar</button>
    {chat.open && <aside id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-panel-heading"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}>
      <div className="chat-panel-header">
        <h2 id="chat-panel-heading" ref={heading} tabIndex={-1}>Chat</h2>
        <button type="button" onClick={close} aria-label="Fechar chat">Fechar</button>
      </div>
      {chat.error && <p role="alert">Histórico do chat indisponível. O restante do produto continua disponível.</p>}
      {chat.actionError && <p role="alert">{chat.actionError}</p>}
      {chat.conversationLimitReached && <p role="status">Limite de 20 conversas atingido. Selecione e exclua uma conversa para criar outra. Nenhuma conversa é excluída automaticamente.</p>}
      <nav aria-label="Conversas do chat">
        <ul>{chat.conversations.map((row) => <li key={row.id}>
          <button type="button" aria-current={row.id === chat.activeConversation?.id ? 'true' : undefined}
            onClick={() => { setDeleteId(null); chat.selectConversation(row.id); }}>{row.title}</button>
        </li>)}</ul>
      </nav>
      <button type="button" disabled={chat.loading || chat.error || chat.managing || chat.busy || chat.conversationLimitReached}
        onClick={() => { setDeleteId(null); void chat.newConversation(); }}>Nova conversa</button>
      {chat.activeConversation !== null && <button type="button" disabled={chat.loading || chat.error || chat.managing || chat.busy}
        onClick={() => setDeleteId(chat.activeConversation?.id ?? null)}>Excluir conversa</button>}
      {deleteId !== null && deleteId === chat.activeConversation?.id && <div>
        <p>Excluir “{chat.activeConversation.title}” e todas as suas mensagens? Esta ação não pode ser desfeita.</p>
        <button type="button" disabled={chat.managing || chat.busy} onClick={() => {
          setDeleteId(null); void chat.deleteConversation(deleteId);
        }}>Confirmar exclusão</button>
        <button type="button" onClick={() => setDeleteId(null)}>Cancelar exclusão</button>
      </div>}
      <ChatHistory conversation={chat.activeConversation} contextFingerprint={chat.contextFingerprint}
        catalog={chat.catalog} communication={chat.communication} sentContext={chat.sentContext} routeContext={chat.routeContext}
        onRetry={(id) => { void chat.send('', id).catch(() => undefined); }} />
      <ChatComposer />
    </aside>}
  </>;
}
