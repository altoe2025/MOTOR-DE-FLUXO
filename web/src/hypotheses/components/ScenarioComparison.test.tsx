// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MvpComparison } from '../comparison';
import { ScenarioComparison } from './ScenarioComparison';

describe('ScenarioComparison', () => {
  it('mostra limitações antes dos sete eixos e mantém a tabela exata', () => {
    const comparison: MvpComparison = {
      compatibility: { status: 'COMPARABLE', maintained: [], added: [], removed: [], modified: [], blockers: [] },
      limitations: ['UNPAIRED_DIAGNOSTICS'], inputChanges: [{ code: 'WINDOW', label: 'Janela', before: '7', after: '3' }],
      axes: [{ axis: 'STRUCTURAL_POTENTIAL', metric: 'gross_out_brl', label: 'Bruto OUT', unit: 'BRL', base: '100', hypothesis: '125', delta: '25', state: 'AVAILABLE' }],
    };
    const { container } = render(<ScenarioComparison comparison={comparison} />);
    expect(screen.getByText(/diagnósticos independentes/i)).toBeVisible();
    expect(screen.getByText('Janela').closest('li')).toHaveTextContent('7 → 3');
    expect([...container.querySelectorAll('.comparison-axis > h2')].map((item) => item.textContent)).toEqual([
      '1. Potencial estrutural', '2. Captura pela política', '3. Compatibilidade temporal',
      '4. Exposição residual', '5. Dependência da composição', '6. Robustez econômica',
      '7. Perfil operacional da carteira',
    ]);
    expect(screen.getByRole('cell', { name: '25 BRL' })).toBeVisible();
    const composition = screen.getByRole('heading', { name: 'Mudanças na composição' });
    const firstAxis = screen.getByRole('heading', { name: '1. Potencial estrutural' });
    expect(composition.compareDocumentPosition(firstAxis) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(container.textContent?.toLowerCase()).not.toContain('efeito marginal');
  });
});
