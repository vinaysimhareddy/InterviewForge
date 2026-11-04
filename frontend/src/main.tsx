import { createRoot } from 'react-dom/client';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/600-italic.css';
import '@fontsource/newsreader/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import App from './App';
import './index.css';

// In production builds, silence console.log, console.debug, and console.info to protect internal state
if (import.meta.env.PROD) {
  const noop = (): void => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

createRoot(document.getElementById('root')!).render(<App />);

