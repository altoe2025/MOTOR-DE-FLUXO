// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DiagnosticControls } from './DiagnosticControls';

describe('controles do diagnóstico', () => {
  it('oferece somente 10, 30 e 100 repetições para origem gerável', async () => {
    const onCountChange = vi.fn();
    render(<DiagnosticControls generated count={10} onCountChange={onCountChange} onRun={vi.fn()} />);
    const select = screen.getByLabelText('Repetições');
    expect([...select.querySelectorAll('option')].map((option) => option.value)).toEqual(['10', '30', '100']);
    await userEvent.selectOptions(select, '30');
    expect(onCountChange).toHaveBeenCalledWith(30);
  });

  it('explica que entrada fixa produz apenas execução individual', () => {
    render(<DiagnosticControls generated={false} count={1} onCountChange={vi.fn()} onRun={vi.fn()} />);
    expect(screen.queryByLabelText('Repetições')).not.toBeInTheDocument();
    expect(screen.getByText(/entrada fixa.*uma execução individual/i)).toBeVisible();
  });
});
