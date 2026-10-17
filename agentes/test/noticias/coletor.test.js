'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { FonteIndisponivel } = require('@lista-acoes/comum/cliente-http');
const { coletarNoticias } = require('../../src/noticias');
const { logFalso } = require('../apoio');

const feed = (nome) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'rss', `${nome}.xml`), 'utf8');
const AGORA = Date.parse('2026-10-17T15:00:00Z'); // 12:00 em São Paulo

const ATIVOS = [
  { id: 1, ativo: 'CSCO', nome: 'Cisco Systems', status: 'ativo' },
  { id: 4, ativo: 'PETR4', nome: 'Petrobras PN', status: 'ativo' },
];
const GERAIS = [
  { nome: 'Valor Econômico', url: 'https://valor.teste/rss' },
  { nome: 'MarketWatch', url: 'https://mw.teste/rss' },
];

function apiFalsa({ ativos = ATIVOS, falharLote = false } = {}) {
  const lotes = [];
  const gets = [];
  return {
    lotes,
    gets,
    async get(caminho) {
      gets.push(caminho);
      const codigo = new URL(caminho, 'http://api').searchParams.get('ativo');
      const dados = ativos.filter((a) => !codigo || a.ativo === codigo);
      return { dados, paginacao: { pagina: 1, total: dados.length, total_paginas: 1 } };
    },
    async enviarLote(caminho, itens) {
      if (falharLote) throw new Error('API recusou o lote');
      lotes.push({ caminho, itens });
      return { inseridos: itens.length, atualizados: 0 };
    },
  };
}

// Feeds falsos pelas URLs: Google News por ativo (o en-US da Petrobras repete o pt-BR) e os gerais.
function httpFalso({ fora = [], respostas = {} } = {}) {
  const urls = [];
  return {
    urls,
    async getTexto(url, { fonte }) {
      urls.push(url);
      if (fora.some((t) => url.includes(t))) throw new FonteIndisponivel(fonte);
      for (const [trecho, corpo] of Object.entries(respostas)) {
        if (url.includes(trecho)) return { status: 200, corpo };
      }
      const q = new URL(url).searchParams.get('q') ?? '';
      if (q.includes('CSCO')) return { status: 200, corpo: feed('google-CSCO-en') };
      if (q.includes('PETR4')) return { status: 200, corpo: feed('google-PETR4-pt') };
      if (url.includes('valor.teste')) return { status: 200, corpo: feed('geral-valor') };
      if (url.includes('mw.teste')) return { status: 200, corpo: feed('geral-marketwatch') };
      return { status: 404, corpo: 'não encontrado' };
    },
  };
}

const coletar = (opcoes = {}, deps = {}) => {
  const contexto = {
    api: deps.api ?? apiFalsa(),
    http: deps.http ?? httpFalso(),
    log: logFalso(),
    agora: () => deps.agora ?? AGORA,
    fuso: 'America/Sao_Paulo',
    feedsGerais: deps.feedsGerais ?? GERAIS,
  };
  return coletarNoticias(contexto, opcoes).then((resumo) => ({ resumo, ...contexto }));
};
const itens = (api) => api.lotes.flatMap((l) => l.itens);

describe('coletarNoticias (tarefa 037)', () => {
  it('busca o Google News de cada ativo (pt-BR e en-US) e os feeds gerais', async () => {
    const { api, http } = await coletar();
    expect(api.gets[0]).toMatch(/^\/v1\/ativos\?.*status=ativo/);
    const buscas = http.urls.filter((u) => u.includes('news.google.com'));
    expect(buscas).toHaveLength(4);
    expect(buscas.map((u) => new URL(u).searchParams.get('hl'))).toEqual([
      'pt-BR',
      'en-US',
      'pt-BR',
      'en-US',
    ]);
    expect(http.urls.slice(4)).toEqual(['https://valor.teste/rss', 'https://mw.teste/rss']);
    expect(api.lotes.every((l) => l.caminho === '/v1/noticias/lote')).toBe(true);
  });

  it('notícia do ativo leva o ativo_id; geral vai sem ativo_id; data no horário local', async () => {
    const { api } = await coletar();
    const petr4 = itens(api).find((i) => i.titulo.startsWith('Petrobras (PETR4): pagamento'));
    expect(petr4).toEqual({
      ativo_id: 4,
      titulo:
        'Petrobras (PETR4): pagamento bilionário e acordo de US$ 859 milhões; de onde vem o dinheiro?',
      resumo: null,
      fonte: 'Suno - Investimentos Inteligentes',
      url: expect.stringMatching(/^https:\/\/news\.google\.com\//),
      publicada_em: '2026-10-14 13:45:03',
    });
    const geral = itens(api).find((i) => i.fonte === 'Valor Econômico');
    expect(geral).not.toHaveProperty('ativo_id');
    expect(geral).not.toHaveProperty('sentimento');
    expect(geral.publicada_em).toBe('2026-10-17 12:10:09');
  });

  it('a mesma URL em dois feeds entra uma vez, com o ativo', async () => {
    const { api, resumo } = await coletar();
    const urls = itens(api).map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
    // pt-BR e en-US da Petrobras devolvem as mesmas 6 notícias: entram uma vez cada.
    expect(itens(api).filter((i) => i.ativo_id === 4)).toHaveLength(6);
    expect(itens(api).filter((i) => i.ativo_id === 1)).toHaveLength(6);
    expect(resumo).toEqual({
      ativos: 2,
      feeds: 6,
      noticias: 24,
      inseridos: 24,
      atualizados: 0,
      falhas: 0,
    });
  });

  it('só as publicadas nos últimos 7 dias', async () => {
    const agora = Date.parse('2026-10-20T15:00:00Z');
    const { api } = await coletar({}, { agora, feedsGerais: [] });
    const csco = itens(api).filter((i) => i.ativo_id === 1);
    expect(csco).toHaveLength(5);
    expect(csco.every((i) => i.publicada_em >= '2026-10-13 12:00:00')).toBe(true);
  });

  it('no máximo 20 por feed, as mais recentes', async () => {
    const item = (i) =>
      `<item><title>n${i}</title><link>https://muitas.teste/${i}</link><pubDate>${new Date(
        AGORA - i * 60000,
      ).toUTCString()}</pubDate></item>`;
    const xml = `<rss><channel>${Array.from({ length: 25 }, (_, i) => item(24 - i)).join('')}</channel></rss>`;
    const { api } = await coletar(
      {},
      {
        api: apiFalsa({ ativos: [] }),
        feedsGerais: [{ nome: 'Muitas', url: 'https://muitas.teste/rss' }],
        http: httpFalso({ respostas: { 'muitas.teste': xml } }),
      },
    );
    const titulos = itens(api).map((i) => i.titulo);
    expect(titulos).toHaveLength(20);
    expect(titulos).toContain('n0');
    expect(titulos).not.toContain('n20');
  });

  it('--ativo: só os feeds desse ativo, sem os gerais; código fora da lista é falha', async () => {
    const { http, api } = await coletar({ ativo: 'PETR4' });
    expect(api.gets[0]).toContain('ativo=PETR4');
    expect(http.urls).toHaveLength(2);
    expect(http.urls.every((u) => u.includes('news.google.com'))).toBe(true);

    const { resumo, log } = await coletar({ ativo: 'XPTO' });
    expect(resumo).toMatchObject({ ativos: 0, falhas: 1 });
    expect(log.registros).toContainEqual(
      expect.objectContaining({ nivel: 'error', mensagem: expect.stringContaining('XPTO') }),
    );
  });

  it('feed fora do ar, com 4xx ou XML inválido é pulado; os outros são gravados', async () => {
    const { api, resumo, log } = await coletar(
      {},
      {
        http: httpFalso({
          fora: ['valor.teste'],
          respostas: { 'mw.teste': '<html>manutenção</html>', 'hl=en-US': 'x' },
        }),
      },
    );
    expect(itens(api).length).toBeGreaterThan(0);
    // en-US das duas buscas (XML inválido), Valor (fora do ar) e MarketWatch (sem RSS).
    expect(resumo.falhas).toBe(4);
    const erros = log.registros.filter((r) => r.nivel === 'error');
    expect(erros.map((e) => e.dados.feed).sort()).toEqual([
      'Google News (CSCO, en-US)',
      'Google News (PETR4, en-US)',
      'MarketWatch',
      'Valor Econômico',
    ]);
  });

  it('lote recusado pela API conta como falha', async () => {
    const { resumo, log } = await coletar({}, { api: apiFalsa({ falharLote: true }) });
    expect(resumo.falhas).toBe(1);
    expect(log.registros).toContainEqual(expect.objectContaining({ nivel: 'error' }));
  });
});
