'use strict';

// Leitura do gráfico e fórmula de referência da nota (tarefa 039; regras simplificadas do
// relatório, vindas do seed da 032). O agente de decisão grava os pontos pela fórmula como
// referência e a usa como fallback quando o modelo falha.

const PONTOS_NOTICIAS = { positivo: 2, misto_pos: 1, misto: 0, misto_neg: -1, negativo: -2 };
const PONTOS_GRAFICO = { alta: 2, recuperacao: 1, lateral: 0, baixa: -2 };
const TENDENCIA = { alta: 'Alta', recuperacao: 'Recuperação', lateral: 'Lateral', baixa: 'Baixa' };

// Pelo fechamento em relação às MM20/MM50 e pela inclinação da MM50.
function leituraGrafico({ fechamento, mm20, mm50, mm50_subindo: subindo }) {
  if (mm50 === null) return 'lateral';
  if (fechamento > mm50 && subindo === 1) return 'alta';
  if (fechamento < mm50 && subindo === 0) return 'baixa';
  if (mm20 !== null && fechamento > mm20 && fechamento < mm50) return 'recuperacao';
  return 'lateral';
}

// Sobrecompra (IFR > 70, %B > 1) tira meio ponto cada; sobrevenda (IFR < 30, %B < 0) soma.
function pontosExtremos({ rsi14, bollinger_pctb: pctb }) {
  let pontos = 0;
  if (rsi14 !== null && rsi14 > 70) pontos -= 0.5;
  if (rsi14 !== null && rsi14 < 30) pontos += 0.5;
  if (pctb !== null && pctb > 1) pontos -= 0.5;
  if (pctb !== null && pctb < 0) pontos += 0.5;
  return pontos;
}

// Pontos, soma, nota = round(3 + soma/2) limitada a 1–5, e se notícias e gráfico concordam
// (mesmo sentido, ou os dois neutros).
function avaliarLeituras({ noticias, grafico, ind }) {
  const pontosNoticias = PONTOS_NOTICIAS[noticias];
  const pontosGrafico = PONTOS_GRAFICO[grafico];
  const extremos = pontosExtremos(ind);
  const soma = pontosNoticias + pontosGrafico + extremos;
  const mesmoSentido =
    (pontosNoticias > 0 && pontosGrafico > 0) ||
    (pontosNoticias < 0 && pontosGrafico < 0) ||
    (pontosNoticias === 0 && pontosGrafico === 0);
  return {
    pontos_noticias: pontosNoticias,
    pontos_grafico: pontosGrafico,
    pontos_extremos: extremos,
    soma,
    nota: Math.min(5, Math.max(1, Math.round(3 + soma / 2))),
    concordam: mesmoSentido ? 1 : 0,
  };
}

module.exports = {
  PONTOS_GRAFICO,
  PONTOS_NOTICIAS,
  TENDENCIA,
  avaliarLeituras,
  leituraGrafico,
  pontosExtremos,
};
