import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { performance as nodePerformance } from 'node:perf_hooks';

import { expect, test, type Page } from '@playwright/test';

type LongTask = { phase: string; duration_ms: number; attributable_to_local_read: boolean };
type BrowserVitals = { readyMs: number | null; responseEnd: number; longTasks: { start: number; duration: number }[] };

function rank(samples: number[], fraction: number): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(fraction * samples.length) - 1]!;
}

async function routeReady(page: Page, path: string): Promise<{ local: number; route: number; tasks: LongTask[] }> {
  const started = nodePerformance.now();
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __portfolioVitals?: BrowserVitals })
    .__portfolioVitals?.readyMs ?? null)).not.toBeNull();
  const route = nodePerformance.now() - started;
  const vitals = await page.evaluate(() => (window as typeof window & { __portfolioVitals: BrowserVitals }).__portfolioVitals);
  return {
    local: vitals.readyMs!, route,
    tasks: vitals.longTasks.map((task) => ({ phase: `bootstrap:${path}`, duration_ms: task.duration,
      attributable_to_local_read: false })),
  };
}

async function spaReady(page: Page, path: '/estudos' | '/diagnostico'): Promise<{ duration: number; tasks: LongTask[] }> {
  return page.evaluate(async (target) => {
    const link = target === '/estudos' ? document.querySelector<HTMLAnchorElement>('nav a[href="/estudos"]') : null;
    if (target === '/estudos' && !link) throw new Error('SPA navigation link for Estudos absent');
    const start = performance.now();
    const vitals = (window as typeof window & { __portfolioVitals: BrowserVitals }).__portfolioVitals;
    const ready = () => location.pathname === target && (target === '/estudos'
      ? document.body.textContent?.includes('8-company performance fixture')
      : document.querySelector('a[href="/estudos/00000000-0000-4000-8000-000000005000/diagnostico"]')?.textContent === 'Abrir recomendação');
    const duration = await new Promise<number>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!ready()) return;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
      });
      observer.observe(document, { subtree: true, childList: true });
      if (target === '/estudos') link!.click();
      else history.back();
      setTimeout(() => { observer.disconnect(); reject(new Error(`SPA navigation to ${target} did not become ready`)); }, 10000);
    });
    const end = performance.now();
    return { duration, tasks: vitals.longTasks.filter((task) => task.start >= start && task.start < end)
      .map((task) => ({ phase: `spa:${target}`, duration_ms: task.duration, attributable_to_local_read: true })) };
  }, path);
}

async function browserClock(page: Page): Promise<number> { return page.evaluate(() => performance.now()); }

async function localTasks(page: Page, start: number, end: number, phase: string): Promise<LongTask[]> {
  return page.evaluate(({ from, until, label }) => {
    const vitals = (window as typeof window & { __portfolioVitals: BrowserVitals }).__portfolioVitals;
    return vitals.longTasks.filter((task) => task.start >= from && task.start < until)
      .map((task) => ({ phase: label, duration_ms: task.duration, attributable_to_local_read: true }));
  }, { from: start, until: end, label: phase });
}

type VisualPhase = 'recommendation_first' | 'recommendation_warm';
type VisualTiming = { to_dom_ms: number; to_paint_ms: number; tasks: LongTask[] };

async function measureVisual(page: Page, phase: VisualPhase): Promise<VisualTiming> {
  return page.evaluate(async (label) => {
    const selector = 'a[href="/estudos/00000000-0000-4000-8000-000000005000/diagnostico"]';
    const control = document.querySelector<HTMLElement>(selector);
    if (control === null) throw new Error(`${label} control absent`);
    const vitals = (window as typeof window & { __portfolioVitals: BrowserVitals }).__portfolioVitals;
    const start = performance.now();
    const visible = () => document.querySelector('.portfolio-analysis .portfolio-recommendation h3') !== null;
    const toDom = await new Promise<number>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!visible()) return;
        observer.disconnect(); resolve(performance.now() - start);
      });
      observer.observe(document, { childList: true, subtree: true });
      control.click();
      setTimeout(() => { observer.disconnect(); reject(new Error(`${label} did not render`)); }, 15000);
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const toPaint = performance.now() - start;
    const tasks = vitals.longTasks.filter((task) => task.start >= start && task.start < performance.now())
      .map((task) => ({ phase: label, duration_ms: task.duration, attributable_to_local_read: true }));
    return { to_dom_ms: toDom, to_paint_ms: toPaint, tasks };
  }, phase);
}

test('255 persisted results keep portfolio navigation and exploration responsive', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await page.addInitScript(() => {
    type Vitals = { readyMs: number | null; longTasks: { start: number; duration: number }[]; responseEnd: number };
    const vitals: Vitals = { readyMs: null, longTasks: [], responseEnd: 0 };
    (window as typeof window & { __portfolioVitals: Vitals }).__portfolioVitals = vitals;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
    const check = () => {
      if (vitals.readyMs !== null) return;
      const target = location.pathname === '/estudos' ? '8-company performance fixture'
        : location.pathname === '/diagnostico' ? 'Abrir recomendação' : null;
      if (target === null) return;
      const ready = location.pathname === '/estudos' ? document.body?.textContent?.includes(target)
        : document.querySelector(`a[href="/estudos/00000000-0000-4000-8000-000000005000/diagnostico"]`)?.textContent === target;
      if (!ready) return;
      vitals.responseEnd = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).responseEnd;
      vitals.readyMs = performance.now() - vitals.responseEnd;
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
    queueMicrotask(check);
  });

  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const fixture = await page.evaluate(() => window.__MOTOR_E2E__!.seedPortfolioPerformance());
  expect(fixture.studyCount).toBe(1);
  expect(fixture.scenarioCount).toBe(255);
  expect(fixture.executionCount).toBe(510);

  const requestCounts = { preparations_post: 0, diagnostics_post: 0,
    incidental_preparations_post: 0, incidental_diagnostics_post: 0 };
  let trackIncidental = true;
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/preparacoes') {
      requestCounts.preparations_post += 1;
      if (trackIncidental) requestCounts.incidental_preparations_post += 1;
    }
    if (path === '/api/v1/diagnosticos') {
      requestCounts.diagnostics_post += 1;
      if (trackIncidental) requestCounts.incidental_diagnostics_post += 1;
    }
  });

  // One untimed warmup of each route precedes the twenty measured openings.
  await routeReady(page, '/estudos');
  await routeReady(page, '/diagnostico');
  const samples = { studies_ready: [] as number[], diagnostics_ready: [] as number[],
    interaction: [] as number[], new_combination_feedback: [] as number[] };
  const phases = { studies_route: [] as number[], diagnostics_route: [] as number[],
    studies_bootstrap_local: [] as number[], diagnostics_bootstrap_local: [] as number[],
    recommendation_first: null as VisualTiming | null, recommendation_warm: [] as VisualTiming[] };
  const longTasks: LongTask[] = [];
  for (let index = 0; index < 20; index += 1) {
    const studies = await routeReady(page, '/estudos');
    phases.studies_bootstrap_local.push(studies.local); phases.studies_route.push(studies.route);
    longTasks.push(...studies.tasks);
    const diagnostics = await routeReady(page, '/diagnostico');
    phases.diagnostics_bootstrap_local.push(diagnostics.local); phases.diagnostics_route.push(diagnostics.route);
    longTasks.push(...diagnostics.tasks);
  }
  for (let index = 0; index < 20; index += 1) {
    const studies = await spaReady(page, '/estudos');
    samples.studies_ready.push(studies.duration); longTasks.push(...studies.tasks);
    // The light shell has no Diagnóstico destination: return to the compact hub via same-document history.
    const diagnostics = await spaReady(page, '/diagnostico');
    samples.diagnostics_ready.push(diagnostics.duration); longTasks.push(...diagnostics.tasks);
  }

  const compactRows = await page.locator('.diagnostics-hub__study tbody tr').count();
  const portfolioToggles = await page.getByRole('button', { name: /diagnósticos de 8-company performance fixture/ }).count();
  expect(compactRows).toBe(0);
  expect(portfolioToggles).toBe(0);
  await expect(page.getByRole('link', { name: 'Abrir recomendação' })).toBeVisible();
  phases.recommendation_first = await measureVisual(page, 'recommendation_first');
  const analysis = page.getByRole('region', { name: 'Qual carteira atende melhor?' });
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toBeVisible();
  longTasks.push(...phases.recommendation_first.tasks);
  await expect(analysis.locator('.portfolio-overview')).toContainText('255');
  await page.evaluate(() => { (window as typeof window & { __portfolioDocumentToken?: number }).__portfolioDocumentToken = 1; });
  for (let index = 0; index < 20; index += 1) {
    await page.goBack();
    expect(await page.evaluate(() => (window as typeof window & { __portfolioDocumentToken?: number }).__portfolioDocumentToken)).toBe(1);
    await expect(page.getByRole('link', { name: 'Abrir recomendação' })).toBeVisible();
    const warm = await measureVisual(page, 'recommendation_warm');
    phases.recommendation_warm.push(warm); longTasks.push(...warm.tasks);
  }

  const objective = analysis.getByRole('combobox', { name: 'Objetivo' });
  const filter = analysis.getByRole('textbox', { name: 'Economia mínima (R$)' });
  for (let index = 0; index < 20; index += 1) {
    const interactionClock = await browserClock(page);
    const started = nodePerformance.now();
    if (index % 2 === 0) {
      await objective.selectOption(index % 4 === 0 ? 'wait' : 'savings');
    } else {
      await filter.fill(index % 4 === 1 ? '999999' : '');
    }
    const interactionEnd = await page.evaluate(() => new Promise<number>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))));
    samples.interaction.push(nodePerformance.now() - started);
    longTasks.push(...await localTasks(page, interactionClock, interactionEnd, 'interaction'));
  }
  await objective.selectOption('savings');
  await filter.fill('');
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toBeVisible();

  await page.goto('/estudos');
  trackIncidental = false; // This button explicitly prepares a new base scenario.
  await page.getByRole('button', { name: 'Mais ações: criar' }).click();
  const feedback = await page.evaluate(async () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.trim() === 'Nova combinação de carteiras');
    if (!button) throw new Error('Creation menu item missing');
    const started = performance.now();
    return new Promise<number>((resolve, reject) => {
      const visibleFeedback = () => document.querySelector('[role="status"]')?.textContent
        ?.includes('Criando combinação de carteiras') === true;
      let settling = false;
      const finishAfterPaint = () => {
        if (settling) return;
        settling = true;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - started)));
      };
      const observer = new MutationObserver(() => {
        if (visibleFeedback()) finishAfterPaint();
      });
      observer.observe(document, { subtree: true, childList: true });
      button.click();
      if (visibleFeedback()) finishAfterPaint();
      setTimeout(() => { observer.disconnect(); reject(new Error('Creation feedback absent')); }, 5000);
    });
  });
  samples.new_combination_feedback.push(feedback);
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);

  const stats = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, {
    p50: rank(values, 0.5), p95: rank(values, 0.95),
  }]));
  const report = {
    environment: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? 'unknown',
      node: process.version, browser: await browser.version(), viewport: '1280x720' },
    fixture: { company_count: 8, study_count: fixture.studyCount, scenario_count: fixture.scenarioCount, execution_count: fixture.executionCount },
    samples_ms: samples, stats_ms: stats, phases_ms: phases, request_counts: requestCounts,
    dom_counts: { compact_scenario_rows: compactRows, portfolio_toggle_count: portfolioToggles },
    long_tasks: longTasks,
    metric_definition: 'Warm list budget uses the Estudos SPA link and browser history back to the compact hub, through two animation frames after matching DOM. Bootstrap local is responseEnd to first matching DOM; route includes browser navigation and Playwright. Recommendation starts from the compact-hub link and times heading DOM then two frames; warm uses same-document page.goBack to the hub, retaining the controller. Creation feedback is menu-item click to the persistent in-progress status; completion still requires navigation to the created study. Interaction is action through two animation frames.',
  };
  writeFileSync('test-results/portfolio-performance.json', JSON.stringify(report, null, 2));
  expect(requestCounts.incidental_preparations_post).toBe(0);
  expect(requestCounts.incidental_diagnostics_post).toBe(0);
  expect(rank(samples.studies_ready, 0.95)).toBeLessThanOrEqual(200);
  expect(rank(samples.diagnostics_ready, 0.95)).toBeLessThanOrEqual(200);
  expect(rank(samples.interaction, 0.95)).toBeLessThanOrEqual(200);
  expect(feedback).toBeLessThanOrEqual(100);
});
