import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';
import { initViewportHeight } from './lib/viewport';
import './index.css';

initTheme();
initViewportHeight();
void navigator.storage?.persist?.();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
