import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClienteHttp } from '../src/wrapper/cliente-http';
import { criarAppTeste, idAtivo } from './utils/app-teste';

const PASTA = join(__dirname, 'fixtures', 'wrapper');
const fixture = (nome) => JSON.parse(readFileSync(join(PASTA, `${nome}.json`), 'utf8'));

// Respostas gravadas das fontes (Yahoo, Binance, CoinGecko): nenhum teste vai à rede.
const YAHOO = {
  'PETR4.SA': 'yahoo-PETR4.SA',
  CSCO: 'yahoo-CSCO',
  ORCL: 'yahoo-ORCL',
  GOOGL: 'yahoo-GOOGL',
  TSLA: 'yahoo-TSLA',
  'BRL=X': 'yahoo-BRL-X',
  SPY: 'yahoo-SPY',
  '^BVSP': 'yahoo-BVSP-indice',
  'BTC-USD': 'yahoo-BTC-USD',
};
const metaYahoo = (simbolo) => fixture(YAHOO[simbolo]).chart.result[0].meta;

function responder(url) {
  const { hostname, pathname, searchParams } = new URL(url);
  if (hostname === 'query1.finance.yahoo.com') {
    const simbolo = decodeURIComponent(pathname.split('/').pop());
    return YAHOO[simbolo] ? [200, fixture(YAHOO[simbolo])] : [404, fixture('yahoo-nao-encontrado')];
  }
  if (hostname === 'data-api.binance.vision') {
    return searchParams.get('symbol') === 'USDTBRL'
      ? [200, fixture('binance-USDTBRL')]
      : [400, fixture('binance-simbolo-invalido')];
  }
  if (hostname === 'api.coingecko.com' && pathname.endsWith('/search')) {
    return searchParams.get('query') === 'USDT'
      ? [200, fixture('coingecko-busca-USDT')]
      : [200, { coins: [] }];
  }
  if (hostname === 'api.coingecko.com' && pathname.endsWith('/simple/price')) {
    return [200, fixture('coingecko-preco-tether-brl')];
  }
  return [404, {}];
}

const CAMPOS = [
  'ativo',
  'tipo',
  'bolsa',
  'ticker_google',
  'ticker_yahoo',
  'url_historico',
  'url_cotacao',
  'url_pagina',
];
const campos = (registro, lista = CAMPOS) =>
  Object.fromEntries(lista.map((campo) => [campo, registro[campo]]));

describe('wrapper de dados de ativos', () => {
  let ctx;
  let admin;
  let pedidos;
  let foraDoAr;

  const preVisualizar = (url, token) =>
    ctx.http(token).post('/v1/ativos/pre-visualizar').send({ url });
  const ativoDoBanco = (codigo) =>
    ctx.db.prepare('SELECT * FROM ativos WHERE ativo = ?').get(codigo);

  beforeEach(async () => {
    ctx = await criarAppTeste();
    admin = ctx.http();
    pedidos = [];
    foraDoAr = false;
    const cliente = ctx.app.get(ClienteHttp);
    cliente.esperaBaseMs = 0;
    cliente.fetch = async (url, opcoes) => {
      pedidos.push({ url, userAgent: new Headers(opcoes.headers).get('user-agent') });
      if (foraDoAr) throw new TypeError('fetch failed');
      const [status, corpo] = responder(url);
      return new Response(JSON.stringify(corpo), { status });
    };
  });
  afterEach(() => ctx.app.close());

  describe('POST /v1/ativos/pre-visualizar', () => {
    it('Google PETR4:BVMF → ação da B3 pelo Yahoo (.SA), com a última cotação, sem gravar', async () => {
      const total = ctx.db.prepare('SELECT COUNT(*) FROM ativos').pluck().get();
      const res = await preVisualizar('https://www.google.com/finance/quote/PETR4:BVMF?hl=pt');
      expect(res.status).toBe(200);
      const meta = metaYahoo('PETR4.SA');
      expect(res.body).toEqual({
        ativo: {
          ativo: 'PETR4',
          nome: meta.longName,
          tipo: 'acao',
          bolsa: 'BVMF',
          ticker_google: 'PETR4:BVMF',
          ticker_yahoo: 'PETR4.SA',
          url_historico:
            'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=2y&interval=1d',
          url_cotacao:
            'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=1d&interval=1d',
          url_pagina: 'https://www.google.com/finance/quote/PETR4:BVMF',
          observacao: null,
        },
        cotacao: {
          preco: meta.regularMarketPrice,
          moeda: 'BRL',
          em: new Date(meta.regularMarketTime * 1000).toISOString(),
          fonte: 'yahoo',
        },
      });
      expect(ctx.db.prepare('SELECT COUNT(*) FROM ativos').pluck().get()).toBe(total);
      expect(pedidos.every((p) => p.userAgent === 'lista-acoes-teste/1.0')).toBe(true);
    });

    it('Yahoo PETR4.SA → mesmos campos, com a página do Google', async () => {
      const google = await preVisualizar('https://www.google.com/finance/quote/PETR4:BVMF');
      const yahoo = await preVisualizar('https://finance.yahoo.com/quote/PETR4.SA/');
      expect(yahoo.status).toBe(200);
      expect(yahoo.body.ativo).toEqual(google.body.ativo);
    });

    it('Google CSCO:NASDAQ e Yahoo CSCO (bolsa pelo exchangeName)', async () => {
      const google = await preVisualizar('https://www.google.com/finance/quote/CSCO:NASDAQ');
      expect(google.status).toBe(200);
      expect(campos(google.body.ativo, ['ativo', 'tipo', 'bolsa', 'ticker_yahoo'])).toEqual({
        ativo: 'CSCO',
        tipo: 'acao',
        bolsa: 'NASDAQ',
        ticker_yahoo: 'CSCO',
      });
      const yahoo = await preVisualizar('https://finance.yahoo.com/quote/CSCO');
      expect(yahoo.body.ativo).toEqual(google.body.ativo);
      expect(yahoo.body.cotacao.moeda).toBe('USD');
    });

    it('Google USDT-BRL → stablecoin: histórico na Binance, cotação no CoinGecko, BRL=X no Yahoo', async () => {
      const res = await preVisualizar('https://www.google.com/finance/quote/USDT-BRL');
      expect(res.status).toBe(200);
      expect(res.body.ativo).toEqual({
        ativo: 'USDT-BRL',
        nome: 'Tether (USDT/BRL)',
        tipo: 'stablecoin',
        bolsa: null,
        ticker_google: 'USDT-BRL',
        ticker_yahoo: 'BRL=X',
        url_historico:
          'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=500',
        url_cotacao:
          'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=brl&include_24hr_change=true',
        url_pagina: 'https://www.google.com/finance/quote/USDT-BRL',
        observacao: expect.stringContaining('BRL=X'),
      });
      const preco = fixture('coingecko-preco-tether-brl').tether;
      expect(res.body.cotacao).toEqual({
        preco: preco.brl,
        moeda: 'BRL',
        variacao_24h: preco.brl_24h_change,
        em: expect.any(String),
        fonte: 'coingecko',
      });
    });

    it('Google USD-BRL → moeda pelo Yahoo (BRL=X)', async () => {
      const res = await preVisualizar('https://www.google.com/finance/quote/USD-BRL');
      expect(res.status).toBe(200);
      expect(res.body.ativo).toMatchObject({
        ativo: 'USD-BRL',
        nome: 'USD/BRL',
        tipo: 'moeda',
        bolsa: null,
        ticker_google: 'USD-BRL',
        ticker_yahoo: 'BRL=X',
        url_historico:
          'https://query1.finance.yahoo.com/v8/finance/chart/BRL%3DX?range=2y&interval=1d',
      });
    });

    it('ETF e índice: tipo pelo instrumentType do Yahoo', async () => {
      const etf = await preVisualizar('https://www.google.com/finance/quote/SPY:NYSEARCA');
      expect(campos(etf.body.ativo, ['ativo', 'tipo', 'bolsa', 'ticker_yahoo'])).toEqual({
        ativo: 'SPY',
        tipo: 'etf',
        bolsa: 'NYSEARCA',
        ticker_yahoo: 'SPY',
      });
      const indice = await preVisualizar('https://finance.yahoo.com/quote/%5EBVSP');
      expect(campos(indice.body.ativo, ['ativo', 'tipo', 'bolsa', 'ticker_google'])).toEqual({
        ativo: 'IBOV',
        tipo: 'indice',
        bolsa: 'INDEXBVMF',
        ticker_google: 'IBOV:INDEXBVMF',
      });
    });

    it('cripto sem par na Binance usa o histórico do Yahoo, com observação', async () => {
      const res = await preVisualizar('https://finance.yahoo.com/quote/BTC-USD');
      expect(res.status).toBe(200);
      expect(res.body.ativo).toMatchObject({
        ativo: 'BTC-USD',
        tipo: 'cripto',
        ticker_google: 'BTC-USD',
        ticker_yahoo: 'BTC-USD',
        url_historico:
          'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=2y&interval=1d',
        observacao: expect.stringContaining('Binance'),
      });
    });

    it('domínio ou formato não suportado → 400 url_nao_suportada, sem ir à rede', async () => {
      for (const url of [
        'https://www.investing.com/equities/petrobras-pn',
        'https://www.google.com/finance/quote/PETR4',
      ]) {
        const res = await preVisualizar(url);
        expect(res.status).toBe(400);
        expect(res.body.erro).toBe('url_nao_suportada');
      }
      expect((await preVisualizar('nao-e-url')).status).toBe(400);
      expect((await ctx.http().post('/v1/ativos/pre-visualizar').send({})).status).toBe(400);
      expect(pedidos).toHaveLength(0);
    });

    it('ticker inexistente na fonte → 422 ativo_nao_encontrado', async () => {
      for (const url of [
        'https://www.google.com/finance/quote/NAOEXISTE:NASDAQ',
        'https://www.google.com/finance/quote/XYZ-BRL',
      ]) {
        const res = await preVisualizar(url);
        expect(res.status).toBe(422);
        expect(res.body.erro).toBe('ativo_nao_encontrado');
      }
    });

    it('fonte fora do ar → 502 fonte_indisponivel com mensagem clara', async () => {
      foraDoAr = true;
      const res = await preVisualizar('https://www.google.com/finance/quote/PETR4:BVMF');
      expect(res.status).toBe(502);
      expect(res.body.erro).toBe('fonte_indisponivel');
      expect(res.body.mensagem).toMatch(/Yahoo Finance/);
    });

    it('leitor → 403; sem token → 401', async () => {
      const url = 'https://www.google.com/finance/quote/PETR4:BVMF';
      expect((await preVisualizar(url, ctx.tokens.leitor)).status).toBe(403);
      expect((await preVisualizar(url, null)).status).toBe(401);
      expect(pedidos).toHaveLength(0);
    });
  });

  describe('POST /v1/ativos/:id/atualizar-dados', () => {
    it('refaz a busca pela url_pagina e atualiza o cadastro, mantendo código, status e observação', async () => {
      const id = idAtivo(ctx.db, 'CSCO');
      ctx.db
        .prepare(
          "UPDATE ativos SET nome = 'antigo', url_cotacao = NULL, status = 'inativo' WHERE id = ?",
        )
        .run(id);
      const res = await admin.post(`/v1/ativos/${id}/atualizar-dados`);
      expect(res.status).toBe(200);
      expect(res.body.ativo).toMatchObject({
        id,
        ativo: 'CSCO',
        nome: metaYahoo('CSCO').longName,
        status: 'inativo',
        url_cotacao: 'https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=1d&interval=1d',
      });
      expect(res.body.cotacao.preco).toBe(metaYahoo('CSCO').regularMarketPrice);
      expect(ativoDoBanco('CSCO').nome).toBe(metaYahoo('CSCO').longName);
    });

    it('PETR4 passa a ter a cotação pelo Yahoo; a observação fica', async () => {
      const antes = ativoDoBanco('PETR4');
      const res = await admin.post(`/v1/ativos/${antes.id}/atualizar-dados`);
      expect(res.status).toBe(200);
      expect(ativoDoBanco('PETR4')).toMatchObject({
        url_cotacao:
          'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=1d&interval=1d',
        observacao: antes.observacao,
      });
    });

    it('fonte fora do ar → 502 e nada muda', async () => {
      const antes = ativoDoBanco('CSCO');
      foraDoAr = true;
      expect((await admin.post(`/v1/ativos/${antes.id}/atualizar-dados`)).status).toBe(502);
      expect(ativoDoBanco('CSCO')).toEqual(antes);
    });

    it('ativo inexistente ou excluído → 404; leitor → 403', async () => {
      expect((await admin.post('/v1/ativos/999/atualizar-dados')).status).toBe(404);
      const id = idAtivo(ctx.db, 'ORCL');
      expect(
        (await ctx.http(ctx.tokens.leitor).post(`/v1/ativos/${id}/atualizar-dados`)).status,
      ).toBe(403);
      await admin.delete(`/v1/ativos/${id}`);
      expect((await admin.post(`/v1/ativos/${id}/atualizar-dados`)).status).toBe(404);
    });
  });

  it('critério de aceite: os 6 ativos da carga inicial são recriados a partir da url_pagina', async () => {
    const iniciais = ctx.db.prepare('SELECT * FROM ativos ORDER BY ativo').all();
    expect(iniciais).toHaveLength(6);
    for (const inicial of iniciais) {
      const previa = await preVisualizar(inicial.url_pagina);
      expect(previa.status).toBe(200);
      // PETR4: a carga usava a brapi na cotação; o wrapper usa o Yahoo (decisão da 018).
      const comparar = CAMPOS.filter((c) => !(inicial.ativo === 'PETR4' && c === 'url_cotacao'));
      expect(campos(previa.body.ativo, comparar)).toEqual(campos(inicial, comparar));

      expect(
        (await admin.delete(`/v1/ativos/${inicial.id}`).query({ permanente: true })).status,
      ).toBe(204);
      const criado = await admin.post('/v1/ativos').send(previa.body.ativo);
      expect(criado.status).toBe(201);
      expect(criado.body).toMatchObject(campos(previa.body.ativo));
    }
  });
});
