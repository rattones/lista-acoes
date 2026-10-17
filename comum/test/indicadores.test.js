const { indicadores, serieDeIndicadores } = require('../src/indicadores');

// Indicadores técnicos (tarefa 039; do seed da 032), nas unidades do dashboard: retornos e
// distâncias em %, IFR 0–100, %B em fração, volume 5d/50d como razão.
const serie = (fechamentos, volumes = []) =>
  fechamentos.map((fechamento, i) => ({
    data: `d${i}`,
    fechamento,
    volume: volumes[i] ?? 1000,
  }));
const crescente = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('indicadores', () => {
  it('série vazia → null', () => {
    expect(indicadores([])).toBeNull();
  });

  it('série constante: médias iguais ao preço, retornos 0, MACD 0, %B 0,5, IFR 100', () => {
    const ind = indicadores(serie(Array(300).fill(10)));
    expect(ind).toMatchObject({
      fechamento: 10,
      mm20: 10,
      mm50: 10,
      mm200: 10,
      ret_5d: 0,
      ret_1a: 0,
      dist_mm200: 0,
      macd: 0,
      macd_hist: 0,
      bollinger_pctb: 0.5,
      rsi14: 100,
      mm50_subindo: 0,
      volume_5d_50d: 1,
    });
  });

  it('série crescente 1…300: médias, retornos, distâncias e 52 semanas', () => {
    const ind = indicadores(serie(crescente(300)));
    expect(ind.mm20).toBeCloseTo(290.5, 10);
    expect(ind.mm50).toBeCloseTo(275.5, 10);
    expect(ind.mm200).toBeCloseTo(200.5, 10);
    expect(ind.ret_5d).toBeCloseTo((300 / 295 - 1) * 100, 10);
    expect(ind.ret_1m).toBeCloseTo((300 / 279 - 1) * 100, 10);
    expect(ind.ret_1a).toBeCloseTo((300 / 48 - 1) * 100, 10);
    expect(ind.dist_mm20).toBeCloseTo((300 / 290.5 - 1) * 100, 10);
    expect(ind).toMatchObject({ max_52s: 300, min_52s: 49, mm50_subindo: 1, mm200_subindo: 1 });
    expect(ind.dist_max_52s).toBe(0);
    expect(ind.dist_min_52s).toBeCloseTo((300 / 49 - 1) * 100, 10);
    expect(ind.rsi14).toBe(100);
    expect(ind.macd).toBeGreaterThan(0);
    expect(ind.macd_hist).toBeCloseTo(ind.macd - ind.macd_sinal, 12);
  });

  // Os preços do exemplo da StockCharts; o site publica 70,53 / 66,32 / 66,55 porque arredonda
  // as médias (0,24 e 0,10) antes do RS. Sem arredondar: ganhos 3,34/14 e perdas 1,40/14 →
  // RS 2,3857 → 70,46; depois −0,28 → 66,25; +0,03 → 66,48.
  it('IFR de Wilder: exemplo clássico (StockCharts), sem arredondar as médias', () => {
    const precos = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46.0, 46.03,
    ];
    const ind = serieDeIndicadores(serie(precos));
    expect(ind(13).rsi14).toBeNull();
    expect(ind(14).rsi14).toBeCloseTo(70.46, 2);
    expect(ind(15).rsi14).toBeCloseTo(66.25, 2);
    expect(ind(16).rsi14).toBeCloseTo(66.48, 2);
  });

  it('%B: desvio populacional de 20 dias e bandas de 2 desvios', () => {
    const ind = indicadores(serie(crescente(20)));
    const desvio = Math.sqrt(399 / 12);
    expect(ind.bollinger_pctb).toBeCloseTo((20 - (10.5 - 2 * desvio)) / (4 * desvio), 10);
  });

  it('volume dos últimos 5 dias sobre a média de 50', () => {
    const volumes = [...Array(45).fill(100), ...Array(5).fill(200)];
    expect(indicadores(serie(Array(50).fill(1), volumes)).volume_5d_50d).toBeCloseTo(200 / 110, 10);
  });

  it('série curta: null no que exige mais dados', () => {
    const ind = indicadores(serie(crescente(30)));
    expect(ind).toMatchObject({
      mm50: null,
      mm200: null,
      dist_mm50: null,
      ret_3m: null,
      ret_1a: null,
      mm50_subindo: null,
      volume_5d_50d: null,
    });
    expect(ind.mm20).not.toBeNull();
    expect(ind.rsi14).not.toBeNull();
    expect(ind.ret_1m).not.toBeNull();
  });
});
