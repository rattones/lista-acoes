import {
  classificarPar,
  daYahoo,
  interpretarUrl,
  parDoYahoo,
  simboloYahoo,
  tickerYahooDoPar,
  urlBinanceKlines,
  urlCoinGeckoPreco,
  urlGoogle,
  urlYahooChart,
} from './urls';

// Parsers de URL e mapas Google ↔ Yahoo do wrapper de ativos (tarefa 018).
describe('interpretarUrl', () => {
  it.each([
    ['https://www.google.com/finance/quote/PETR4:BVMF', { ticker: 'PETR4', bolsa: 'BVMF' }],
    ['https://www.google.com/finance/quote/CSCO:NASDAQ?hl=pt', { ticker: 'CSCO', bolsa: 'NASDAQ' }],
    ['https://google.com/finance/quote/ORCL:NYSE/', { ticker: 'ORCL', bolsa: 'NYSE' }],
    ['https://www.google.com.br/finance/quote/petr4:bvmf', { ticker: 'PETR4', bolsa: 'BVMF' }],
    ['https://www.google.com/finance/quote/BRK.B:NYSE', { ticker: 'BRK.B', bolsa: 'NYSE' }],
    ['https://www.google.com/finance/quote/.INX:INDEXSP', { ticker: '.INX', bolsa: 'INDEXSP' }],
    ['https://www.google.com/finance/quote/PETR4%3ABVMF', { ticker: 'PETR4', bolsa: 'BVMF' }],
  ])('Google, ação/índice: %s', (url, esperado) => {
    expect(interpretarUrl(url)).toEqual({ fonte: 'google', ...esperado });
  });

  it.each([
    ['https://www.google.com/finance/quote/USDT-BRL', { base: 'USDT', cotacao: 'BRL' }],
    ['https://www.google.com/finance/quote/BTC-USD?window=1M', { base: 'BTC', cotacao: 'USD' }],
    ['https://www.google.com/finance/quote/usd-brl', { base: 'USD', cotacao: 'BRL' }],
  ])('Google, par: %s', (url, par) => {
    expect(interpretarUrl(url)).toEqual({ fonte: 'google', par });
  });

  it.each([
    ['https://finance.yahoo.com/quote/PETR4.SA', 'PETR4.SA'],
    ['https://finance.yahoo.com/quote/PETR4.SA/', 'PETR4.SA'],
    ['https://finance.yahoo.com/quote/CSCO/history?p=CSCO', 'CSCO'],
    ['https://br.financas.yahoo.com/quote/petr4.sa', 'PETR4.SA'],
    ['https://uk.finance.yahoo.com/quote/BRL%3DX', 'BRL=X'],
    ['https://finance.yahoo.com/quote/%5EBVSP', '^BVSP'],
    ['https://finance.yahoo.com/quote/BTC-USD', 'BTC-USD'],
  ])('Yahoo: %s', (url, simbolo) => {
    expect(interpretarUrl(url)).toEqual({ fonte: 'yahoo', simbolo });
  });

  it.each([
    'https://www.investing.com/equities/petrobras-pn',
    'https://www.google.com.evil.com/finance/quote/PETR4:BVMF',
    'https://evilgoogle.com/finance/quote/PETR4:BVMF',
    'https://finance.yahoo.com.evil.com/quote/PETR4.SA',
    'ftp://finance.yahoo.com/quote/PETR4.SA',
    'https://www.google.com/search?q=PETR4',
    'https://www.google.com/finance/quote/',
    'https://www.google.com/finance/quote/PETR4',
    'https://www.google.com/finance/quote/PE TR4:BVMF',
    'https://finance.yahoo.com/news/alguma-noticia',
    'https://finance.yahoo.com/quote/',
    'não é url',
    '',
  ])('não suportada → erro url_nao_suportada: %s', (url) => {
    expect(() => interpretarUrl(url)).toThrow(
      expect.objectContaining({
        status: 400,
        response: expect.objectContaining({ erro: 'url_nao_suportada' }),
      }),
    );
  });
});

describe('mapa de bolsas Google ↔ Yahoo', () => {
  it.each([
    ['PETR4', 'BVMF', 'PETR4.SA'],
    ['CSCO', 'NASDAQ', 'CSCO'],
    ['ORCL', 'NYSE', 'ORCL'],
    ['SPY', 'NYSEARCA', 'SPY'],
    ['BRK.B', 'NYSE', 'BRK-B'],
    ['SHOP', 'TSE', 'SHOP.TO'],
    ['VOD', 'LON', 'VOD.L'],
    ['SAP', 'ETR', 'SAP.DE'],
    ['.INX', 'INDEXSP', '^GSPC'],
    ['IBOV', 'INDEXBVMF', '^BVSP'],
  ])('Google %s:%s → Yahoo %s', (ticker, bolsa, simbolo) => {
    expect(simboloYahoo(ticker, bolsa)).toBe(simbolo);
  });

  it('bolsa ou índice sem mapa → 400', () => {
    for (const [ticker, bolsa] of [
      ['XYZ', 'BOLSA_DESCONHECIDA'],
      ['.FOO', 'INDEXSP'],
    ]) {
      expect(() => simboloYahoo(ticker, bolsa)).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  it.each([
    ['PETR4.SA', 'SAO', { ativo: 'PETR4', bolsa: 'BVMF', ticker_google: 'PETR4:BVMF' }],
    ['CSCO', 'NMS', { ativo: 'CSCO', bolsa: 'NASDAQ', ticker_google: 'CSCO:NASDAQ' }],
    ['ORCL', 'NYQ', { ativo: 'ORCL', bolsa: 'NYSE', ticker_google: 'ORCL:NYSE' }],
    ['SPY', 'PCX', { ativo: 'SPY', bolsa: 'NYSEARCA', ticker_google: 'SPY:NYSEARCA' }],
    ['BRK-B', 'NYQ', { ativo: 'BRK.B', bolsa: 'NYSE', ticker_google: 'BRK.B:NYSE' }],
    ['SHOP.TO', 'TOR', { ativo: 'SHOP', bolsa: 'TSE', ticker_google: 'SHOP:TSE' }],
    ['^BVSP', 'SAO', { ativo: 'IBOV', bolsa: 'INDEXBVMF', ticker_google: 'IBOV:INDEXBVMF' }],
    ['XYZ', 'DESCONHECIDA', { ativo: 'XYZ', bolsa: null, ticker_google: null }],
  ])('Yahoo %s (%s) → Google', (simbolo, exchange, esperado) => {
    expect(daYahoo(simbolo, exchange)).toEqual(esperado);
  });
});

describe('pares (moedas e cripto)', () => {
  it.each([
    ['USD', 'BRL', 'moeda'],
    ['EUR', 'BRL', 'moeda'],
    ['USDT', 'BRL', 'stablecoin'],
    ['USDC', 'USD', 'stablecoin'],
    ['BTC', 'USD', 'cripto'],
    ['ETH', 'BRL', 'cripto'],
  ])('%s-%s é %s', (base, cotacao, tipo) => {
    expect(classificarPar(base, cotacao)).toBe(tipo);
  });

  it.each([
    ['USD', 'BRL', 'BRL=X'],
    ['EUR', 'BRL', 'EURBRL=X'],
    ['USDT', 'BRL', 'BRL=X'],
    ['USDT', 'USD', 'USDT-USD'],
    ['BTC', 'USD', 'BTC-USD'],
    ['BTC', 'BRL', 'BTC-USD'],
  ])('ticker Yahoo de %s-%s: %s', (base, cotacao, ticker) => {
    expect(tickerYahooDoPar(base, cotacao)).toBe(ticker);
  });

  it.each([
    ['BRL=X', { base: 'USD', cotacao: 'BRL' }],
    ['EURBRL=X', { base: 'EUR', cotacao: 'BRL' }],
    ['BTC-USD', { base: 'BTC', cotacao: 'USD' }],
    ['PETR4.SA', null],
    ['BRK-B', null],
  ])('par do símbolo Yahoo %s', (simbolo, par) => {
    expect(parDoYahoo(simbolo)).toEqual(par);
  });
});

describe('URLs das fontes', () => {
  it('monta as URLs no formato da carga inicial', () => {
    expect(urlYahooChart('PETR4.SA', '2y')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=2y&interval=1d',
    );
    expect(urlYahooChart('^BVSP', '1d')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=1d&interval=1d',
    );
    expect(urlYahooChart('BRL=X', '1d')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/BRL%3DX?range=1d&interval=1d',
    );
    expect(urlBinanceKlines('USDTBRL', 500)).toBe(
      'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=500',
    );
    expect(urlCoinGeckoPreco('tether', 'BRL')).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=brl&include_24hr_change=true',
    );
    expect(urlGoogle('CSCO:NASDAQ')).toBe('https://www.google.com/finance/quote/CSCO:NASDAQ');
  });
});
