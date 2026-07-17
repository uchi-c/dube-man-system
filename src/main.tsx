import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { installFetchHeaderGuard } from './utils/patchFetchHeaders';

// Must run before anything else touches the network — see
// patchFetchHeaders.ts for why.
installFetchHeaderGuard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

// Register the service worker so the app is installable and works offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* non-fatal: app still works without the SW */
    });
  });
}
