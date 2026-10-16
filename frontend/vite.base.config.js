import { join } from 'node:path';

// HOSTS_PERMITIDOS (separados por vírgula): hostnames aceitos pelo servidor
// de desenvolvimento além de localhost, ex.: casa-ratton.local,casaratton.ddns.net.
const hostsPermitidos = (process.env.HOSTS_PERMITIDOS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

// Cada ponto de entrada (app e landing) tem sua raiz e gera um build próprio
// em dist/<alvo>, com seus próprios assets: os dois são servidos por hosts
// diferentes (app. e www.), cada um com sua pasta.
// entradas: páginas HTML do build (padrão: só o index.html da raiz do alvo).
export function configBase(alvo, { porta, plugins = [], proxy, entradas }) {
  const servidor = { host: true, port: porta, allowedHosts: hostsPermitidos };
  return {
    root: join(import.meta.dirname, alvo),
    // O .env fica em frontend/, não na raiz de cada alvo.
    envDir: import.meta.dirname,
    plugins,
    server: { ...servidor, proxy },
    preview: servidor,
    build: {
      outDir: join(import.meta.dirname, 'dist', alvo),
      emptyOutDir: true,
      ...(entradas && { rolldownOptions: { input: entradas } }),
    },
  };
}
