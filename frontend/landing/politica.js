import { readFileSync } from 'node:fs';
import { Marked, Renderer } from 'marked';

// Política de privacidade da landing (tarefa 026): gerada no build a partir do POLICY.md da
// raiz, para a página nunca divergir do documento. Roda só no Node (Vite), nada vai ao navegador.
const MARCADOR = '<!-- politica -->';

const marked = new Marked({
  renderer: {
    // A página já tem o seu h1; o título do documento sai do conteúdo.
    heading(token) {
      return token.depth === 1 ? '' : false;
    },
    // Tabelas largas rolam dentro do contêiner, sem rolagem horizontal da página.
    table(token) {
      return `<div class="tabela">${Renderer.prototype.table.call(this, token)}</div>`;
    },
  },
});

export const politicaEmHtml = (markdown) => marked.parse(markdown);

// Plugin do Vite: troca o marcador da página pelo POLICY.md convertido; no servidor de
// desenvolvimento, editar o POLICY.md recarrega a página.
export function pluginPolitica({ arquivo, pagina = 'privacidade.html' }) {
  return {
    name: 'lista-acoes:politica',
    transformIndexHtml(html, { filename }) {
      if (!filename.endsWith(pagina)) return html;
      return html.replace(MARCADOR, politicaEmHtml(readFileSync(arquivo, 'utf8')));
    },
    configureServer(server) {
      server.watcher.add(arquivo);
      server.watcher.on('change', (alterado) => {
        if (alterado === arquivo) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
