import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

interface AxeResults {
  violations: { id: string; nodes: { target: string[] }[] }[];
}

async function expectNoAxeViolations(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(): Promise<AxeResults> } }).axe;
    const r = await axe.run();
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
  expect(violations).toEqual([]);
}

test('dashboard shows banner, mock hosts and opens a terminal session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Development build' })).toContainText(
    'Development build, no authentication, mock data',
  );
  await expect(page.getByRole('table', { name: 'Server inventory' }).getByRole('row')).toHaveCount(
    9,
  );
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'dev-linux-amd64-01' }).click();
  await page.getByRole('button', { name: /Open terminal on dev-linux-amd64-01/ }).click();
  await expect(page.getByRole('heading', { name: 'Terminal sessions' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Terminal sessions' }).getByRole('link'),
  ).toHaveCount(3);
  await expectNoAxeViolations(page);
});

test('agents and approvals views render; approvals have no authority', async ({ page }) => {
  await page.goto('/agents/agent-dev-02');
  await expect(page.getByRole('list', { name: 'Agent events' })).toBeVisible();
  await expect(page.getByText('Reattached (same process)').first()).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto('/approvals/appr-dev-01');
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(page.getByText('dev mock: no authority')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('keyboard: skip link is first tab stop', async ({ page }) => {
  await page.goto('/servers');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});
