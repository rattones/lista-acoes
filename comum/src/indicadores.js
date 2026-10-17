'use strict';

// Indicadores técnicos (tarefa 039; vieram do seed da 032), usados pelo seed do DEV e pelo
// agente de decisão. Unidades (as do dashboard): retornos e distâncias em porcentagem
// (3,2 = 3,2%), IFR de 0 a 100, %B em fração (0 = banda inferior, 1 = superior), volume 5d/50d
// como razão; médias, MACD e máximas/mínimas na moeda do ativo. Janelas em pregões: 1 mês = 21,
// 3 meses = 63, 6 meses = 126, 1 ano e 52 semanas = 252.

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

// Indicadores de cada ponto da série ([{ data, fechamento, volume }], em ordem de data):
// devolve i => { fechamento, ret_*, mm*, dist_*, rsi14, macd*, bollinger_pctb, ... }, com null
// no que exige mais dados do que a série tem até i.
function serieDeIndicadores(serie) {
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

// Indicadores do último ponto da série; null para série vazia.
const indicadores = (serie) => (serie.length ? serieDeIndicadores(serie)(serie.length - 1) : null);

module.exports = { indicadores, serieDeIndicadores };
