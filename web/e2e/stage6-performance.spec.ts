import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance as nodePerformance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

type ManifestEntry = { file: string; isEntry?: boolean; imports?: string[]; isDynamicEntry?: boolean };

function compressedBytes(file: string): number {
  return gzipSync(readFileSync(`dist/${file}`)).byteLength;
}

test('login has at most 350 KiB of initial JavaScript', async () => {
  const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8')) as Record<string, ManifestEntry>;
  const entry = Object.values(manifest).find((value) => value.isEntry);
  expect(entry).toBeDefined();
  const initial = new Set<string>();
  function visit(item: ManifestEntry) {
    if (initial.has(item.file)) return;
    initial.add(item.file);
    for (const dependency of item.imports ?? []) visit(manifest[dependency]!);
  }
  visit(entry!);
  const bytes = [...initial].filter((file) => file.endsWith('.js')).reduce((sum, file) => sum + compressedBytes(file), 0);
  expect(bytes).toBeLessThanOrEqual(350 * 1024);
});

declare global {
  interface Window {
    __stage6Vitals?: { longTasks: { startTime: number; duration: number }[]; cls: number };
  }
}

function percentile95(samples: number[]): number {
  return [...samples].sort((left, right) => left - right)[18]!;
}

test('20 warm samples stay inside presentation and interaction budgets', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.__stage6Vitals = { longTasks: [], cls: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__stage6Vitals!.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) window.__stage6Vitals!.cls += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect.poll(async () => (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies.length).toBe(1);
  const study = (await page.evaluate(() => window.__MOTOR_E2E__!.demoAcceptanceSnapshot())).studies[0]!;
  const scenario = study.scenarios[0]!;
  const diagnostic = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
  const url = `/estudos/${study.id}/apresentacao?cenario=${scenario.id}&execucao=${diagnostic.id}`;
  await page.goto(url);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();

  const openingMs: number[] = [];
  const sectionMs: number[] = [];
  const documentMs: number[] = [];
  const phaseMs: Record<string, number[]> = {
    snapshot: [], studyValidation: [], projection: [], documentValidation: [], storedStudyValidation: [],
  };
  let maxCls = 0;
  let longTasksOver200 = 0;
  const longTaskDurations: number[] = [];
  const longTaskPhases: string[] = [];
  for (let sample = 0; sample < 20; sample += 1) {
    const opened = nodePerformance.now();
    await page.goto(url);
    await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
    openingMs.push(nodePerformance.now() - opened);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const vitals = await page.evaluate(() => window.__stage6Vitals!);
    maxCls = Math.max(maxCls, vitals.cls);
    const openingTasks = vitals.longTasks.filter((task) => task.duration > 200);
    longTasksOver200 += openingTasks.length;
    longTaskDurations.push(...openingTasks.map((task) => task.duration));
    longTaskPhases.push(...openingTasks.map(() => 'opening'));
    const section = await page.evaluate(async (target) => {
      const started = performance.now();
      document.querySelector<HTMLAnchorElement>(`a[href="#${target}"]`)!.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const ended = performance.now();
      return { duration: ended - started, started, ended };
    }, sample % 2 === 0 ? 'composicao' : 'resumo');
    sectionMs.push(section.duration);
    const generated = await page.evaluate(async (input) => {
      const started = performance.now();
      await window.__MOTOR_E2E__!.projectDemoCommunication(input);
      const ended = performance.now();
      return { duration: ended - started, started, ended };
    }, { studyId: study.id, scenarioId: scenario.id, diagnosticExecutionId: diagnostic.id, replayDay: null });
    documentMs.push(generated.duration);
    const phases = await page.evaluate(() => {
      const latest = (name: string) => performance.getEntriesByName(`mot97:${name}`, 'mark').at(-1)?.startTime;
      const difference = (start: string, end: string) => {
        const from = latest(start);
        const to = latest(end);
        return from === undefined || to === undefined ? null : to - from;
      };
      return {
        snapshot: difference('communication:start', 'communication:snapshot'),
        studyValidation: difference('communication:snapshot', 'communication:study-validated'),
        projection: difference('communication:study-validated', 'communication:projected'),
        documentValidation: difference('communication:projected', 'communication:validated'),
        storedStudyValidation: difference('stored-study:start', 'stored-study:validated'),
      };
    });
    for (const [name, duration] of Object.entries(phases)) {
      if (duration !== null) phaseMs[name]!.push(duration);
    }
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const interactionTasks = await page.evaluate(({ section, generated }) => window.__stage6Vitals!.longTasks
      .filter((task) => task.duration > 200)
      .flatMap((task) => task.startTime < section.ended && task.startTime + task.duration > section.started
        ? [{ duration: task.duration, phase: 'section' }]
        : task.startTime < generated.ended && task.startTime + task.duration > generated.started
          ? [{ duration: task.duration, phase: 'document' }] : []), { section, generated });
    longTasksOver200 += interactionTasks.length;
    longTaskDurations.push(...interactionTasks.map((task) => task.duration));
    longTaskPhases.push(...interactionTasks.map((task) => task.phase));
  }
  const memory = await page.evaluate(() => (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory?.usedJSHeapSize ?? null);
  const report = {
    runner: { platform: process.platform, node: process.version, browser: await browser.version(), viewport: '1280x720' },
    fixture: 'demo-study.v1, cenário equilibrado, 12 participantes',
    opening_ms: openingMs,
    section_ms: sectionMs,
    document_ms: documentMs,
    phase_ms: phaseMs,
    long_tasks_over_200_ms: longTasksOver200,
    long_task_durations_ms: longTaskDurations,
    long_task_phases: longTaskPhases,
    max_cls: maxCls,
    used_js_heap_bytes: memory,
  };
  writeFileSync('test-results/stage6-performance.json', JSON.stringify(report, null, 2));
  expect(percentile95(openingMs)).toBeLessThanOrEqual(1500);
  expect(percentile95(sectionMs)).toBeLessThanOrEqual(100);
  expect(percentile95(documentMs)).toBeLessThanOrEqual(2000);
  expect(longTasksOver200).toBe(0);
  expect(maxCls).toBeLessThanOrEqual(0.10);
});
