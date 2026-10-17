const {
  urlBinanceKlines,
  urlCoinGeckoBusca,
  urlCoinGeckoPreco,
  urlYahooChart,
} = require('../src/fontes');

// URLs das fontes públicas de cotações (tarefa 018; em comum/ desde a 035).
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
    expect(urlCoinGeckoBusca('usd coin')).toBe(
      'https://api.coingecko.com/api/v3/search?query=usd%20coin',
    );
  });
});
