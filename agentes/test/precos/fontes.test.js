'use strict';

const {
  fonteDaUrl,
  lerBinance,
  lerYahoo,
  moedaDoPar,
  urlBinance,
  urlYahoo,
} = require('../../src/precos/fontes');

const fixture = (nome) => require(`../fixtures/${nome}.json`);

// Leitura das fontes de preços (tarefa 036), com respostas reais gravadas.
describe('fonteDaUrl', () => {
  it('reconhece o chart do Yahoo e os klines da Binance', () => {
    expect(
      fonteDaUrl('https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=2y&interval=1d'),
    ).toEqual({ tipo: 'yahoo' });
    expect(
      fonteDaUrl(
        'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=500',
      ),
    ).toEqual({ tipo: 'binance', simbolo: 'USDTBRL' });
  });

  it('outros endereços não são suportados', () => {
    for (const url of [
      'https://brapi.dev/api/quote/PETR4',
      'https://query1.finance.yahoo.com/v7/finance/quote?symbols=PETR4.SA',
      'https://data-api.binance.vision/api/v3/ticker/price?symbol=USDTBRL',
      'https://data-api.binance.vision/api/v3/klines?interval=1d',
      'não é url',
    ]) {
      expect(fonteDaUrl(url)).toBeNull();
    }
  });
});

describe('URLs do período', () => {
  it('Yahoo: troca o range e mantém o intervalo diário', () => {
    const base = 'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=2y&interval=1d';
    expect(urlYahoo(base, '5d')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=5d&interval=1d',
    );
    expect(urlYahoo(base.replace('&interval=1d', '&interval=1wk'), '2y')).toBe(base);
  });

  it('Binance: limite e, no histórico, o início do período', () => {
    expect(urlBinance('USDTBRL', { limite: 5 })).toBe(
      'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=5',
    );
    expect(urlBinance('USDTBRL', { limite: 1000, inicio: 1700000000000 })).toBe(
      'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=1000&startTime=1700000000000',
    );
  });

  it('moeda do par da Binance pela cotação', () => {
    expect(moedaDoPar('USDTBRL')).toBe('BRL');
    expect(moedaDoPar('BTCUSDT')).toBe('USDT');
    expect(moedaDoPar('ETHBTC')).toBe('BTC');
    expect(moedaDoPar('XYZABC')).toBeNull();
  });
});

describe('lerYahoo', () => {
  it('cada pregão vira OHLCV com a data no fuso da bolsa e o preço arredondado', () => {
    const petr4 = lerYahoo(fixture('yahoo-PETR4.SA-5d'));
    expect(petr4.moeda).toBe('BRL');
    expect(petr4.pregoes.map((p) => p.data)).toEqual([
      '2026-10-09',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(petr4.pregoes.at(-1)).toEqual({
      data: '2026-10-16',
      abertura: 57.66,
      maxima: 59.68,
      minima: 57.53,
      fechamento: 59.68,
      volume: 56657800,
    });
    expect(petr4.pregoes[1].fechamento).toBe(56.85);

    const csco = lerYahoo(fixture('yahoo-CSCO-5d'));
    expect(csco.moeda).toBe('USD');
    expect(csco.pregoes[0].data).toBe('2026-10-12');
    expect(csco.pregoes.at(-1)).toMatchObject({ fechamento: 107.39, volume: 15881900 });
  });

  it('pregão sem fechamento fica de fora', () => {
    const corpo = structuredClone(fixture('yahoo-PETR4.SA-5d'));
    corpo.chart.result[0].indicators.quote[0].close[2] = null;
    expect(lerYahoo(corpo).pregoes.map((p) => p.data)).not.toContain('2026-10-14');
  });

  it('resposta fora do formato → erro', () => {
    expect(() => lerYahoo({ chart: { result: null, error: { code: 'Not Found' } } })).toThrow(
      /Yahoo/,
    );
  });
});

describe('lerBinance', () => {
  const agora = Date.parse('2026-10-17T15:00:00Z');

  it('cada dia fechado vira OHLCV com a data em UTC; o dia em aberto fica de fora', () => {
    const pregoes = lerBinance(fixture('binance-USDTBRL-5'), { agora });
    expect(pregoes.map((p) => p.data)).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(pregoes[0]).toEqual({
      data: '2026-10-13',
      abertura: 5.0163,
      maxima: 5.0438,
      minima: 4.9975,
      fechamento: 5.0396,
      volume: 88924133.8,
    });
  });

  it('resposta fora do formato → erro', () => {
    expect(() => lerBinance({ code: -1121, msg: 'Invalid symbol.' }, { agora })).toThrow(/Binance/);
  });
});
