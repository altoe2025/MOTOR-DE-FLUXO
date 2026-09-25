import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { comparisonInput } from '../communication/testFixtures';
import { VariationComparison } from './VariationComparison';

describe('VariationComparison', () => {
  it('warns that generated original and fixed variation do not isolate the lever effect', async () => {
    const input = await comparisonInput();
    Object.assign(input.execution.requestSnapshot.sampling, { kind: 'GENERATED_INPUT', count: 10 });
    const html = renderToStaticMarkup(<MemoryRouter><VariationComparison study={input.study}
      selectedScenarioId={input.scenarioId} running={false} progress={null} onRunAll={() => {}} />
    </MemoryRouter>);
    expect(html).toContain('a diferença de economia não isola o efeito da alavanca');
  });

  it('does not warn about generation when both executions use fixed orders', async () => {
    const input = await comparisonInput();
    const html = renderToStaticMarkup(<MemoryRouter><VariationComparison study={input.study}
      selectedScenarioId={input.scenarioId} running={false} progress={null} onRunAll={() => {}} />
    </MemoryRouter>);
    expect(html).not.toContain('a diferença de economia não isola o efeito da alavanca');
    expect(html).toContain('aria-label="Comparação dos cenários"');
    expect(html).toContain('tabindex="0"');
  });
});
