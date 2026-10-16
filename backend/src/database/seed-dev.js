// Dados fictícios do DEV (tarefa 032): preços, execuções, sinais e notícias para o dashboard
// (025) enquanto os agentes coletores não existem. Tudo é marcado (fonte/fonte_lista 'seed',
// notícias em exemplo.invalid) para a 033 trocar pelos dados reais sem tocar neles.
// Determinístico: cada ativo tem a sua semente (pelo código), e as datas partem de "hoje".
//
// Convenção dos indicadores (provisória, a confirmar com o agente de decisão): retornos e
// distâncias em porcentagem (3,2 = 3,2%), IFR de 0 a 100, %B em fração (0 = banda inferior,
// 1 = superior) e volume 5d/50d como razão.

const MARCA = 'seed';
const EXECUCOES = 90;
const DIAS_DE_HISTORICO = 365; // antes da primeira execução: MM200 e 52 semanas completas

const PRECO_INICIAL = { CSCO: 55, GOOGL: 165, ORCL: 140, PETR4: 38, TSLA: 250, 'USDT-BRL': 5.6 };
const PERFIL = {
  acao: { preco: 100, volatilidade: 0.018, volume: 2e7 },
  etf: { preco: 100, volatilidade: 0.01, volume: 5e6 },
  indice: { preco: 10000, volatilidade: 0.01, volume: 1e9 },
  moeda: { preco: 5, volatilidade: 0.006, volume: 1e9 },
  stablecoin: { preco: 5.6, volatilidade: 0.002, volume: 1e8 },
  cripto: { preco: 30000, volatilidade: 0.035, volume: 5e4 },
};
const TODOS_OS_DIAS = new Set(['cripto', 'stablecoin']);

const PONTOS_NOTICIAS = { positivo: 2, misto_pos: 1, misto: 0, misto_neg: -1, negativo: -2 };
const PONTOS_GRAFICO = { alta: 2, recuperacao: 1, lateral: 0, baixa: -2 };
const TENDENCIA = { alta: 'Alta', recuperacao: 'Recuperação', lateral: 'Lateral', baixa: 'Baixa' };

// ===== aleatoriedade com semente =====

function hash(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

// mulberry32: rápido e suficiente para dados de teste.
function aleatorio(semente) {
  let a = hash(semente);
  const proximo = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Normal padrão (Box-Muller).
  proximo.normal = () =>
    Math.sqrt(-2 * Math.log(1 - proximo())) * Math.cos(2 * Math.PI * proximo());
  return proximo;
}

const arredondar = (valor, casas = 4) => Math.round(valor * 10 ** casas) / 10 ** casas;

// ===== datas ('AAAA-MM-DD', sem fuso) =====

const paraData = (texto) => new Date(`${texto}T00:00:00Z`);
const paraTexto = (data) => data.toISOString().slice(0, 10);
const somarDias = (texto, dias) => paraTexto(new Date(paraData(texto).getTime() + dias * 864e5));
const diaUtil = (texto) => ![0, 6].includes(paraData(texto).getUTCDay());

function hojeLocal() {
  const agora = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

function datasDeExecucao(hoje) {
  const datas = [];
  for (let dia = hoje; datas.length < EXECUCOES; dia = somarDias(dia, -1)) {
    if (diaUtil(dia)) datas.unshift(dia);
  }
  return datas;
}

// ===== indicadores =====

const media = (valores) => valores.reduce((a, b) => a + b, 0) / valores.length;

function mediasExponenciais(valores, periodo) {
  const k = 2 / (periodo + 1);
  const saida = [];
  valores.forEach((v, i) => saida.push(i === 0 ? v : v * k + saida[i - 1] * (1 - k)));
  return saida;
}

// IFR de Wilder (14), para toda a série.
function ifr(fechamentos, periodo = 14) {
  const saida = new Array(fechamentos.length).fill(null);
  let ganho = 0;
  let perda = 0;
  for (let i = 1; i < fechamentos.length; i += 1) {
    const variacao = fechamentos[i] - fechamentos[i - 1];
    const g = Math.max(variacao, 0);
    const p = Math.max(-variacao, 0);
    if (i <= periodo) {
      ganho += g / periodo;
      perda += p / periodo;
    } else {
      ganho = (ganho * (periodo - 1) + g) / periodo;
      perda = (perda * (periodo - 1) + p) / periodo;
    }
    if (i >= periodo) saida[i] = perda === 0 ? 100 : 100 - 100 / (1 + ganho / perda);
  }
  return saida;
}

function indicadores(serie) {
  const c = serie.map((p) => p.fechamento);
  const v = serie.map((p) => p.volume ?? 0);
  const rsi = ifr(c);
  const ema12 = mediasExponenciais(c, 12);
  const ema26 = mediasExponenciais(c, 26);
  const macd = c.map((_, i) => ema12[i] - ema26[i]);
  const sinalMacd = mediasExponenciais(macd, 9);

  return (i) => {
    const mm = (n, j = i) => (j >= n - 1 ? media(c.slice(j - n + 1, j + 1)) : null);
    const ret = (n) => (i >= n ? (c[i] / c[i - n] - 1) * 100 : null);
    const distancia = (referencia) => (referencia ? (c[i] / referencia - 1) * 100 : null);
    const subindo = (n) => {
      const agora = mm(n);
      const antes = mm(n, i - 5);
      return agora === null || antes === null ? null : agora > antes ? 1 : 0;
    };
    const mm20 = mm(20);
    const mm50 = mm(50);
    const mm200 = mm(200);
    let pctb = null;
    if (mm20 !== null) {
      const desvio = Math.sqrt(media(c.slice(i - 19, i + 1).map((x) => (x - mm20) ** 2)));
      pctb = desvio === 0 ? 0.5 : (c[i] - (mm20 - 2 * desvio)) / (4 * desvio);
    }
    const janela = c.slice(Math.max(0, i - 251), i + 1);
    const max52 = Math.max(...janela);
    const min52 = Math.min(...janela);
    const volume50 = i >= 49 ? media(v.slice(i - 49, i + 1)) : null;
    return {
      fechamento: c[i],
      ret_5d: ret(5),
      ret_1m: ret(21),
      ret_3m: ret(63),
      ret_6m: ret(126),
      ret_1a: ret(252),
      mm20,
      mm50,
      mm200,
      dist_mm20: distancia(mm20),
      dist_mm50: distancia(mm50),
      dist_mm200: distancia(mm200),
      mm50_subindo: subindo(50),
      mm200_subindo: subindo(200),
      rsi14: rsi[i],
      macd: macd[i],
      macd_sinal: sinalMacd[i],
      macd_hist: macd[i] - sinalMacd[i],
      bollinger_pctb: pctb,
      max_52s: max52,
      min_52s: min52,
      dist_max_52s: distancia(max52),
      dist_min_52s: distancia(min52),
      volume_5d_50d: volume50 ? media(v.slice(i - 4, i + 1)) / volume50 : null,
    };
  };
}

// ===== leituras e nota (as regras do relatório, simplificadas) =====

function leituraGrafico({ fechamento, mm20, mm50, mm50_subindo: subindo }) {
  if (mm50 === null) return 'lateral';
  if (fechamento > mm50 && subindo === 1) return 'alta';
  if (fechamento < mm50 && subindo === 0) return 'baixa';
  if (mm20 !== null && fechamento > mm20 && fechamento < mm50) return 'recuperacao';
  return 'lateral';
}

function leituraNoticias(ret1m, ruido) {
  const pontuacao = (ret1m ?? 0) / 8 + ruido * 0.6;
  if (pontuacao > 1) return 'positivo';
  if (pontuacao > 0.35) return 'misto_pos';
  if (pontuacao > -0.35) return 'misto';
  if (pontuacao > -1) return 'misto_neg';
  return 'negativo';
}

function pontosExtremos({ rsi14, bollinger_pctb: pctb }) {
  let pontos = 0;
  if (rsi14 !== null && rsi14 > 70) pontos -= 0.5;
  if (rsi14 !== null && rsi14 < 30) pontos += 0.5;
  if (pctb !== null && pctb > 1) pontos -= 0.5;
  if (pctb !== null && pctb < 0) pontos += 0.5;
  return pontos;
}

function avaliar(ind, ruido) {
  const noticias = leituraNoticias(ind.ret_1m, ruido);
  const grafico = leituraGrafico(ind);
  const pontosNoticias = PONTOS_NOTICIAS[noticias];
  const pontosGrafico = PONTOS_GRAFICO[grafico];
  const extremos = pontosExtremos(ind);
  const soma = pontosNoticias + pontosGrafico + extremos;
  const mesmoSentido =
    (pontosNoticias > 0 && pontosGrafico > 0) ||
    (pontosNoticias < 0 && pontosGrafico < 0) ||
    (pontosNoticias === 0 && pontosGrafico === 0);
  return {
    noticias,
    grafico,
    pontos_noticias: pontosNoticias,
    pontos_grafico: pontosGrafico,
    pontos_extremos: extremos,
    soma,
    nota: Math.min(5, Math.max(1, Math.round(3 + soma / 2))),
    concordam: mesmoSentido ? 1 : 0,
    tendencia: TENDENCIA[grafico],
  };
}

// ===== geração =====

const moedaDoAtivo = (ativo) =>
  ativo.bolsa === 'BVMF' || ativo.ativo.endsWith('-BRL') ? 'BRL' : 'USD';

function gerarPrecos(ativo, inicio, hoje) {
  const perfil = PERFIL[ativo.tipo] ?? PERFIL.acao;
  const r = aleatorio(`precos:${ativo.ativo}`);
  const base = PRECO_INICIAL[ativo.ativo] ?? perfil.preco;
  let preco = base * (0.85 + 0.3 * r());
  const tendencia = (r() - 0.4) * 0.002;
  const vol = perfil.volatilidade;
  const precos = [];
  for (let dia = inicio; dia <= hoje; dia = somarDias(dia, 1)) {
    if (!TODOS_OS_DIAS.has(ativo.tipo) && !diaUtil(dia)) continue;
    const abertura = preco * (1 + r.normal() * vol * 0.3);
    const fechamento = abertura * (1 + tendencia + r.normal() * vol);
    const maxima = Math.max(abertura, fechamento) * (1 + Math.abs(r.normal()) * vol * 0.5);
    const minima = Math.min(abertura, fechamento) * (1 - Math.abs(r.normal()) * vol * 0.5);
    preco = fechamento;
    precos.push({
      data: dia,
      abertura: arredondar(abertura),
      maxima: arredondar(maxima),
      minima: arredondar(minima),
      fechamento: arredondar(fechamento),
      volume: Math.round(perfil.volume * Math.exp(r.normal() * 0.3)),
    });
  }
  return precos;
}

const TITULOS = {
  positivo: [
    '{a} supera expectativas e analistas elevam preço-alvo',
    '{a} anuncia recompra de ações',
  ],
  neutro: ['{a} mantém projeções para o ano', '{a} divulga calendário de eventos'],
  negativo: ['{a} enfrenta questionamento regulatório', 'Analistas rebaixam recomendação de {a}'],
};
const GERAIS = {
  positivo: ['Bolsas sobem com dados de inflação abaixo do esperado'],
  neutro: ['Mercado aguarda decisão de juros nesta semana'],
  negativo: ['Aversão a risco pressiona mercados globais'],
};
const SENTIMENTOS = ['positivo', 'neutro', 'negativo'];

function gerarNoticias(ativos, datas) {
  const noticias = [];
  const semanas = datas.filter((_, i) => i % 5 === 0);
  const criar = (chave, titulos, rotulo, ativoId) => {
    const r = aleatorio(`noticias:${chave}`);
    semanas.forEach((dia, n) => {
      const sentimento = SENTIMENTOS[Math.floor(r() * 3)];
      const opcoes = titulos[sentimento];
      const titulo = opcoes[Math.floor(r() * opcoes.length)].replace('{a}', rotulo);
      const hora = String(8 + Math.floor(r() * 10)).padStart(2, '0');
      noticias.push({
        ativo_id: ativoId,
        titulo,
        resumo: `Notícia fictícia gerada para o DEV (${sentimento}).`,
        fonte: MARCA,
        url: `https://exemplo.invalid/noticias/${chave.toLowerCase()}/${dia}-${n + 1}`,
        publicada_em: `${dia} ${hora}:00:00`,
        sentimento,
      });
    });
  };
  for (const ativo of ativos) criar(ativo.ativo, TITULOS, ativo.nome ?? ativo.ativo, ativo.id);
  criar('geral', GERAIS, '', null);
  return noticias;
}

function proximoEvento(ativo, data) {
  const r = aleatorio(`eventos:${ativo.ativo}`);
  const intervalo = 45;
  const deslocamento = Math.floor(r() * intervalo);
  const dias = Math.floor(paraData(data).getTime() / 864e5) - deslocamento;
  const faltam = intervalo - (((dias % intervalo) + intervalo) % intervalo);
  const nome = ['moeda', 'stablecoin'].includes(ativo.tipo)
    ? 'Decisão de juros (Copom)'
    : 'Divulgação de resultados trimestrais';
  return { proximo_evento: nome, proximo_evento_data: somarDias(data, faltam) };
}

export function limparSeed(db) {
  db.transaction(() => {
    // Os sinais vão junto pelo ON DELETE CASCADE de execucoes.
    db.prepare('DELETE FROM execucoes WHERE fonte_lista = ?').run(MARCA);
    db.prepare('DELETE FROM precos_diarios WHERE fonte = ?').run(MARCA);
    db.prepare('DELETE FROM noticias WHERE fonte = ?').run(MARCA);
  })();
}

export function gerarSeed(db, { hoje = hojeLocal() } = {}) {
  const ativos = db
    .prepare(
      `SELECT id, ativo, nome, tipo, bolsa, ticker_yahoo FROM ativos
       WHERE status = 'ativo' AND excluido_em IS NULL ORDER BY ativo`,
    )
    .all();
  const datas = datasDeExecucao(hoje);
  const inicio = somarDias(datas[0], -DIAS_DE_HISTORICO);
  const resumo = { ativos: ativos.length, precos: 0, execucoes: 0, sinais: 0, noticias: 0 };

  const inserirPreco = db.prepare(
    `INSERT INTO precos_diarios (ativo_id, data, abertura, maxima, minima, fechamento, volume, moeda, fonte)
     VALUES (@ativo_id, @data, @abertura, @maxima, @minima, @fechamento, @volume, @moeda, '${MARCA}')
     ON CONFLICT (ativo_id, data) DO NOTHING`,
  );
  const serieDoBanco = db.prepare(
    'SELECT data, fechamento, volume FROM precos_diarios WHERE ativo_id = ? AND excluido_em IS NULL ORDER BY data',
  );
  const inserirExecucao = db.prepare(
    `INSERT INTO execucoes (data_execucao, fonte_lista, lista_lida_em) VALUES (?, '${MARCA}', ?)
     ON CONFLICT (data_execucao) DO NOTHING RETURNING id`,
  );
  const colunas = [
    'execucao_id',
    'ativo_id',
    'ativo',
    'ticker_yahoo',
    'bolsa',
    'tipo',
    'data_preco',
    'moeda',
    'fechamento',
    'noticias',
    'grafico',
    'pontos_noticias',
    'pontos_grafico',
    'pontos_extremos',
    'soma',
    'nota',
    'concordam',
    'tendencia',
    'proximo_evento',
    'proximo_evento_data',
    'destaque',
    'ret_5d',
    'ret_1m',
    'ret_3m',
    'ret_6m',
    'ret_1a',
    'mm20',
    'mm50',
    'mm200',
    'dist_mm20',
    'dist_mm50',
    'dist_mm200',
    'mm50_subindo',
    'mm200_subindo',
    'rsi14',
    'macd',
    'macd_sinal',
    'macd_hist',
    'bollinger_pctb',
    'max_52s',
    'min_52s',
    'dist_max_52s',
    'dist_min_52s',
    'volume_5d_50d',
  ];
  const inserirSinal = db.prepare(
    `INSERT INTO sinais (${colunas.join(', ')}) VALUES (${colunas.map((c) => `@${c}`).join(', ')})`,
  );
  const inserirNoticia = db.prepare(
    `INSERT INTO noticias (ativo_id, titulo, resumo, fonte, url, publicada_em, sentimento)
     VALUES (@ativo_id, @titulo, @resumo, @fonte, @url, @publicada_em, @sentimento)
     ON CONFLICT (url) DO NOTHING`,
  );

  db.transaction(() => {
    limparSeed(db);

    // Preços e a série completa (com eventuais dados reais) de cada ativo.
    const series = new Map();
    for (const ativo of ativos) {
      const moeda = moedaDoAtivo(ativo);
      for (const preco of gerarPrecos(ativo, inicio, hoje)) {
        resumo.precos += inserirPreco.run({ ...preco, ativo_id: ativo.id, moeda }).changes;
      }
      const serie = serieDoBanco.all(ativo.id);
      series.set(ativo.id, { serie, calcular: indicadores(serie), moeda });
    }

    for (const data of datas) {
      const execucao = inserirExecucao.get(data, data);
      if (!execucao) continue; // dia ocupado por uma execução real
      resumo.execucoes += 1;
      for (const ativo of ativos) {
        const { serie, calcular, moeda } = series.get(ativo.id);
        let i = serie.length - 1;
        while (i >= 0 && serie[i].data > data) i -= 1;
        if (i < 0) continue;
        const ind = calcular(i);
        const ruido = aleatorio(`leitura:${ativo.ativo}:${data}`).normal();
        const avaliacao = avaliar(ind, ruido);
        inserirSinal.run({
          execucao_id: execucao.id,
          ativo_id: ativo.id,
          ativo: ativo.ativo,
          ticker_yahoo: ativo.ticker_yahoo ?? ativo.ativo,
          bolsa: ativo.bolsa,
          tipo: ativo.tipo,
          data_preco: serie[i].data,
          moeda,
          ...ind,
          ...avaliacao,
          ...proximoEvento(ativo, data),
          destaque: `IFR ${ind.rsi14?.toFixed(0) ?? '—'}; ${(ind.ret_1m ?? 0).toFixed(1)}% em 1 mês (fictício)`,
        });
        resumo.sinais += 1;
      }
    }

    for (const noticia of gerarNoticias(ativos, datas)) {
      resumo.noticias += inserirNoticia.run(noticia).changes;
    }
  })();

  return resumo;
}
