import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiProvider } from './api/context';
import { readApiConfig } from './api/config';
import { App } from './app/App';
import './styles.css';

async function boot() {
  if (readApiConfig().mode === 'mock') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledFrame: 'bypass' });
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ApiProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApiProvider>
    </StrictMode>,
  );
}
void boot();
