import type { ReactNode } from 'react';

type InlineNoticeProps = {
  children: ReactNode;
  tone?: 'info' | 'error';
  busy?: boolean;
};

export function InlineNotice({ children, tone = 'info', busy = false }: InlineNoticeProps) {
  const role = tone === 'error' ? 'alert' : 'status';
  return <div className={`inline-notice inline-notice--${tone}`} role={role} aria-busy={busy || undefined}>{children}</div>;
}
