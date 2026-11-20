import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startConnection, useOffice } from './store.ts';
import './styles.css';

startConnection();
// Geliştirme sırasında tarayıcı konsolundan incelemek için (üretim derlemesinde yok).
if (import.meta.env.DEV) (window as unknown as { __ajanOfisiStore?: unknown }).__ajanOfisiStore = useOffice;

// StrictMode kullanılmıyor: geliştirme modunda bileşenleri iki kez kurup söküyor ve drei'nin <Html> etiketleri
// (React 19 ile) bu sırada yarım kalabiliyor.
createRoot(document.getElementById('root')!).render(<App />);
