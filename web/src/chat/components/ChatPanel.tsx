import { useEffect, useRef, useState } from 'react';

import { useChat } from '../ChatProvider';
import { ChatComposer } from './ChatComposer';
import { ChatHistory } from './ChatHistory';

function Icon({ path }: Readonly<{ path: string }>) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

const ICONS = {
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  list: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  close: 'M6 6l12 12M18 6L6 18',
};

export function ChatPanel() {
  const chat = useChat();
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  useEffect(() => { if (chat.open && chat.focusComposerToken === 0) heading.current?.focus(); }, [chat.open, chat.focusComposerToken]);
  if (chat.routeContext === null) return null;
  function close() { setDeleteId(null); setShowConversations(false); chat.hide(); opener.current?.focus(); }
  const idle = chat.loading || chat.error || chat.managing || chat.busy;
  return <>
    <button ref={opener} type="button" className="chat-launcher" aria-label="Perguntar" title="Tirar dúvidas com a ORKE AI"
      aria-expanded={chat.open} aria-controls={chat.open ? 'chat-panel' : undefined} onClick={chat.open ? close : chat.show}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICONS.chat} />
      </svg>
    </button>
    {chat.open && <aside id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-panel-heading"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}>
      <header className="chat-panel-header">
        <span className="chat-avatar" aria-hidden="true"><Icon path={ICONS.chat} /></span>
        <div className="chat-panel-title">
          <h2 id="chat-panel-heading" ref={heading} tabIndex={-1}>ORKE AI</h2>
          <small>{chat.busy ? 'digitando…' : 'tire dúvidas sobre o motor'}</small>
        </div>
        <button type="button" className="chat-icon-button" aria-label="Conversas" aria-pressed={showConversations}
          onClick={() => setShowConversations((value) => !value)}><Icon path={ICONS.list} /></button>
        <button type="button" className="chat-icon-button" aria-label="Nova conversa" disabled={idle || chat.conversationLimitReached}
          onClick={() => { setDeleteId(null); setShowConversations(false); void chat.newConversation(); }}><Icon path={ICONS.plus} /></button>
        {chat.activeConversation !== null && <button type="button" className="chat-icon-button" aria-label="Excluir conversa" disabled={idle}
          onClick={() => setDeleteId(chat.activeConversation?.id ?? null)}><Icon path={ICONS.trash} /></button>}
        <button type="button" className="chat-icon-button" onClick={close} aria-label="Fechar chat"><Icon path={ICONS.close} /></button>
      </header>

      {deleteId !== null && deleteId === chat.activeConversation?.id && <div className="chat-banner">
        <p>Excluir “{chat.activeConversation.title}”? Não dá para desfazer.</p>
        <button type="button" disabled={chat.managing || chat.busy} onClick={() => {
          setDeleteId(null); void chat.deleteConversation(deleteId);
        }}>Confirmar exclusão</button>
        <button type="button" onClick={() => setDeleteId(null)}>Cancelar exclusão</button>
      </div>}
      {chat.error && <p role="alert" className="chat-banner">Histórico do chat indisponível. O restante do produto continua disponível.</p>}
      {chat.actionError && <p role="alert" className="chat-banner">{chat.actionError}</p>}
      {chat.conversationLimitReached && <p role="status" className="chat-banner">Limite de 20 conversas. Exclua uma para criar outra.</p>}

      {showConversations ? <nav aria-label="Conversas do chat" className="chat-conversations">
        {chat.conversations.length === 0 ? <p>Nenhuma conversa ainda.</p> : <ul>{chat.conversations.map((row) => <li key={row.id}>
          <button type="button" aria-current={row.id === chat.activeConversation?.id ? 'true' : undefined}
            onClick={() => { setDeleteId(null); setShowConversations(false); chat.selectConversation(row.id); }}>{row.title}</button>
        </li>)}</ul>}
      </nav> : <>
        <div className="chat-body">
          <p className="chat-notice">Suas perguntas e o contexto da tela são enviados à OpenAI.</p>
          <ChatHistory conversation={chat.activeConversation} contextFingerprint={chat.contextFingerprint}
            catalog={chat.catalog} communication={chat.communication} sentContext={chat.sentContext} routeContext={chat.routeContext}
            onRetry={(id) => { void chat.send('', id).catch(() => undefined); }} />
        </div>
        <ChatComposer />
      </>}
    </aside>}
  </>;
}
