import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { configBase } from './vite.base.config.js';
import { pluginPolitica } from './landing/politica.js';

const APP_URL_PADRAO = 'https://app.listadecompras.net';
const LANDING_URL_PADRAO = 'https://www.listadecompras.net';

// Sem barra no fim: as páginas montam %VITE_APP_URL%/login e %VITE_LANDING_URL%/.
const semBarra = (url) => url.replace(/\/+$/, '');

// Landing page (estática, sem JavaScript) — www.listadecompras.net
export default defineConfig(({ mode }) => {
  // Valor do ambiente do processo (Docker, testes) ou do frontend/.env; sem ele, PROD.
  const env = { ...loadEnv(mode, import.meta.dirname, 'VITE_'), ...process.env };
  process.env.VITE_APP_URL = semBarra(env.VITE_APP_URL || APP_URL_PADRAO);
  process.env.VITE_LANDING_URL = semBarra(env.VITE_LANDING_URL || LANDING_URL_PADRAO);

  const raiz = join(import.meta.dirname, 'landing');
  return configBase('landing', {
    porta: 8081,
    // O POLICY.md fica na raiz do repositório (no Docker, montado ou copiado ao lado de frontend/).
    plugins: [pluginPolitica({ arquivo: join(import.meta.dirname, '..', 'POLICY.md') })],
    entradas: {
      inicio: join(raiz, 'index.html'),
      privacidade: join(raiz, 'privacidade.html'),
    },
  });
});
