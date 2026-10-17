import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Destaques dos agentes (tarefa 034): em PROD, o Nginx inclui por SSI o trecho que o CLI do banco
// gera (destaques.html). No servidor de desenvolvimento do Vite não há SSI: este plugin faz a
// mesma inclusão lendo o arquivo da pasta DESTAQUES_DIR. No build, o ponto de inclusão fica na
// página para o Nginx.
export const INCLUSAO_DESTAQUES = '<!--# include virtual="/destaques/destaques.html" -->';

export function pluginDestaques({ pasta, pagina = 'index.html' } = {}) {
  return {
    name: 'lista-acoes:destaques',
    apply: 'serve',
    transformIndexHtml(html, { filename }) {
      if (!filename.endsWith(pagina)) return html;
      const arquivo = pasta && join(pasta, 'destaques.html');
      const trecho = arquivo && existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '';
      return html.replace(INCLUSAO_DESTAQUES, trecho);
    },
  };
}
