'use strict';

// URLs das fontes públicas de cotações, sem login nem chave (tarefa 018; em comum/ desde a 035):
// Yahoo Finance (chart), Binance (klines diários) e CoinGecko (busca e preço).

const urlYahooChart = (simbolo, range) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${range}&interval=1d`;
const urlBinanceKlines = (simbolo, limite) =>
  `https://data-api.binance.vision/api/v3/klines?symbol=${simbolo}&interval=1d&limit=${limite}`;
const urlCoinGeckoBusca = (consulta) =>
  `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(consulta)}`;
const urlCoinGeckoPreco = (id, moeda) =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${moeda.toLowerCase()}&include_24hr_change=true`;

module.exports = { urlYahooChart, urlBinanceKlines, urlCoinGeckoBusca, urlCoinGeckoPreco };
