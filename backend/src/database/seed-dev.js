import { serieDeIndicadores } from '@lista-acoes/comum/indicadores';
import { TENDENCIA, avaliarLeituras, leituraGrafico } from '@lista-acoes/comum/nota';

// Dados fictícios do DEV (tarefa 032): preços, execuções, sinais e notícias para o dashboard
// (025) enquanto os agentes coletores não existem. Tudo é marcado (fonte/fonte_lista 'seed',
// notícias em exemplo.invalid) para a 033 trocar pelos dados reais sem tocar neles.
// Determinístico: cada ativo tem a sua semente (pelo código), e as datas partem de "hoje".
//
// Indicadores, leitura do gráfico e fórmula da nota vêm do comum/ (tarefa 039), com as unidades
// do dashboard (comum/src/indicadores.js).

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

// ===== leituras e nota =====

// A leitura das notícias do seed é fictícia: retorno de 1 mês + ruído. A do gráfico e a fórmula
// da nota são as de referência do comum/ (tarefa 039), as mesmas do agente de decisão.
function leituraNoticias(ret1m, ruido) {
  const pontuacao = (ret1m ?? 0) / 8 + ruido * 0.6;
  if (pontuacao > 1) return 'positivo';
  if (pontuacao > 0.35) return 'misto_pos';
  if (pontuacao > -0.35) return 'misto';
  if (pontuacao > -1) return 'misto_neg';
  return 'negativo';
}

function avaliar(ind, ruido) {
  const noticias = leituraNoticias(ind.ret_1m, ruido);
  const grafico = leituraGrafico(ind);
  return {
    noticias,
    grafico,
    ...avaliarLeituras({ noticias, grafico, ind }),
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

// Registros marcados como fictícios, por tabela (os sinais vão com as execuções).
export function contarSeed(db) {
  const contar = (sql) => db.prepare(sql).pluck().get(MARCA);
  return {
    precos: contar('SELECT COUNT(*) FROM precos_diarios WHERE fonte = ?'),
    noticias: contar('SELECT COUNT(*) FROM noticias WHERE fonte = ?'),
    execucoes: contar('SELECT COUNT(*) FROM execucoes WHERE fonte_lista = ?'),
  };
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
      series.set(ativo.id, { serie, calcular: serieDeIndicadores(serie), moeda });
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

    // Notícias que "pesaram" em cada sinal fictício (034): até 3 do ativo nos 7 dias anteriores.
    db.prepare(
      `INSERT INTO sinais_noticias (sinal_id, noticia_id)
       SELECT sinal_id, noticia_id FROM (
         SELECT s.id AS sinal_id, n.id AS noticia_id,
                ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY n.publicada_em DESC) AS ordem
         FROM sinais s
         JOIN execucoes e ON e.id = s.execucao_id AND e.fonte_lista = @marca
         JOIN noticias n ON n.ativo_id = s.ativo_id AND n.fonte = @marca
          AND date(n.publicada_em) BETWEEN date(e.data_execucao, '-7 days') AND e.data_execucao
       ) WHERE ordem <= 3`,
    ).run({ marca: MARCA });
  })();

  return resumo;
}
