import { BadRequestException } from '@nestjs/common';

// Parsers de URL e mapas entre o Google Finance e o Yahoo Finance (tarefa 018).

const urlNaoSuportada = (mensagem) =>
  new BadRequestException({
    erro: 'url_nao_suportada',
    mensagem:
      mensagem ??
      'URL não suportada: use uma página de ativo do Google Finance (google.com/finance/quote/...) ou do Yahoo Finance (finance.yahoo.com/quote/...).',
  });

const HOST_GOOGLE = /^(www\.)?google\.com(\.[a-z]{2})?$/;
const HOST_YAHOO = /^([a-z]{2}\.)?finance\.yahoo\.com$|^br\.financas\.yahoo\.com$/;
const TICKER = /^[A-Z0-9.^=_-]{1,20}$/;
const PAR = /^([A-Z0-9]{2,10})-([A-Z0-9]{2,10})$/;

// { fonte: 'google', ticker, bolsa } | { fonte: 'google', par: { base, cotacao } }
// | { fonte: 'yahoo', simbolo }. Qualquer outra coisa → 400 url_nao_suportada.
export function interpretarUrl(texto) {
  let url;
  try {
    url = new URL(String(texto));
  } catch {
    throw urlNaoSuportada();
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw urlNaoSuportada();
  const host = url.hostname.toLowerCase();
  const partes = url.pathname.split('/').filter(Boolean);

  if (HOST_GOOGLE.test(host) && partes[0] === 'finance' && partes[1] === 'quote' && partes[2]) {
    const codigo = decodeURIComponent(partes[2]).toUpperCase();
    const [ticker, bolsa, ...resto] = codigo.split(':');
    if (bolsa && !resto.length && TICKER.test(ticker) && /^[A-Z]{2,15}$/.test(bolsa)) {
      return { fonte: 'google', ticker, bolsa };
    }
    const par = PAR.exec(codigo);
    if (par) return { fonte: 'google', par: { base: par[1], cotacao: par[2] } };
    throw urlNaoSuportada(
      'Página do Google Finance sem ticker reconhecido: use .../quote/TICKER:BOLSA ou .../quote/BASE-COTACAO.',
    );
  }

  if (HOST_YAHOO.test(host) && partes[0] === 'quote' && partes[1]) {
    const simbolo = decodeURIComponent(partes[1]).toUpperCase();
    if (TICKER.test(simbolo)) return { fonte: 'yahoo', simbolo };
  }
  throw urlNaoSuportada();
}

// Bolsa do Google → sufixo do Yahoo. NASDAQ/NYSE não têm sufixo.
const SUFIXOS = {
  BVMF: '.SA',
  NASDAQ: '',
  NYSE: '',
  NYSEARCA: '',
  NYSEAMERICAN: '',
  TSE: '.TO',
  LON: '.L',
  ETR: '.DE',
  EPA: '.PA',
  AMS: '.AS',
  BME: '.MC',
  BIT: '.MI',
  SWX: '.SW',
  TYO: '.T',
  HKG: '.HK',
  ASX: '.AX',
};
const BOLSAS_SEM_SUFIXO = ['NASDAQ', 'NYSE', 'NYSEARCA', 'NYSEAMERICAN'];

// exchangeName do Yahoo → bolsa do Google, para os símbolos sem sufixo.
const BOLSA_DO_EXCHANGE = {
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  NYQ: 'NYSE',
  PCX: 'NYSEARCA',
  ASE: 'NYSEAMERICAN',
};

// Índices: TICKER:BOLSA do Google ↔ símbolo do Yahoo.
const INDICES = {
  '.INX:INDEXSP': '^GSPC',
  '.DJI:INDEXDJX': '^DJI',
  '.IXIC:INDEXNASDAQ': '^IXIC',
  'IBOV:INDEXBVMF': '^BVSP',
};

export function simboloYahoo(ticker, bolsa) {
  const codigo = `${ticker}:${bolsa}`;
  if (INDICES[codigo]) return INDICES[codigo];
  if (bolsa.startsWith('INDEX') || !(bolsa in SUFIXOS)) {
    throw urlNaoSuportada(`Bolsa ou índice ainda não suportado: ${codigo}.`);
  }
  // Classes de ações nos EUA: BRK.B no Google, BRK-B no Yahoo.
  const base = BOLSAS_SEM_SUFIXO.includes(bolsa) ? ticker.replace('.', '-') : ticker;
  return `${base}${SUFIXOS[bolsa]}`;
}

// Símbolo do Yahoo → código do ativo, bolsa e ticker do Google (null se não houver mapa).
export function daYahoo(simbolo, exchangeName) {
  const indice = Object.entries(INDICES).find(([, yahoo]) => yahoo === simbolo);
  if (indice) {
    const [ticker, bolsa] = indice[0].split(':');
    return { ativo: ticker, bolsa, ticker_google: indice[0] };
  }
  const comSufixo = Object.entries(SUFIXOS).find(
    ([, sufixo]) => sufixo && simbolo.endsWith(sufixo),
  );
  if (comSufixo) {
    const ativo = simbolo.slice(0, -comSufixo[1].length);
    return { ativo, bolsa: comSufixo[0], ticker_google: `${ativo}:${comSufixo[0]}` };
  }
  const bolsa = BOLSA_DO_EXCHANGE[exchangeName] ?? null;
  const ativo = bolsa ? simbolo.replace('-', '.') : simbolo;
  return { ativo, bolsa, ticker_google: bolsa ? `${ativo}:${bolsa}` : null };
}

const MOEDAS = new Set(
  'USD BRL EUR GBP JPY CHF CAD AUD NZD CNY HKD SGD ARS MXN CLP COP PEN UYU SEK NOK DKK PLN ZAR INR KRW TRY RUB ILS'.split(
    ' ',
  ),
);
// Stablecoins atreladas ao dólar.
const STABLECOINS = new Set('USDT USDC DAI BUSD FDUSD TUSD USDP PYUSD USDE'.split(' '));

export const classificarPar = (base, cotacao) => {
  if (MOEDAS.has(base) && MOEDAS.has(cotacao)) return 'moeda';
  return STABLECOINS.has(base) ? 'stablecoin' : 'cripto';
};

// Ticker do Yahoo usado nos indicadores. O Yahoo só cota cripto em dólar e não tem stablecoin
// contra outras moedas: BTC-BRL usa BTC-USD e USDT-BRL usa BRL=X (dólar em reais).
export function tickerYahooDoPar(base, cotacao) {
  const tipo = classificarPar(base, cotacao);
  if (tipo === 'moeda') return base === 'USD' ? `${cotacao}=X` : `${base}${cotacao}=X`;
  if (tipo === 'stablecoin' && cotacao !== 'USD') return `${cotacao}=X`;
  return `${base}-USD`;
}

// Par de um símbolo de moeda ou cripto do Yahoo; null se não for um par.
export function parDoYahoo(simbolo) {
  let par = /^([A-Z]{3})=X$/.exec(simbolo);
  if (par) return { base: 'USD', cotacao: par[1] };
  par = /^([A-Z]{3})([A-Z]{3})=X$/.exec(simbolo);
  if (par) return { base: par[1], cotacao: par[2] };
  par = /^([A-Z0-9]{2,10})-([A-Z]{3,4})$/.exec(simbolo);
  return par ? { base: par[1], cotacao: par[2] } : null;
}

export const urlYahooChart = (simbolo, range) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${range}&interval=1d`;
export const urlBinanceKlines = (simbolo, limite) =>
  `https://data-api.binance.vision/api/v3/klines?symbol=${simbolo}&interval=1d&limit=${limite}`;
export const urlCoinGeckoBusca = (consulta) =>
  `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(consulta)}`;
export const urlCoinGeckoPreco = (id, moeda) =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${moeda.toLowerCase()}&include_24hr_change=true`;
export const urlGoogle = (tickerGoogle) => `https://www.google.com/finance/quote/${tickerGoogle}`;
