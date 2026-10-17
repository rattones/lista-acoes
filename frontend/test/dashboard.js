// Dados do dashboard (tarefa 025) no formato das rotas /v1/dashboard.
const indicadores = {
  rsi14: 55,
  bollinger_pctb: 0.5,
  macd_hist: 0.12,
  dist_mm20: 1.2,
  dist_mm50: 2.5,
  dist_mm200: 8.1,
  ret_5d: 0.8,
  ret_1m: 3.2,
  ret_3m: 6.4,
  ret_1a: 15.3,
};

const linha = (dados) => ({
  tipo: 'acao',
  bolsa: 'NASDAQ',
  noticias: 'positivo',
  grafico: 'alta',
  concordam: 1,
  tendencia: 'Alta',
  destaque: null,
  proximo_evento: null,
  proximo_evento_data: null,
  data_preco: '2026-10-15',
  moeda: 'USD',
  ...indicadores,
  ...dados,
});

export const CSCO = linha({
  ativo_id: 1,
  ativo: 'CSCO',
  nome: 'Cisco Systems',
  nota: 3,
  variacao_nota: 0,
  fechamento: 58.4,
  noticias: 'misto',
  grafico: 'lateral',
  tendencia: 'Lateral',
  rsi14: 72.4,
});

export const PETR4 = linha({
  ativo_id: 2,
  ativo: 'PETR4',
  nome: 'Petrobras PN',
  bolsa: 'BVMF',
  nota: 4,
  variacao_nota: 1,
  fechamento: 37.25,
  moeda: 'BRL',
  bollinger_pctb: -0.1,
});

export const TSLA = linha({
  ativo_id: 3,
  ativo: 'TSLA',
  nome: 'Tesla',
  nota: 4,
  variacao_nota: -1,
  fechamento: 250.1,
  noticias: 'negativo',
  grafico: 'recuperacao',
  concordam: 0,
  tendencia: 'Recuperação',
  rsi14: 25.5,
  bollinger_pctb: 1.2,
});

export const USDT = linha({
  ativo_id: 4,
  ativo: 'USDT-BRL',
  nome: 'Tether em reais',
  tipo: 'stablecoin',
  bolsa: null,
  nota: 1,
  variacao_nota: null,
  fechamento: 5.43,
  moeda: 'BRL',
  noticias: 'negativo',
  grafico: 'baixa',
  tendencia: 'Baixa',
});

export const RESUMO = {
  execucao: { id: 7, data_execucao: '2026-10-16' },
  ativos: [CSCO, PETR4, TSLA, USDT],
};

export const HISTORICO = {
  precos: [
    { data: '2026-10-14', fechamento: 36.9 },
    { data: '2026-10-15', fechamento: 37.25 },
  ],
  notas: [
    {
      data_execucao: '2026-10-16',
      data_preco: '2026-10-15',
      nota: 4,
      noticias: 'positivo',
      grafico: 'alta',
    },
  ],
};

export const NOTICIAS = [
  {
    id: 10,
    ativo_id: 2,
    ativo: 'PETR4',
    titulo: 'Petrobras anuncia dividendos',
    resumo: null,
    fonte: 'Valor',
    url: 'https://noticias.exemplo/petr4',
    publicada_em: '2026-10-16 09:30:00',
    sentimento: 'positivo',
  },
  {
    id: 11,
    ativo_id: null,
    ativo: null,
    titulo: 'Juros sobem nos EUA',
    resumo: null,
    fonte: 'Reuters',
    url: 'https://noticias.exemplo/geral',
    publicada_em: '2026-10-15 18:00:00',
    sentimento: 'negativo',
  },
];

// Rotas falsas do dashboard; o histórico responde ao ativo_id da URL.
export const rotasDashboard = ({ resumo = RESUMO, historico = () => HISTORICO } = {}) => ({
  'GET /v1/dashboard/resumo': [200, resumo],
  'GET /v1/dashboard/historico': (_corpo, _opcoes, url) => [
    200,
    historico(Number(new URL(url, 'http://app.teste').searchParams.get('ativo_id'))),
  ],
  'GET /v1/dashboard/noticias': [200, NOTICIAS],
});
