import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const exportConfig = window.__EXPORT_CONFIG__;

async function bootstrap() {
  const RootComponent = exportConfig
    ? (await import('./RenderApp')).default
    : (await import('./App')).default;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootComponent />
    </StrictMode>,
  );
}

bootstrap();
