// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { conversation, message } from '../fixtures';
import { ChatHistory } from './ChatHistory';

describe('chat announcements', () => {
  it('announces processing and failure of a newly added assistant message', () => {
    const record = conversation({ messages: [message()] });
    const { rerender } = render(<ChatHistory conversation={record} contextFingerprint={null} />);
    const pending = message({ id: 'answer', role: 'ASSISTANT', text: '', status: 'PENDING' });
    rerender(<ChatHistory conversation={{ ...record, messages: [...record.messages, pending] }} contextFingerprint={null} />);
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Respondendo');
    rerender(<ChatHistory conversation={{ ...record, messages: [...record.messages, { ...pending, status: 'FAILED' }] }} contextFingerprint={null} />);
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Falha ao responder');
  });

  it('announces a newly completed assistant answer without announcing loaded history', () => {
    const pending = message({ id: 'answer', role: 'ASSISTANT', text: '', status: 'PENDING' });
    const record = conversation({ messages: [message(), pending] });
    const { rerender } = render(<ChatHistory conversation={record} contextFingerprint={null} />);
    expect(document.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement();
    rerender(<ChatHistory conversation={{ ...record, messages: [message(), { ...pending, text: 'Resposta pronta', status: 'SUCCEEDED' }] }} contextFingerprint={null} />);
    expect(screen.getByText('Resposta pronta', { selector: '[aria-live="polite"]' })).toBeInTheDocument();
  });

  it('expõe status terminal da resposta renderizada para o smoke sem confundir texto PENDING', () => {
    const assistant = message({ id: 'answer', role: 'ASSISTANT', text: 'Resposta pronta', status: 'SUCCEEDED' });
    const record = conversation({ messages: [message(), assistant] });
    render(<ChatHistory conversation={record} contextFingerprint={null} />);
    const article = screen.getByText('Resposta pronta', { selector: 'p' }).closest('article');
    expect(article).toHaveAttribute('data-chat-role', 'ASSISTANT');
    expect(article).toHaveAttribute('data-chat-status', 'SUCCEEDED');
    expect(article).toHaveAttribute('data-chat-message-id', 'answer');
  });
});
