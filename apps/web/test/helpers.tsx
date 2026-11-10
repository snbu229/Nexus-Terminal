import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { expect } from 'vitest';
import { ApiProvider, makeApi } from '../src/api/context';
import { App } from '../src/app/App';

export function renderApp(path: string, mode: 'mock' | 'real' = 'mock') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = makeApi({ mode, baseUrl: 'http://localhost' });
  return render(
    <ApiProvider api={api} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

/** axe-core on the rendered DOM. color-contrast needs a layout engine, so it runs in Playwright. */
export async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}
