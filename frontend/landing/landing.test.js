import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { politicaEmHtml } from './politica.js';
import { INCLUSAO_DESTAQUES, pluginDestaques } from './destaques.js';

// Página ausente vira documento vazio: cada teste falha por conta própria.
const ler = (arquivo) => {
  const caminho = join(import.meta.dirname, arquivo);
  return existsSync(caminho) ? readFileSync(caminho, 'utf8') : '';
};
const analisar = (html) => new DOMParser().parseFromString(html, 'text/html');
const links = (pagina) =>
  [...pagina.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
const meta = (pagina, atributo, valor) =>
  pagina.querySelector(`meta[${atributo}="${valor}"]`)?.getAttribute('content');

const inicio = analisar(ler('index.html'));
const privacidade = analisar(ler('privacidade.html'));

describe('landing page (fonte)', () => {
  it('tem título, explicação e o aviso de acesso por convite', () => {
    expect(inicio.querySelector('h1')?.textContent).toContain('Lista de Ações');
    expect(inicio.querySelector('main').textContent).toMatch(/por convite/);
  });

  it('explica como funciona: coleta → análise → nota → decisão', () => {
    const passos = [...inicio.querySelectorAll('#como-funciona ol > li h3')].map((h) =>
      h.textContent.trim(),
    );
    expect(passos).toEqual(['Coleta', 'Análise', 'Nota', 'Decisão']);
  });

  it('o link para o app leva ao login, a partir de VITE_APP_URL', () => {
    expect(links(inicio)).toContain('%VITE_APP_URL%/login');
  });

  it('nenhuma página tem link para cadastro de usuários', () => {
    for (const href of [...links(inicio), ...links(privacidade)]) {
      expect(href).not.toMatch(/cadastr|convite|registr|signup/i);
    }
  });

  it('as duas páginas apontam para a política de privacidade e para o início', () => {
    expect(links(inicio)).toContain('/privacidade.html');
    expect(links(privacidade)).toContain('/');
    expect(links(privacidade)).toContain('%VITE_APP_URL%/login');
  });

  it('tem metatags de SEO e Open Graph', () => {
    expect(meta(inicio, 'name', 'description')).toBeTruthy();
    expect(inicio.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      '%VITE_LANDING_URL%/',
    );
    expect(meta(inicio, 'property', 'og:type')).toBe('website');
    expect(meta(inicio, 'property', 'og:title')).toBeTruthy();
    expect(meta(inicio, 'property', 'og:description')).toBeTruthy();
    expect(meta(inicio, 'property', 'og:url')).toBe('%VITE_LANDING_URL%/');
    expect(meta(inicio, 'property', 'og:locale')).toBe('pt_BR');
    expect(meta(privacidade, 'name', 'description')).toBeTruthy();
    expect(privacidade.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      '%VITE_LANDING_URL%/privacidade.html',
    );
  });

  it('não carrega scripts nem estilos inline (CSP do host www)', () => {
    for (const pagina of [inicio, privacidade]) {
      expect(pagina.querySelectorAll('script')).toHaveLength(0);
      expect(pagina.querySelectorAll('style, [style]')).toHaveLength(0);
    }
  });
});

// Destaques dos agentes (tarefa 034): trecho gerado pela API e incluído por SSI no Nginx.
describe('destaques dos agentes', () => {
  const fonte = ler('index.html');

  it('a página tem o ponto de inclusão entre "Como funciona" e o acesso', () => {
    expect(INCLUSAO_DESTAQUES).toBe('<!--# include virtual="/destaques/destaques.html" -->');
    const posicao = fonte.indexOf(INCLUSAO_DESTAQUES);
    expect(posicao).toBeGreaterThan(fonte.indexOf('id="como-funciona"'));
    expect(posicao).toBeLessThan(fonte.indexOf('class="acesso"'));
  });

  it('o CSS tem as classes do trecho (sem estilo inline: CSP do www)', () => {
    const css = ler('estilo.css');
    for (const classe of [
      '.destaques',
      '.destaques-data--antiga',
      '.destaques-lista',
      '.destaques-ativo',
      '.destaques-nota',
      '.destaques-nota--1',
      '.destaques-nota--5',
      '.destaques-noticias',
      '.destaques-fonte',
      '.destaques-aviso',
    ]) {
      expect(css).toContain(classe);
    }
  });

  describe('plugin do Vite (DEV)', () => {
    let pasta;
    beforeAll(() => {
      pasta = mkdtempSync(join(tmpdir(), 'destaques-'));
    });
    afterAll(() => rmSync(pasta, { recursive: true, force: true }));

    const html = `<main>${INCLUSAO_DESTAQUES}</main>`;
    const transformar = (plugin, nome = 'index.html') =>
      plugin.transformIndexHtml(html, { filename: join('/x', nome) });

    it('só roda no servidor de desenvolvimento (no build, o Nginx inclui)', () => {
      expect(pluginDestaques({ pasta }).apply).toBe('serve');
    });

    it('troca o ponto de inclusão pelo trecho, quando existe', () => {
      writeFileSync(join(pasta, 'destaques.html'), '<section id="destaques">X</section>');
      expect(transformar(pluginDestaques({ pasta }))).toBe(
        '<main><section id="destaques">X</section></main>',
      );
    });

    it('sem arquivo ou sem pasta configurada, a página fica sem a seção', () => {
      expect(transformar(pluginDestaques({ pasta: join(pasta, 'nao-existe') }))).toBe(
        '<main></main>',
      );
      expect(transformar(pluginDestaques({}))).toBe('<main></main>');
    });

    it('não mexe na página de privacidade', () => {
      expect(transformar(pluginDestaques({ pasta }), 'privacidade.html')).toBe(html);
    });
  });
});

describe('política de privacidade gerada do POLICY.md', () => {
  const html = politicaEmHtml(
    readFileSync(join(import.meta.dirname, '..', '..', 'POLICY.md'), 'utf8'),
  );
  const pagina = analisar(`<main>${html}</main>`);

  it('traz as seções do POLICY.md', () => {
    const titulos = [...pagina.querySelectorAll('h2')].map((h) => h.textContent.trim());
    expect(titulos).toEqual(
      expect.arrayContaining([
        'Dados coletados',
        'Logs de acesso',
        'Exclusão dos dados',
        'Seus direitos',
      ]),
    );
    expect(pagina.querySelector('table')).not.toBeNull();
  });

  it('o título da página fica fora do conteúdo (a página já tem o seu h1)', () => {
    expect(pagina.querySelector('h1')).toBeNull();
  });

  it('não cita tarefas internas nem leva a arquivos .md do repositório', () => {
    expect(pagina.querySelector('main').textContent).not.toMatch(/tarefa \d{3}/i);
    for (const href of links(pagina)) expect(href).not.toMatch(/\.md(#|$)/);
  });

  it('tabelas ficam num contêiner com rolagem (telas estreitas)', () => {
    expect(pagina.querySelector('.tabela > table')).not.toBeNull();
  });
});

describe('build da landing', () => {
  let saida;
  const arquivo = (nome) => readFileSync(join(saida, nome), 'utf8');

  beforeAll(async () => {
    saida = mkdtempSync(join(tmpdir(), 'landing-'));
    process.env.VITE_APP_URL = 'http://app.teste:8080/';
    process.env.VITE_LANDING_URL = 'http://www.teste:8081';
    await build({
      configFile: join(import.meta.dirname, '..', 'vite.landing.config.js'),
      logLevel: 'silent',
      build: { outDir: saida },
    });
  }, 60_000);

  afterAll(() => {
    rmSync(saida, { recursive: true, force: true });
    delete process.env.VITE_APP_URL;
    delete process.env.VITE_LANDING_URL;
  });

  it('o link do app usa VITE_APP_URL do ambiente (sem barra dupla)', () => {
    const pagina = analisar(arquivo('index.html'));
    expect(links(pagina)).toContain('http://app.teste:8080/login');
    expect(pagina.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(
      'http://www.teste:8081/',
    );
  });

  it('gera a página de privacidade com o conteúdo do POLICY.md', () => {
    const pagina = analisar(arquivo('privacidade.html'));
    expect(pagina.querySelector('main').textContent).toContain('LGPD');
    expect(pagina.querySelector('main h2')).not.toBeNull();
  });

  it('mantém o ponto de inclusão dos destaques para o SSI do Nginx', () => {
    expect(arquivo('index.html')).toContain(INCLUSAO_DESTAQUES);
  });

  it('é leve: nenhum JavaScript no build', () => {
    const tudo = readdirSync(saida, { recursive: true }).map(String);
    expect(tudo.filter((f) => f.endsWith('.js'))).toEqual([]);
  });
});
