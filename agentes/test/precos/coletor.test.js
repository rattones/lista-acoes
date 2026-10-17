'use strict';

const { FonteIndisponivel } = require('@lista-acoes/comum/cliente-http');
const { coletarPrecos } = require('../../src/precos');
const { logFalso } = require('../apoio');

const fixture = (nome) => require(`../fixtures/${nome}.json`);
const AGORA = Date.parse('2026-10-17T22:30:00Z'); // 19:30 em São Paulo
const DIA = 24 * 60 * 60 * 1000;

const ativo = (id, codigo, url_historico) => ({
  id,
  ativo: codigo,
  status: 'ativo',
  url_historico,
});
const yahoo = (simbolo) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${simbolo}?range=2y&interval=1d`;
const ATIVOS = [
  ativo(1, 'CSCO', yahoo('CSCO')),
  ativo(4, 'PETR4', yahoo('PETR4.SA')),
  ativo(
    6,
    'USDT-BRL',
    'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=500',
  ),
];

// API falsa: ativos com status ativo, total de preços por ativo e lotes gravados.
function apiFalsa({ ativos = ATIVOS, comPrecos = [1, 4, 6], falharLote = [] } = {}) {
  const lotes = [];
  const gets = [];
  return {
    lotes,
    gets,
    async get(caminho) {
      gets.push(caminho);
      const url = new URL(caminho, 'http://api');
      if (url.pathname === '/v1/ativos') {
        const codigo = url.searchParams.get('ativo');
        const dados = ativos.filter((a) => !codigo || a.ativo === codigo);
        return { dados, paginacao: { pagina: 1, total: dados.length, total_paginas: 1 } };
      }
      if (url.pathname === '/v1/precos') {
        const total = comPrecos.includes(Number(url.searchParams.get('ativo_id'))) ? 10 : 0;
        return { dados: [], paginacao: { total } };
      }
      throw new Error(`rota inesperada: ${caminho}`);
    },
    async enviarLote(caminho, itens) {
      if (falharLote.includes(itens[0]?.ativo_id)) throw new Error('API recusou o lote');
      lotes.push({ caminho, itens });
      return { inseridos: itens.length, atualizados: 0 };
    },
  };
}

// Fontes falsas: responde pelas URLs pedidas, com as respostas gravadas.
function httpFalso({ fora = [] } = {}) {
  const urls = [];
  return {
    urls,
    async getJson(url, { fonte }) {
      urls.push(url);
      if (fora.some((trecho) => url.includes(trecho))) throw new FonteIndisponivel(fonte);
      if (url.includes('/chart/CSCO')) return { status: 200, corpo: fixture('yahoo-CSCO-5d') };
      if (url.includes('/chart/PETR4.SA'))
        return { status: 200, corpo: fixture('yahoo-PETR4.SA-5d') };
      if (url.includes('klines')) return { status: 200, corpo: fixture('binance-USDTBRL-5') };
      return { status: 404, corpo: { chart: { result: null, error: { code: 'Not Found' } } } };
    },
  };
}

const coletar = (opcoes = {}, deps = {}) => {
  const contexto = {
    api: deps.api ?? apiFalsa(),
    http: deps.http ?? httpFalso(),
    log: logFalso(),
    agora: () => AGORA,
  };
  return coletarPrecos(contexto, opcoes).then((resumo) => ({ resumo, ...contexto }));
};

const itensDo = (api, ativoId) =>
  api.lotes.flatMap((l) => l.itens).filter((i) => i.ativo_id === ativoId);

describe('coletarPrecos (tarefa 036)', () => {
  it('pede os últimos 5 pregões de cada ativo ativo e grava pelo lote', async () => {
    const { resumo, api, http } = await coletar();
    expect(api.gets[0]).toMatch(/^\/v1\/ativos\?.*status=ativo/);
    expect(http.urls).toEqual([
      'https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=5d&interval=1d',
      'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=5d&interval=1d',
      'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=5',
    ]);
    expect(api.lotes.every((l) => l.caminho === '/v1/precos/lote')).toBe(true);

    expect(itensDo(api, 4)).toHaveLength(5);
    expect(itensDo(api, 4).at(-1)).toEqual({
      ativo_id: 4,
      data: '2026-10-16',
      abertura: 57.66,
      maxima: 59.68,
      minima: 57.53,
      fechamento: 59.68,
      volume: 56657800,
      moeda: 'BRL',
      fonte: 'yahoo',
    });
    expect(itensDo(api, 1)[0]).toMatchObject({ moeda: 'USD', fonte: 'yahoo' });
    // 19:30 em São Paulo = 22:30 UTC: o dia 17 da Binance ainda está aberto.
    expect(itensDo(api, 6).map((i) => i.data)).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(itensDo(api, 6)[0]).toMatchObject({ moeda: 'BRL', fonte: 'binance' });

    expect(resumo).toEqual({
      ativos: 3,
      historico: 0,
      inseridos: 14,
      atualizados: 0,
      falhas: 0,
    });
  });

  it('ativo sem nenhum preço recebe o histórico de 2 anos', async () => {
    const { resumo, http } = await coletar({}, { api: apiFalsa({ comPrecos: [1] }) });
    expect(http.urls).toContain(
      'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=2y&interval=1d',
    );
    expect(http.urls).toContain(
      `https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=1000&startTime=${AGORA - 730 * DIA}`,
    );
    expect(http.urls).toContain(
      'https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=5d&interval=1d',
    );
    expect(resumo.historico).toBe(2);
  });

  it('--historico força o histórico de 2 anos para todos', async () => {
    const { http, api } = await coletar({ historico: true });
    expect(http.urls.filter((u) => u.includes('range=2y'))).toHaveLength(2);
    expect(api.gets.some((g) => g.startsWith('/v1/precos'))).toBe(false);
  });

  it('o histórico da Binance continua pela página seguinte enquanto vier cheia', async () => {
    const inicio = AGORA - 730 * DIA;
    const kline = (abertura) => [abertura, '5', '5', '5', '5', '1', abertura + DIA - 1];
    const paginas = [
      Array.from({ length: 1000 }, (_, i) => kline(inicio + i * DIA)),
      [kline(inicio + 1000 * DIA)],
    ];
    const urls = [];
    const http = {
      urls,
      async getJson(url) {
        urls.push(url);
        return {
          status: 200,
          corpo: url.includes('klines') ? paginas.shift() : fixture('yahoo-CSCO-5d'),
        };
      },
    };
    const api = apiFalsa({ ativos: [ATIVOS[2]], comPrecos: [] });
    await coletar({}, { api, http });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain(`startTime=${inicio + 1000 * DIA}`);
  });

  it('--ativo restringe a um código; código fora dos ativos ativos é falha', async () => {
    const { http, api } = await coletar({ ativo: 'PETR4' });
    expect(api.gets[0]).toContain('ativo=PETR4');
    expect(http.urls).toHaveLength(1);

    const { resumo, log } = await coletar({ ativo: 'XPTO' });
    expect(resumo).toMatchObject({ ativos: 0, falhas: 1 });
    expect(log.registros).toContainEqual(
      expect.objectContaining({ nivel: 'error', mensagem: expect.stringContaining('XPTO') }),
    );
  });

  it('URL desconhecida, fonte fora do ar ou lote recusado: o ativo é pulado e os outros gravados', async () => {
    const ativos = [...ATIVOS, ativo(9, 'XPTO', 'https://brapi.dev/api/quote/XPTO')];
    const { resumo, api, log } = await coletar(
      {},
      { api: apiFalsa({ ativos, falharLote: [1] }), http: httpFalso({ fora: ['klines'] }) },
    );
    expect(itensDo(api, 4)).toHaveLength(5);
    expect(resumo).toMatchObject({ ativos: 4, inseridos: 5, falhas: 3 });
    const erros = log.registros.filter((r) => r.nivel === 'error');
    expect(erros.map((e) => e.dados.ativo).sort()).toEqual(['CSCO', 'USDT-BRL', 'XPTO']);
    expect(erros.find((e) => e.dados.ativo === 'XPTO').dados.erro).toMatch(/não suportad/);
  });

  it('ativo que a fonte não conhece (4xx) é falha com o status', async () => {
    const ativos = [ativo(7, 'NAOEXISTE', yahoo('NAOEXISTE'))];
    const { resumo, log } = await coletar({}, { api: apiFalsa({ ativos, comPrecos: [7] }) });
    expect(resumo.falhas).toBe(1);
    expect(log.registros.find((r) => r.nivel === 'error').dados.erro).toMatch(/404/);
  });

  it('lista de ativos paginada: busca todas as páginas', async () => {
    const paginas = { 1: [ATIVOS[0]], 2: [ATIVOS[1]] };
    const api = apiFalsa();
    const get = api.get.bind(api);
    api.get = async (caminho) => {
      if (!caminho.startsWith('/v1/ativos')) return get(caminho);
      api.gets.push(caminho);
      const pagina = Number(new URL(caminho, 'http://api').searchParams.get('pagina'));
      return { dados: paginas[pagina], paginacao: { pagina, total: 2, total_paginas: 2 } };
    };
    const { resumo } = await coletar({}, { api });
    expect(resumo.ativos).toBe(2);
  });
});
