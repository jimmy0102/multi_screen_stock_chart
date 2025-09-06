import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('❌ Root element not found!');
} else {
  console.log('✅ Root element found, creating React app...');
  console.log('✅ Environment variables loaded:', {
    supabaseUrl: !!(import.meta as any).env.VITE_SUPABASE_URL,
    supabaseKey: !!(import.meta as any).env.VITE_SUPABASE_ANON_KEY
  });
  
  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  console.log('✅ React app rendered');
}