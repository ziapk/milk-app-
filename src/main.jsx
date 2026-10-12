import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store';
import App from './App';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/brands.min.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <App />
  </StoreProvider>
);

// Inside the Android app the files are already on the phone, so no service worker is needed.
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.Capacitor) {
  navigator.serviceWorker.register('/sw.js');
}
