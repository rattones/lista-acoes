import { join } from 'node:path';

// Cada ponto de entrada (app e landing) tem sua raiz e gera um build próprio
// em dist/<alvo>, com seus próprios assets: os dois são servidos por hosts
// diferentes (app. e www.), cada um com sua pasta.
export function configBase(alvo, { porta, plugins = [] }) {
  return {
    root: join(import.meta.dirname, alvo),
    // O .env fica em frontend/, não na raiz de cada alvo.
    envDir: import.meta.dirname,
    plugins,
    server: { host: true, port: porta },
    preview: { host: true, port: porta },
    build: {
      outDir: join(import.meta.dirname, 'dist', alvo),
      emptyOutDir: true,
    },
  };
}
