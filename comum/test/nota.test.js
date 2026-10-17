const {
  PONTOS_GRAFICO,
  PONTOS_NOTICIAS,
  TENDENCIA,
  avaliarLeituras,
  leituraGrafico,
  pontosExtremos,
} = require('../src/nota');

// Leitura do gráfico e fórmula de referência da nota (tarefa 039; regras do seed da 032).
describe('leituraGrafico', () => {
  const ind = (dados) => ({ fechamento: 10, mm20: 9, mm50: 9, mm50_subindo: 1, ...dados });
  it('alta, baixa, recuperação e lateral', () => {
    expect(leituraGrafico(ind({}))).toBe('alta');
    expect(leituraGrafico(ind({ mm50: 11, mm50_subindo: 0 }))).toBe('baixa');
    expect(leituraGrafico(ind({ mm20: 9.5, mm50: 11, mm50_subindo: 1 }))).toBe('recuperacao');
    expect(leituraGrafico(ind({ mm50: 9, mm50_subindo: 0 }))).toBe('lateral');
    expect(leituraGrafico(ind({ mm50: null }))).toBe('lateral');
  });
});

describe('pontosExtremos', () => {
  it('IFR > 70 ou %B > 1 tiram 0,5 cada; IFR < 30 ou %B < 0 somam 0,5 cada', () => {
    expect(pontosExtremos({ rsi14: 50, bollinger_pctb: 0.5 })).toBe(0);
    expect(pontosExtremos({ rsi14: 75, bollinger_pctb: 0.5 })).toBe(-0.5);
    expect(pontosExtremos({ rsi14: 75, bollinger_pctb: 1.2 })).toBe(-1);
    expect(pontosExtremos({ rsi14: 25, bollinger_pctb: -0.1 })).toBe(1);
    expect(pontosExtremos({ rsi14: null, bollinger_pctb: null })).toBe(0);
  });
});

describe('avaliarLeituras', () => {
  const neutro = { rsi14: 50, bollinger_pctb: 0.5 };

  it('pontos, soma, nota = round(3 + soma/2) e concordam', () => {
    expect(avaliarLeituras({ noticias: 'positivo', grafico: 'alta', ind: neutro })).toEqual({
      pontos_noticias: 2,
      pontos_grafico: 2,
      pontos_extremos: 0,
      soma: 4,
      nota: 5,
      concordam: 1,
    });
    expect(
      avaliarLeituras({ noticias: 'misto_neg', grafico: 'recuperacao', ind: neutro }),
    ).toMatchObject({ soma: 0, nota: 3, concordam: 0 });
    expect(
      avaliarLeituras({
        noticias: 'negativo',
        grafico: 'baixa',
        ind: { rsi14: 25, bollinger_pctb: -0.1 },
      }),
    ).toMatchObject({ pontos_extremos: 1, soma: -3, nota: 2, concordam: 1 });
    expect(avaliarLeituras({ noticias: 'misto', grafico: 'lateral', ind: neutro })).toMatchObject({
      nota: 3,
      concordam: 1,
    });
  });

  it('nota sempre de 1 a 5', () => {
    const muitoRuim = { rsi14: 80, bollinger_pctb: 1.5 };
    expect(avaliarLeituras({ noticias: 'negativo', grafico: 'baixa', ind: muitoRuim }).nota).toBe(
      1,
    );
    const muitoBom = { rsi14: 20, bollinger_pctb: -0.5 };
    expect(avaliarLeituras({ noticias: 'positivo', grafico: 'alta', ind: muitoBom }).nota).toBe(5);
  });

  it('tabelas de pontos e tendência cobrem todas as leituras do schema', () => {
    expect(Object.keys(PONTOS_NOTICIAS)).toEqual([
      'positivo',
      'misto_pos',
      'misto',
      'misto_neg',
      'negativo',
    ]);
    expect(Object.keys(PONTOS_GRAFICO)).toEqual(['alta', 'recuperacao', 'lateral', 'baixa']);
    expect(Object.keys(TENDENCIA)).toEqual(Object.keys(PONTOS_GRAFICO));
  });
});
