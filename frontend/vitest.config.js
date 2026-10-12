import { defineConfig, mergeConfig } from 'vitest/config';
import configApp from './vite.app.config.js';

export default mergeConfig(
  configApp,
  defineConfig({
    // A raiz do Vite do app é app/; os testes cobrem app/ e landing/.
    root: import.meta.dirname,
    test: {
      environment: 'jsdom',
      include: ['app/**/*.test.js', 'landing/**/*.test.js'],
      setupFiles: ['test/setup.js'],
      // O Vuetify importa CSS de dentro do pacote; precisa passar pelo Vite.
      server: { deps: { inline: ['vuetify'] } },
    },
  }),
);
