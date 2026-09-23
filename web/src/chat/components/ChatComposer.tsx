export function ChatComposer() {
  return <div className="chat-composer">
    <label htmlFor="chat-question">Sua pergunta</label>
    <textarea id="chat-question" rows={3} maxLength={4000} disabled placeholder="Chat indisponível no momento" />
    <button type="button" disabled>Enviar</button>
  </div>;
}
