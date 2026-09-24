import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

type AuditOptions = { print?: boolean };

export async function auditAccessibility(page: Page, options: AuditOptions = {}): Promise<void> {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))).toEqual([]);

  const structure = await page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const headings = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main h5,main h6')].filter(visible)
      .map((element) => Number(element.tagName[1]));
    const skips = headings.flatMap((level, index) => index > 0 && level > headings[index - 1]! + 1
      ? [`h${headings[index - 1]} → h${level}`] : []);
    const hiddenFocusable = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
      .filter((element) => !visible(element) && !(element as HTMLElement).hasAttribute('disabled'))
      .filter((element) => (element as HTMLElement).tabIndex >= 0)
      .filter((element) => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
      .map((element) => element.outerHTML.slice(0, 150));
    const tinyTargets = [...document.querySelectorAll('button,a[href],input,select,textarea')]
      .filter(visible).filter((element) => {
        const target = element.closest('label') ?? element;
        const rect = target.getBoundingClientRect();
        return rect.width < 24 || rect.height < 24;
      }).map((element) => element.outerHTML.slice(0, 150));
    return { headings, skips, hiddenFocusable, tinyTargets };
  });
  expect(structure.skips).toEqual([]);
  // Print CSS hides interactive navigation without removing it from the screen-mode DOM.
  if (!options.print) expect(structure.hiddenFocusable).toEqual([]);
  expect(structure.tinyTargets).toEqual([]);
  if (!options.print) expect(structure.headings[0]).toBe(1);
}
