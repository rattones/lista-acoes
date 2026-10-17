import { NOMES_TIPOS } from './ativos.js';

// Dashboard (tarefa 025): filtros, período, faixas dos indicadores e formatos.

export const NOMES_NOTICIAS = {
  positivo: 'Positivo',
  misto_pos: 'Misto (+)',
  misto: 'Misto',
  misto_neg: 'Misto (−)',
  negativo: 'Negativo',
};
export const NOMES_GRAFICO = {
  alta: 'Alta',
  recuperacao: 'Recuperação',
  lateral: 'Lateral',
  baixa: 'Baixa',
};
export const NOMES_SENTIMENTO = { positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo' };
export const NOMES_CONCORDAM = { sim: 'Concordam', nao: 'Divergem' };
export const NOMES_IFR = {
  sobrevendido: 'Sobrevendido (< 30)',
  neutro: 'Neutro (30–70)',
  sobrecomprado: 'Sobrecomprado (> 70)',
};
export const NOMES_PCTB = {
  abaixo: 'Abaixo da banda (< 0)',
  dentro: 'Dentro da banda',
  acima: 'Acima da banda (> 1)',
};

export const PERIODOS = [
  { valor: '1m', titulo: '1M', meses: 1 },
  { valor: '3m', titulo: '3M', meses: 3 },
  { valor: '6m', titulo: '6M', meses: 6 },
  { valor: '1a', titulo: '1A', meses: 12 },
  { valor: 'tudo', titulo: 'Tudo', meses: null },
];
export const PERIODO_PADRAO = '1m';

// Cores da nota: 1 vermelho → 5 verde.
export const CORES_NOTA = { 1: '#d32f2f', 2: '#f57c00', 3: '#f9a825', 4: '#7cb342', 5: '#2e7d32' };

const dois = (n) => String(n).padStart(2, '0');
const dataIso = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

// Primeiro dia do período ('AAAA-MM-DD', horário local) ou null para "Tudo".
export function inicioDoPeriodo(periodo, hoje = new Date()) {
  const meses = PERIODOS.find((p) => p.valor === periodo)?.meses;
  if (!meses) return null;
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - meses, hoje.getDate());
  return dataIso(d);
}

export const faixaIfr = (rsi) =>
  rsi === null || rsi === undefined
    ? null
    : rsi > 70
      ? 'sobrecomprado'
      : rsi < 30
        ? 'sobrevendido'
        : 'neutro';

export const faixaPctb = (pctb) =>
  pctb === null || pctb === undefined ? null : pctb > 1 ? 'acima' : pctb < 0 ? 'abaixo' : 'dentro';

// Filtros do diálogo "Mais filtros" (3.2), na ordem em que aparecem.
export const FILTROS_AVANCADOS = [
  'tipo',
  'bolsa',
  'tendencia',
  'noticias',
  'grafico',
  'concordam',
  'ifr',
  'pctb',
];

export const filtrosPadrao = () => ({
  ativos: [],
  periodo: PERIODO_PADRAO,
  nota: null,
  foco: null,
  ...Object.fromEntries(FILTROS_AVANCADOS.map((f) => [f, null])),
});

const VALORES_FIXOS = {
  tipo: NOMES_TIPOS,
  noticias: NOMES_NOTICIAS,
  grafico: NOMES_GRAFICO,
  concordam: NOMES_CONCORDAM,
  ifr: NOMES_IFR,
  pctb: NOMES_PCTB,
};

const textoDaQuery = (valor) => {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === 'string' && texto.trim() ? texto.trim() : null;
};

// Filtros a partir da query da rota; valor inválido é ignorado (fica o padrão). Ativos, bolsa,
// tendência e foco são conferidos contra o resumo carregado (os valores que existem).
export function lerFiltros(query, linhas) {
  const filtros = filtrosPadrao();
  const codigos = new Set(linhas.map((l) => l.ativo));
  const existentes = (campo) => new Set(linhas.map((l) => l[campo]).filter(Boolean));

  const ativos = textoDaQuery(query.ativos);
  if (ativos) filtros.ativos = [...new Set(ativos.split(','))].filter((a) => codigos.has(a));

  const periodo = textoDaQuery(query.periodo);
  if (PERIODOS.some((p) => p.valor === periodo)) filtros.periodo = periodo;

  const nota = Number(textoDaQuery(query.nota));
  if (Number.isInteger(nota) && nota >= 1 && nota <= 5) filtros.nota = nota;

  const foco = textoDaQuery(query.foco);
  if (codigos.has(foco)) filtros.foco = foco;

  for (const campo of ['bolsa', 'tendencia']) {
    const valor = textoDaQuery(query[campo]);
    if (existentes(campo).has(valor)) filtros[campo] = valor;
  }
  for (const [campo, nomes] of Object.entries(VALORES_FIXOS)) {
    const valor = textoDaQuery(query[campo]);
    if (valor && Object.hasOwn(nomes, valor)) filtros[campo] = valor;
  }
  return filtros;
}

// Query da rota com só o que difere do padrão.
export function paraQuery(filtros) {
  const query = {};
  if (filtros.ativos.length) query.ativos = filtros.ativos.join(',');
  if (filtros.periodo !== PERIODO_PADRAO) query.periodo = filtros.periodo;
  if (filtros.nota) query.nota = String(filtros.nota);
  for (const campo of FILTROS_AVANCADOS) if (filtros[campo]) query[campo] = filtros[campo];
  if (filtros.foco) query.foco = filtros.foco;
  return query;
}

export const contarAvancados = (filtros) => FILTROS_AVANCADOS.filter((f) => filtros[f]).length;

// Linhas do resumo que passam nos filtros, da maior nota para a menor (empate: alfabética).
export function filtrarLinhas(linhas, filtros) {
  const concordam = { sim: 1, nao: 0 }[filtros.concordam];
  return linhas
    .filter((l) => !filtros.ativos.length || filtros.ativos.includes(l.ativo))
    .filter((l) => !filtros.nota || l.nota >= filtros.nota)
    .filter((l) => !filtros.tipo || l.tipo === filtros.tipo)
    .filter((l) => !filtros.bolsa || l.bolsa === filtros.bolsa)
    .filter((l) => !filtros.tendencia || l.tendencia === filtros.tendencia)
    .filter((l) => !filtros.noticias || l.noticias === filtros.noticias)
    .filter((l) => !filtros.grafico || l.grafico === filtros.grafico)
    .filter((l) => concordam === undefined || l.concordam === concordam)
    .filter((l) => !filtros.ifr || faixaIfr(l.rsi14) === filtros.ifr)
    .filter((l) => !filtros.pctb || faixaPctb(l.bollinger_pctb) === filtros.pctb)
    .sort((a, b) => b.nota - a.nota || a.ativo.localeCompare(b.ativo, 'pt-BR'));
}

const numero = (casas) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Retornos e distâncias já vêm em porcentagem (3,2 = 3,2%).
export const formatarPct = (valor) =>
  valor === null || valor === undefined ? '—' : `${numero(1).format(valor)}%`;
export const formatarNumero = (valor, casas = 2) =>
  valor === null || valor === undefined ? '—' : numero(casas).format(valor);

// Variação da nota: +1, −1, 0 ou — (sem execução anterior).
export const formatarVariacao = (valor) =>
  valor === null || valor === undefined
    ? '—'
    : valor > 0
      ? `+${valor}`
      : valor < 0
        ? `−${Math.abs(valor)}`
        : '0';

// 'AAAA-MM-DD' → 'DD/MM' (eixo do gráfico).
export const diaMes = (texto) => {
  const partes = /^\d{4}-(\d{2})-(\d{2})/.exec(texto ?? '');
  return partes ? `${partes[2]}/${partes[1]}` : texto;
};

// Dados do gráfico: fechamento em linha (eixo y) e nota em barras (eixo y1), no dia do
// fechamento usado por cada execução. Devolve também as leituras de cada barra (tooltip).
export function dadosDoGrafico({ precos, notas }) {
  const dias = [
    ...new Set([...precos.map((p) => p.data), ...notas.map((n) => n.data_preco)]),
  ].sort();
  const precoDoDia = new Map(precos.map((p) => [p.data, p.fechamento]));
  const notaDoDia = new Map(notas.map((n) => [n.data_preco, n]));
  const leituras = dias.map((d) => notaDoDia.get(d) ?? null);
  return {
    labels: dias.map(diaMes),
    datasets: [
      {
        type: 'line',
        label: 'Fechamento',
        yAxisID: 'y',
        data: dias.map((d) => precoDoDia.get(d) ?? null),
        borderColor: '#1565c0',
        backgroundColor: '#1565c0',
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: true,
        order: 1,
      },
      {
        type: 'bar',
        label: 'Nota',
        yAxisID: 'y1',
        data: leituras.map((l) => l?.nota ?? null),
        backgroundColor: leituras.map((l) => (l ? `${CORES_NOTA[l.nota]}99` : 'transparent')),
        leituras,
        order: 2,
      },
    ],
  };
}

// Rótulo do tooltip: preço na moeda do ativo; na nota, as leituras de notícias e gráfico.
export function rotuloTooltip(contexto, formatarPreco) {
  if (contexto.dataset.type === 'line') return [`Fechamento: ${formatarPreco(contexto.raw)}`];
  const leitura = contexto.dataset.leituras?.[contexto.dataIndex];
  const linhas = [`Nota ${contexto.raw}`];
  if (leitura) {
    linhas.push(`Notícias: ${NOMES_NOTICIAS[leitura.noticias] ?? leitura.noticias}`);
    linhas.push(`Gráfico: ${NOMES_GRAFICO[leitura.grafico] ?? leitura.grafico}`);
  }
  return linhas;
}
