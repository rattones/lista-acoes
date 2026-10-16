// Dados de ativos para os testes das telas de ativos (tarefa 021), no formato da API.
const base = {
  bolsa: 'NASDAQ',
  url_cotacao: null,
  observacao: null,
  adicionado_em: '2026-10-08',
  excluido_em: null,
};

export const CSCO = {
  ...base,
  id: 1,
  ativo: 'CSCO',
  nome: 'Cisco Systems',
  tipo: 'acao',
  ticker_google: 'CSCO:NASDAQ',
  ticker_yahoo: 'CSCO',
  url_historico: 'https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=2y&interval=1d',
  url_cotacao: 'https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=1d&interval=1d',
  url_pagina: 'https://www.google.com/finance/quote/CSCO:NASDAQ',
  status: 'ativo',
};

export const PETR4 = {
  ...base,
  id: 2,
  ativo: 'PETR4',
  nome: 'Petrobras PN',
  tipo: 'acao',
  bolsa: 'BVMF',
  ticker_google: 'PETR4:BVMF',
  ticker_yahoo: 'PETR4.SA',
  url_historico: 'https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=2y&interval=1d',
  url_pagina: 'https://www.google.com/finance/quote/PETR4:BVMF',
  status: 'inativo',
};

export const USDT = {
  ...base,
  id: 3,
  ativo: 'USDT-BRL',
  nome: 'Tether em reais',
  tipo: 'stablecoin',
  bolsa: null,
  ticker_google: 'USDT-BRL',
  ticker_yahoo: 'BRL=X',
  url_historico: 'https://data-api.binance.vision/api/v3/klines?symbol=USDTBRL&interval=1d&limit=500',
  url_pagina: 'https://www.google.com/finance/quote/USDT-BRL',
  status: 'ativo',
  observacao: 'Yahoo não tem USDT-BRL; os indicadores usam BRL=X.',
};

export const EXCLUIDO = {
  ...CSCO,
  id: 4,
  ativo: 'ORCL',
  nome: 'Oracle',
  bolsa: 'NYSE',
  excluido_em: '2026-10-14 08:00:00',
};

// Última cotação de precos_diarios por ativo_id (USDT-BRL sem cotação gravada).
export const PRECOS = {
  1: { id: 10, ativo_id: 1, data: '2026-10-14', fechamento: 58.4, moeda: 'USD' },
  2: { id: 11, ativo_id: 2, data: '2026-10-14', fechamento: 37.25, moeda: 'BRL' },
};

export const lista = (dados) => [
  200,
  { dados, paginacao: { pagina: 1, por_pagina: 100, total: dados.length, total_paginas: 1 } },
];

const parametros = (url) => new URL(url, 'http://app.teste').searchParams;

// GET /v1/ativos (com ou sem excluídos) e GET /v1/precos?ativo_id=N (a mais recente).
export const rotasAtivos = (ativos = [CSCO, PETR4, USDT]) => ({
  'GET /v1/ativos': (corpo, opcoes, url) =>
    lista(parametros(url).get('incluir_excluidos') === 'true' ? [...ativos, EXCLUIDO] : ativos),
  'GET /v1/precos': (corpo, opcoes, url) => {
    const preco = PRECOS[parametros(url).get('ativo_id')];
    return lista(preco ? [preco] : []);
  },
});

// Resposta do POST /v1/ativos/pre-visualizar para um link do Google Finance.
export const PREVIA_GOOGL = {
  ativo: {
    ativo: 'GOOGL',
    nome: 'Alphabet Inc.',
    tipo: 'acao',
    bolsa: 'NASDAQ',
    ticker_google: 'GOOGL:NASDAQ',
    ticker_yahoo: 'GOOGL',
    url_historico: 'https://query1.finance.yahoo.com/v8/finance/chart/GOOGL?range=2y&interval=1d',
    url_cotacao: 'https://query1.finance.yahoo.com/v8/finance/chart/GOOGL?range=1d&interval=1d',
    url_pagina: 'https://www.google.com/finance/quote/GOOGL:NASDAQ',
    observacao: null,
  },
  cotacao: { preco: 245.1, moeda: 'USD', em: '2026-10-14T20:00:00.000Z', fonte: 'Yahoo Finance' },
};
