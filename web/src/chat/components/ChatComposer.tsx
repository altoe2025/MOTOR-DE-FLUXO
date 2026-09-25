import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChat } from '../ChatProvider';

export function ChatComposer() {
  const chat = useChat();
  const [question, setQuestion] = useState('');
  const [error, setError] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (chat.focusComposerToken > 0 && chat.canSend) textarea.current?.focus(); }, [chat.focusComposerToken, chat.canSend]);
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!question.trim() || !chat.canSend || chat.busy) return;
    setError(false);
    try { await chat.send(question); setQuestion(''); }
    catch { setError(true); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };
  return <div className="chat-composer">
    {chat.messageLimitReached && <p role="status" className="chat-banner">Limite de 100 mensagens. Inicie uma nova conversa.</p>}
    {error && <p role="alert" className="chat-banner">Não foi possível enviar. Tente novamente.</p>}
    <form onSubmit={(event) => void send(event)}>
      <label htmlFor="chat-question" className="visually-hidden">Sua pergunta</label>
      <textarea ref={textarea} id="chat-question" rows={1} maxLength={4000} value={question}
        onChange={(event) => setQuestion(event.target.value)} onKeyDown={onKeyDown} disabled={!chat.canSend || chat.busy}
        placeholder={chat.catalog === null ? 'Chat indisponível no momento' : 'Digite uma mensagem'} />
      {chat.busy
        ? <button type="button" className="chat-send" onClick={chat.cancel} aria-label="Cancelar envio">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>
        </button>
        : <button type="submit" className="chat-send" aria-label="Enviar" disabled={!chat.canSend || !question.trim()}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z" /></svg>
        </button>}
    </form>
  </div>;
}
