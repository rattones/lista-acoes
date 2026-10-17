'use strict';

const { urlBinanceKlines } = require('@lista-acoes/comum/fontes');

// Fontes de preços do coletor (tarefa 036): o chart do Yahoo Finance e os klines diários da
// Binance, a partir da url_historico do ativo (formato da carga inicial e do wrapper).

const HOST_YAHOO = /^query[12]\.finance\.yahoo\.com$/;
const CAMINHO_YAHOO = /^\/v8\/finance\/chart\/[^/]+$/;
const HOST_BINANCE = /^(data-api\.binance\.vision|api\d?\.binance\.com)$/;

// { tipo: 'yahoo' } | { tipo: 'binance', simbolo } | null (endereço não suportado).
function fonteDaUrl(texto) {
  let url;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (HOST_YAHOO.test(url.hostname) && CAMINHO_YAHOO.test(url.pathname)) return { tipo: 'yahoo' };
  const simbolo = url.searchParams.get('symbol');
  if (HOST_BINANCE.test(url.hostname) && url.pathname === '/api/v3/klines' && simbolo) {
    return { tipo: 'binance', simbolo };
  }
  return null;
}

// A url_historico com outro período (5d, 2y), sempre diária.
function urlYahoo(texto, range) {
  const url = new URL(texto);
  url.searchParams.set('range', range);
  url.searchParams.set('interval', '1d');
  return url.toString();
}

const urlBinance = (simbolo, { limite, inicio }) =>
  urlBinanceKlines(simbolo, limite) + (inicio === undefined ? '' : `&startTime=${inicio}`);

// Moeda do par da Binance pela cotação (fim do símbolo): USDTBRL → BRL.
const COTACOES = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'BRL', 'EUR', 'TRY', 'BTC', 'ETH', 'BNB'];
const moedaDoPar = (simbolo) =>
  COTACOES.find((cotacao) => simbolo.endsWith(cotacao) && simbolo.length > cotacao.length) ?? null;

const dataNoFuso = (fuso) => {
  const formato = new Intl.DateTimeFormat('en-CA', { timeZone: fuso });
  return (ms) => formato.format(ms);
};
const arredondar = (casas) => (valor) =>
  valor === null || valor === undefined ? null : Number(valor.toFixed(casas));

// Chart do Yahoo → { moeda, pregoes: [{ data, abertura, maxima, minima, fechamento, volume }] }.
// Data do pregão no fuso da bolsa; preços nas casas do priceHint (o Yahoo devolve float32,
// 56.849998474121094 → 56.85). Pregão sem fechamento fica de fora.
function lerYahoo(corpo) {
  const resultado = corpo?.chart?.result?.[0];
  const quote = resultado?.indicators?.quote?.[0];
  if (!resultado?.meta || !Array.isArray(resultado.timestamp) || !quote) {
    throw new Error('resposta do Yahoo Finance fora do formato esperado');
  }
  const { meta, timestamp } = resultado;
  const data = dataNoFuso(meta.exchangeTimezoneName ?? 'UTC');
  const preco = arredondar(meta.priceHint ?? 4);
  const pregoes = timestamp
    .map((segundos, i) => ({
      data: data(segundos * 1000),
      abertura: preco(quote.open?.[i]),
      maxima: preco(quote.high?.[i]),
      minima: preco(quote.low?.[i]),
      fechamento: preco(quote.close?.[i]),
      volume: quote.volume?.[i] ?? null,
    }))
    .filter((p) => p.fechamento !== null);
  return { moeda: meta.currency ?? null, pregoes };
}

// Klines da Binance → [{ data, ... }], com a data de abertura em UTC. O candle do dia em aberto
// (fechamento depois de agora) fica de fora: entra na rodada seguinte.
function lerBinance(corpo, { agora }) {
  if (!Array.isArray(corpo)) throw new Error('resposta da Binance fora do formato esperado');
  return corpo
    .filter((k) => Array.isArray(k) && k[6] <= agora)
    .map(([abertura, aberto, maxima, minima, fechamento, volume]) => ({
      data: new Date(abertura).toISOString().slice(0, 10),
      abertura: Number(aberto),
      maxima: Number(maxima),
      minima: Number(minima),
      fechamento: Number(fechamento),
      volume: Number(volume),
    }));
}

module.exports = { fonteDaUrl, lerBinance, lerYahoo, moedaDoPar, urlBinance, urlYahoo };
