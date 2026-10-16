import { abrirConexao } from './conexao';
import { executar } from './cli';
import { aplicarMigracoes, PASTA_MIGRACOES } from './migracoes';
import { gerarSeed, limparSeed } from './seed-dev';

// Dados fictícios do DEV (tarefa 032), para o dashboard (025) antes dos agentes coletores.
// Datas a partir de um "hoje" fixo: sempre os mesmos dados.
const HOJE = '2026-10-16'; // sexta-feira

const media = (valores) => valores.reduce((a, b) => a + b, 0) / valores.length;
const perto = (a, b, casas = 6) => expect(a).toBeCloseTo(b, casas);

describe('seed do DEV', () => {
  let db;
  const contar = (sql, ...params) => db.prepare(sql).get(...params).n;

  beforeEach(() => {
    db = abrirConexao(':memory:');
    aplicarMigracoes(db, PASTA_MIGRACOES);
  });

  afterEach(() => db.close());

  it('gera preços, execuções, sinais e notícias só para os ativos ativos, todos marcados', () => {
    db.prepare("UPDATE ativos SET status = 'inativo' WHERE ativo = 'ORCL'").run();
    db.prepare("UPDATE ativos SET excluido_em = '2026-10-01' WHERE ativo = 'CSCO'").run();

    const resumo = gerarSeed(db, { hoje: HOJE });

    const ativos = db
      .prepare('SELECT DISTINCT a.ativo FROM precos_diarios p JOIN ativos a ON a.id = p.ativo_id')
      .all()
      .map((r) => r.ativo)
      .sort();
    expect(ativos).toEqual(['GOOGL', 'PETR4', 'TSLA', 'USDT-BRL']);

    expect(contar("SELECT COUNT(*) n FROM precos_diarios WHERE fonte <> 'seed'")).toBe(0);
    expect(contar("SELECT COUNT(*) n FROM execucoes WHERE fonte_lista <> 'seed'")).toBe(0);
    expect(contar("SELECT COUNT(*) n FROM noticias WHERE fonte <> 'seed'")).toBe(0);
    expect(
      contar("SELECT COUNT(*) n FROM noticias WHERE url NOT LIKE 'https://exemplo.invalid/%'"),
    ).toBe(0);

    // 90 execuções em dias úteis, com um sinal por ativo ativo.
    expect(contar('SELECT COUNT(*) n FROM execucoes')).toBe(90);
    expect(contar('SELECT COUNT(*) n FROM sinais')).toBe(90 * 4);
    expect(
      contar("SELECT COUNT(*) n FROM execucoes WHERE strftime('%w', data_execucao) IN ('0','6')"),
    ).toBe(0);
    expect(db.prepare('SELECT MAX(data_execucao) d FROM execucoes').get().d).toBe(HOJE);

    // Notícias por ativo e gerais, com sentimento variado.
    expect(contar('SELECT COUNT(*) n FROM noticias WHERE ativo_id IS NULL')).toBeGreaterThan(0);
    expect(
      contar('SELECT COUNT(DISTINCT ativo_id) n FROM noticias WHERE ativo_id IS NOT NULL'),
    ).toBe(4);
    expect(contar('SELECT COUNT(DISTINCT sentimento) n FROM noticias')).toBe(3);

    expect(resumo).toEqual({
      ativos: 4,
      precos: contar('SELECT COUNT(*) n FROM precos_diarios'),
      execucoes: 90,
      sinais: 360,
      noticias: contar('SELECT COUNT(*) n FROM noticias'),
    });
  });

  it('ações só têm preço em dias úteis; cripto e stablecoin, todos os dias', () => {
    gerarSeed(db, { hoje: HOJE });
    const fimDeSemana = (ativo) =>
      contar(
        `SELECT COUNT(*) n FROM precos_diarios p JOIN ativos a ON a.id = p.ativo_id
         WHERE a.ativo = ? AND strftime('%w', p.data) IN ('0','6')`,
        ativo,
      );
    expect(fimDeSemana('PETR4')).toBe(0);
    expect(fimDeSemana('USDT-BRL')).toBeGreaterThan(0);

    // Histórico bastante para a MM200 já na primeira execução.
    const primeira = db.prepare('SELECT MIN(data_execucao) d FROM execucoes').get().d;
    const antes = contar(
      `SELECT COUNT(*) n FROM precos_diarios p JOIN ativos a ON a.id = p.ativo_id
       WHERE a.ativo = 'PETR4' AND p.data <= ?`,
      primeira,
    );
    expect(antes).toBeGreaterThanOrEqual(200);
  });

  it('OHLC coerente e moeda pelo ativo', () => {
    gerarSeed(db, { hoje: HOJE });
    expect(
      contar(
        `SELECT COUNT(*) n FROM precos_diarios
         WHERE NOT (minima <= abertura AND minima <= fechamento AND maxima >= abertura
                    AND maxima >= fechamento AND minima > 0 AND volume > 0)`,
      ),
    ).toBe(0);
    const moeda = (ativo) =>
      db
        .prepare(
          `SELECT DISTINCT p.moeda FROM precos_diarios p JOIN ativos a ON a.id = p.ativo_id
           WHERE a.ativo = ?`,
        )
        .all(ativo)
        .map((r) => r.moeda);
    expect(moeda('PETR4')).toEqual(['BRL']);
    expect(moeda('USDT-BRL')).toEqual(['BRL']);
    expect(moeda('TSLA')).toEqual(['USD']);
  });

  it('mesma semente, mesmos dados; rodar de novo não duplica', () => {
    gerarSeed(db, { hoje: HOJE });
    const retrato = () => ({
      precos: db
        .prepare(
          'SELECT ativo_id, data, fechamento, volume FROM precos_diarios ORDER BY ativo_id, data',
        )
        .all(),
      sinais: db
        .prepare(
          'SELECT ativo_id, data_preco, nota, rsi14, mm20 FROM sinais ORDER BY ativo_id, data_preco',
        )
        .all(),
      noticias: db.prepare('SELECT url, titulo, sentimento FROM noticias ORDER BY url').all(),
    });
    const primeiro = retrato();

    gerarSeed(db, { hoje: HOJE });
    expect(retrato()).toEqual(primeiro);
  });

  it('indicadores batem com os preços gravados', () => {
    gerarSeed(db, { hoje: HOJE });
    const { id } = db.prepare("SELECT id FROM ativos WHERE ativo = 'PETR4'").get();
    const sinal = db
      .prepare('SELECT * FROM sinais WHERE ativo_id = ? ORDER BY data_preco DESC LIMIT 1')
      .get(id);
    const fechamentos = db
      .prepare(
        'SELECT fechamento FROM precos_diarios WHERE ativo_id = ? AND data <= ? ORDER BY data',
      )
      .all(id, sinal.data_preco)
      .map((r) => r.fechamento);
    const ultimo = fechamentos.at(-1);

    expect(sinal.fechamento).toBe(ultimo);
    perto(sinal.mm20, media(fechamentos.slice(-20)));
    perto(sinal.mm50, media(fechamentos.slice(-50)));
    perto(sinal.mm200, media(fechamentos.slice(-200)));
    // Retornos e distâncias em porcentagem (3,2 = 3,2%).
    perto(sinal.ret_5d, (ultimo / fechamentos.at(-6) - 1) * 100);
    perto(sinal.dist_mm20, (ultimo / sinal.mm20 - 1) * 100);
    const janela = fechamentos.slice(-252);
    perto(sinal.max_52s, Math.max(...janela));
    perto(sinal.min_52s, Math.min(...janela));
    expect(sinal.rsi14).toBeGreaterThanOrEqual(0);
    expect(sinal.rsi14).toBeLessThanOrEqual(100);
    perto(sinal.macd_hist, sinal.macd - sinal.macd_sinal);
    const desvio = Math.sqrt(media(fechamentos.slice(-20).map((v) => (v - sinal.mm20) ** 2)));
    perto(sinal.bollinger_pctb, (ultimo - (sinal.mm20 - 2 * desvio)) / (4 * desvio));
  });

  it('leituras, pontos e nota são coerentes entre si e com os CHECK do schema', () => {
    gerarSeed(db, { hoje: HOJE });
    const sinais = db.prepare('SELECT * FROM sinais').all();
    const PONTOS_NOTICIAS = { positivo: 2, misto_pos: 1, misto: 0, misto_neg: -1, negativo: -2 };
    const PONTOS_GRAFICO = { alta: 2, recuperacao: 1, lateral: 0, baixa: -2 };
    for (const s of sinais) {
      expect(s.pontos_noticias).toBe(PONTOS_NOTICIAS[s.noticias]);
      expect(s.pontos_grafico).toBe(PONTOS_GRAFICO[s.grafico]);
      perto(s.soma, s.pontos_noticias + s.pontos_grafico + s.pontos_extremos);
      expect(s.nota).toBe(Math.min(5, Math.max(1, Math.round(3 + s.soma / 2))));
      expect([0, 1]).toContain(s.concordam);
    }
    // Variedade: o dashboard precisa de notas diferentes.
    expect(new Set(sinais.map((s) => s.nota)).size).toBeGreaterThanOrEqual(4);
  });

  it('não apaga nem altera dados reais (fonte diferente de seed), nem com limpar', () => {
    const petr4 = db.prepare("SELECT id FROM ativos WHERE ativo = 'PETR4'").get().id;
    db.prepare(
      "INSERT INTO precos_diarios (ativo_id, data, fechamento, fonte) VALUES (?, '2026-10-15', 99.9, 'yahoo')",
    ).run(petr4);
    db.prepare(
      "INSERT INTO execucoes (data_execucao, fonte_lista) VALUES ('2026-10-14', 'lista_salva')",
    ).run();
    db.prepare(
      "INSERT INTO noticias (titulo, url, fonte) VALUES ('Real', 'https://real.com/n/1', 'valor')",
    ).run();

    gerarSeed(db, { hoje: HOJE });
    // O dia ocupado por dados reais fica com eles.
    expect(
      db
        .prepare(
          "SELECT fechamento, fonte FROM precos_diarios WHERE ativo_id = ? AND data = '2026-10-15'",
        )
        .get(petr4),
    ).toEqual({ fechamento: 99.9, fonte: 'yahoo' });
    expect(
      db.prepare("SELECT fonte_lista FROM execucoes WHERE data_execucao = '2026-10-14'").get()
        .fonte_lista,
    ).toBe('lista_salva');

    limparSeed(db);
    expect(contar("SELECT COUNT(*) n FROM precos_diarios WHERE fonte = 'seed'")).toBe(0);
    expect(contar("SELECT COUNT(*) n FROM execucoes WHERE fonte_lista = 'seed'")).toBe(0);
    expect(contar('SELECT COUNT(*) n FROM sinais')).toBe(0);
    expect(contar("SELECT COUNT(*) n FROM noticias WHERE fonte = 'seed'")).toBe(0);
    expect(contar('SELECT COUNT(*) n FROM precos_diarios')).toBe(1);
    expect(contar('SELECT COUNT(*) n FROM execucoes')).toBe(1);
    expect(contar('SELECT COUNT(*) n FROM noticias')).toBe(1);
  });

  describe('CLI', () => {
    let linhas;
    const saida = (linha) => linhas.push(linha);

    beforeEach(() => {
      linhas = [];
    });

    it('seed-dev gera e resume; --limpar só apaga', async () => {
      await executar('seed-dev', { db, saida, args: [], ambiente: 'development', hoje: HOJE });
      expect(linhas[0]).toMatch(
        /^Dados fictícios gerados: 6 ativo\(s\), \d+ preço\(s\), 90 execução\(ões\), 540 sinal\(is\), \d+ notícia\(s\)\.$/,
      );

      linhas = [];
      await executar('seed-dev', { db, saida, args: ['--limpar'], ambiente: 'development' });
      expect(linhas).toEqual(['Dados fictícios apagados.']);
      expect(contar('SELECT COUNT(*) n FROM sinais')).toBe(0);
    });

    it('com NODE_ENV=production, falha sem gravar nada', async () => {
      await expect(
        executar('seed-dev', { db, saida, args: [], ambiente: 'production', hoje: HOJE }),
      ).rejects.toThrow(/produção/);
      expect(contar('SELECT COUNT(*) n FROM precos_diarios')).toBe(0);
      expect(contar('SELECT COUNT(*) n FROM execucoes')).toBe(0);
      await expect(
        executar('seed-dev', { db, saida, args: ['--limpar'], ambiente: 'production' }),
      ).rejects.toThrow(/produção/);
    });
  });
});
