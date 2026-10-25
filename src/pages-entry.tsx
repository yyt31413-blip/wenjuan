import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-sc';
import './app/globals.css';
import Survey from './components/Survey';
import Admin from './components/Admin';

const root = document.getElementById('root');
if (!root) throw new Error('Missing page root.');
createRoot(root).render(
  location.pathname.startsWith('/admin') ? <Admin /> : <Survey registrationUrl={null} />,
);
