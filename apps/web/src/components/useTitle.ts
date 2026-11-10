import { useEffect } from 'react';

/** WCAG 2.4.2: unique title per route, updated on SPA navigation. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - Nexus`;
  }, [title]);
}
