import { useOptionalChat } from '../chat/ChatProvider';
import type { HelpId } from './helpIds';

export function AskAboutThis({ helpId, metricId, contextKind, label = 'Perguntar sobre isto' }: Readonly<{
  helpId: HelpId; metricId?: string; contextKind?: 'REPLAY' | 'REPETITION' | 'LIMITATIONS'; label?: string;
}>) {
  const chat = useOptionalChat();
  if (chat === null || chat.routeContext === null) return null;
  return <button type="button" className="ask-about-this" onClick={() => chat.askAbout(helpId, metricId, contextKind)}>
    {label}
  </button>;
}
