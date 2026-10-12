import { defineConfig, loadEnv } from 'vite';
import { configBase } from './vite.base.config.js';

const APP_URL_PADRAO = 'https://app.listadecompras.net';

// Landing page (estática) — www.listadecompras.net
export default defineConfig(({ mode }) => {
  // O link "Acessar o app" usa %VITE_APP_URL%; sem a variável, aponta para PROD.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  process.env.VITE_APP_URL = env.VITE_APP_URL || APP_URL_PADRAO;

  return configBase('landing', { porta: 8081 });
});
