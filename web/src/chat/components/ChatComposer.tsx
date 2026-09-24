import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useChat } from '../ChatProvider';

export function ChatComposer() {
  const chat = useChat();
  const [question, setQuestion] = useState('');
  const [error, setError] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (chat.focusComposerToken > 0 && chat.canSend) textarea.current?.focus(); }, [chat.focusComposerToken, chat.canSend]);
  const selectedHelp = chat.routeContext?.helpId === null ? null
    : chat.catalog?.items.find((item) => item.id === chat.routeContext?.helpId);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    setError(false);
    try { await chat.send(question); setQuestion(''); }
    catch { setError(true); }
  };
  return <div className="chat-composer">
    <p className="chat-disclosure">Sua pergunta e o contexto relevante desta tela serão enviados à OpenAI.</p>
    {selectedHelp && <p className="chat-context-label">Contexto: {selectedHelp.label}</p>}
    {error && <p role="alert">Não foi possível enviar ou responder. Verifique o contexto e tente novamente.</p>}
    <form onSubmit={(event) => void send(event)}>
    <label htmlFor="chat-question">Sua pergunta</label>
    <textarea ref={textarea} id="chat-question" rows={3} maxLength={4000} value={question}
      onChange={(event) => setQuestion(event.target.value)} disabled={!chat.canSend || chat.busy}
      placeholder={chat.catalog === null ? 'Chat indisponível no momento' : 'Digite sua pergunta'} />
    <button type="submit" disabled={!chat.canSend || chat.busy || !question.trim()}>Enviar</button>
    {chat.busy && <button type="button" onClick={chat.cancel}>Cancelar envio</button>}
    </form>
  </div>;
}
