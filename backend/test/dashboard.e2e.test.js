import request from 'supertest';
import { criarAppTeste, idAtivo } from './utils/app-teste';

// Dashboard (tarefa 025): rotas só de leitura para usuários logados, sem API key.
describe('/v1/dashboard', () => {
  let ctx;
  let ids;

  const execucao = (data, extra = {}) =>
    ctx.db
      .prepare(
        `INSERT INTO execucoes (data_execucao, fonte_lista, excluido_em) VALUES (?, 'teste', ?)`,
      )
      .run(data, extra.excluido_em ?? null).lastInsertRowid;

  const sinal = (execucaoId, ativo, nota, extra = {}) =>
    ctx.db
      .prepare(
        `INSERT INTO sinais (execucao_id, ativo_id, ativo, ticker_yahoo, data_preco, moeda,
           fechamento, noticias, grafico, pontos_noticias, pontos_grafico, pontos_extremos, soma,
           nota, concordam, tendencia, rsi14, bollinger_pctb, macd_hist, dist_mm20, dist_mm50,
           dist_mm200, ret_5d, ret_1m, ret_3m, ret_1a, excluido_em)
         VALUES (@execucao_id, @ativo_id, @ativo, @ativo, @data_preco, 'USD', @fechamento,
           @noticias, @grafico, 0, 0, 0, 0, @nota, @concordam, 'Alta', @rsi14, 0.5, 0.1, 1, 2, 3,
           0.5, 1.5, 4, 12, @excluido_em)`,
      )
      .run({
        execucao_id: execucaoId,
        ativo_id: ids[ativo],
        ativo,
        data_preco: extra.data_preco ?? '2026-10-09',
        fechamento: extra.fechamento ?? 100,
        noticias: extra.noticias ?? 'positivo',
        grafico: extra.grafico ?? 'alta',
        nota,
        concordam: extra.concordam ?? 1,
        rsi14: extra.rsi14 ?? 55,
        excluido_em: extra.excluido_em ?? null,
      });

  const preco = (ativo, data, fechamento, excluido_em = null) =>
    ctx.db
      .prepare(
        `INSERT INTO precos_diarios (ativo_id, data, fechamento, moeda, fonte, excluido_em)
         VALUES (?, ?, ?, 'USD', 'teste', ?)`,
      )
      .run(ids[ativo], data, fechamento, excluido_em);

  const noticia = (ativo, publicadaEm, titulo, excluido_em = null) =>
    ctx.db
      .prepare(
        `INSERT INTO noticias (ativo_id, titulo, fonte, url, publicada_em, sentimento, excluido_em)
         VALUES (?, ?, 'Fonte', ?, ?, 'positivo', ?)`,
      )
      .run(
        ativo ? ids[ativo] : null,
        titulo,
        `https://noticias.teste/${encodeURIComponent(titulo)}`,
        publicadaEm,
        excluido_em,
      );

  beforeEach(async () => {
    ctx = await criarAppTeste();
    ids = Object.fromEntries(['PETR4', 'TSLA', 'CSCO'].map((a) => [a, idAtivo(ctx.db, a)]));
  });
  afterEach(() => ctx.app.close());

  describe('GET /resumo', () => {
    it('sem execução → execucao null e lista vazia', async () => {
      const res = await ctx.http().get('/v1/dashboard/resumo');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ execucao: null, ativos: [] });
    });

    it('devolve a última execução não excluída, com a variação da nota', async () => {
      const e1 = execucao('2026-10-07');
      const e2 = execucao('2026-10-08');
      const e3 = execucao('2026-10-09');
      execucao('2026-10-10', { excluido_em: '2026-10-10 10:00:00' });
      sinal(e1, 'PETR4', 2);
      sinal(e2, 'PETR4', 3);
      sinal(e2, 'TSLA', 4, { excluido_em: '2026-10-08 10:00:00' });
      sinal(e3, 'PETR4', 5, { rsi14: 72 });
      sinal(e3, 'TSLA', 1, { concordam: 0, noticias: 'negativo', grafico: 'baixa' });
      sinal(e3, 'CSCO', 3, { excluido_em: '2026-10-09 10:00:00' });

      const res = await ctx.http().get('/v1/dashboard/resumo');
      expect(res.status).toBe(200);
      expect(res.body.execucao).toEqual({ id: e3, data_execucao: '2026-10-09' });
      expect(res.body.ativos.map((a) => a.ativo)).toEqual(['PETR4', 'TSLA']);
      const [petr4, tsla] = res.body.ativos;
      expect(petr4).toMatchObject({
        ativo_id: ids.PETR4,
        nome: 'Petrobras PN',
        tipo: 'acao',
        bolsa: 'BVMF',
        nota: 5,
        variacao_nota: 2,
        noticias: 'positivo',
        grafico: 'alta',
        concordam: 1,
        tendencia: 'Alta',
        fechamento: 100,
        moeda: 'USD',
        rsi14: 72,
        bollinger_pctb: 0.5,
        macd_hist: 0.1,
        dist_mm20: 1,
        dist_mm50: 2,
        dist_mm200: 3,
        ret_5d: 0.5,
        ret_1m: 1.5,
        ret_3m: 4,
        ret_1a: 12,
      });
      // O sinal excluído da execução anterior não conta: sem nota anterior, sem variação.
      expect(tsla).toMatchObject({ nota: 1, variacao_nota: null, concordam: 0 });
    });

    it('ativo excluído logicamente fica de fora', async () => {
      const e = execucao('2026-10-09');
      sinal(e, 'PETR4', 4);
      sinal(e, 'TSLA', 3);
      ctx.db
        .prepare("UPDATE ativos SET excluido_em = '2026-10-09 12:00:00' WHERE id = ?")
        .run(ids.TSLA);
      const res = await ctx.http().get('/v1/dashboard/resumo');
      expect(res.body.ativos.map((a) => a.ativo)).toEqual(['PETR4']);
    });

    it('parâmetro desconhecido → 400', async () => {
      const res = await ctx.http().get('/v1/dashboard/resumo').query({ x: 1 });
      expect(res.status).toBe(400);
      expect(res.body.erro).toBe('requisicao_invalida');
    });
  });

  describe('GET /historico', () => {
    beforeEach(() => {
      preco('PETR4', '2026-09-01', 30);
      preco('PETR4', '2026-10-01', 35);
      preco('PETR4', '2026-10-02', 36, '2026-10-03 10:00:00');
      preco('PETR4', '2026-10-05', 37);
      preco('TSLA', '2026-10-05', 250);
      const e1 = execucao('2026-09-02');
      const e2 = execucao('2026-10-02');
      const e3 = execucao('2026-10-06', { excluido_em: '2026-10-06 12:00:00' });
      const e4 = execucao('2026-10-07');
      sinal(e1, 'PETR4', 2, { data_preco: '2026-09-01' });
      sinal(e2, 'PETR4', 3, { data_preco: '2026-10-01', noticias: 'misto', grafico: 'lateral' });
      sinal(e3, 'PETR4', 5);
      sinal(e4, 'PETR4', 4, { data_preco: '2026-10-05', excluido_em: '2026-10-07 12:00:00' });
    });

    it('sem de: todo o histórico do ativo, sem excluídos, em ordem', async () => {
      const res = await ctx.http().get('/v1/dashboard/historico').query({ ativo_id: ids.PETR4 });
      expect(res.status).toBe(200);
      expect(res.body.precos).toEqual([
        { data: '2026-09-01', fechamento: 30 },
        { data: '2026-10-01', fechamento: 35 },
        { data: '2026-10-05', fechamento: 37 },
      ]);
      expect(res.body.notas).toEqual([
        {
          data_execucao: '2026-09-02',
          data_preco: '2026-09-01',
          nota: 2,
          noticias: 'positivo',
          grafico: 'alta',
        },
        {
          data_execucao: '2026-10-02',
          data_preco: '2026-10-01',
          nota: 3,
          noticias: 'misto',
          grafico: 'lateral',
        },
      ]);
    });

    it('com de: só a partir da data', async () => {
      const res = await ctx
        .http()
        .get('/v1/dashboard/historico')
        .query({ ativo_id: ids.PETR4, de: '2026-10-01' });
      expect(res.body.precos.map((p) => p.data)).toEqual(['2026-10-01', '2026-10-05']);
      expect(res.body.notas.map((n) => n.data_execucao)).toEqual(['2026-10-02']);
    });

    it('ativo sem dados → listas vazias', async () => {
      const res = await ctx.http().get('/v1/dashboard/historico').query({ ativo_id: ids.CSCO });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ precos: [], notas: [] });
    });

    it('ativo inexistente ou excluído → 404', async () => {
      const inexistente = await ctx.http().get('/v1/dashboard/historico').query({ ativo_id: 9999 });
      expect(inexistente.status).toBe(404);
      expect(inexistente.body.erro).toBe('nao_encontrado');

      ctx.db
        .prepare("UPDATE ativos SET excluido_em = '2026-10-09 12:00:00' WHERE id = ?")
        .run(ids.TSLA);
      const excluido = await ctx
        .http()
        .get('/v1/dashboard/historico')
        .query({ ativo_id: ids.TSLA });
      expect(excluido.status).toBe(404);
    });

    it('parâmetros inválidos → 400', async () => {
      for (const query of [
        {},
        { ativo_id: 'abc' },
        { ativo_id: ids.PETR4, de: '2026-13-01' },
        { ativo_id: ids.PETR4, de: 'ontem' },
      ]) {
        const res = await ctx.http().get('/v1/dashboard/historico').query(query);
        expect(res.status).toBe(400);
        expect(res.body.erro).toBe('requisicao_invalida');
      }
    });
  });

  describe('GET /noticias', () => {
    beforeEach(() => {
      noticia('PETR4', '2026-10-01 09:00:00', 'petr4 antiga');
      noticia('PETR4', '2026-10-05 09:00:00', 'petr4 nova');
      noticia('TSLA', '2026-10-04 09:00:00', 'tsla');
      noticia('CSCO', '2026-10-06 09:00:00', 'csco');
      noticia(null, '2026-10-03 09:00:00', 'geral');
      noticia('PETR4', '2026-10-07 09:00:00', 'excluída', '2026-10-07 10:00:00');
    });

    const titulos = (res) => res.body.map((n) => n.titulo);

    it('sem filtros: todas, mais recentes primeiro, sem excluídas', async () => {
      const res = await ctx.http().get('/v1/dashboard/noticias');
      expect(res.status).toBe(200);
      expect(titulos(res)).toEqual(['csco', 'petr4 nova', 'tsla', 'geral', 'petr4 antiga']);
      expect(res.body[0]).toMatchObject({
        ativo_id: ids.CSCO,
        ativo: 'CSCO',
        fonte: 'Fonte',
        url: 'https://noticias.teste/csco',
        publicada_em: '2026-10-06 09:00:00',
        sentimento: 'positivo',
      });
      expect(res.body.find((n) => n.titulo === 'geral')).toMatchObject({
        ativo_id: null,
        ativo: null,
      });
    });

    it('filtra por ativos e data, incluindo as gerais', async () => {
      const res = await ctx
        .http()
        .get('/v1/dashboard/noticias')
        .query({ ativos: `${ids.PETR4},${ids.TSLA}`, de: '2026-10-02' });
      expect(titulos(res)).toEqual(['petr4 nova', 'tsla', 'geral']);
    });

    it('respeita o limite (padrão 10, máximo 50)', async () => {
      const res = await ctx.http().get('/v1/dashboard/noticias').query({ limite: 2 });
      expect(titulos(res)).toEqual(['csco', 'petr4 nova']);

      for (let i = 0; i < 12; i++)
        noticia(null, `2026-09-${String(10 + i)} 09:00:00`, `extra ${i}`);
      expect((await ctx.http().get('/v1/dashboard/noticias')).body).toHaveLength(10);
    });

    it('notícia de ativo excluído logicamente fica de fora', async () => {
      ctx.db
        .prepare("UPDATE ativos SET excluido_em = '2026-10-09 12:00:00' WHERE id = ?")
        .run(ids.CSCO);
      const res = await ctx.http().get('/v1/dashboard/noticias');
      expect(titulos(res)).not.toContain('csco');
    });

    it('parâmetros inválidos → 400', async () => {
      for (const query of [
        { limite: 51 },
        { limite: 0 },
        { ativos: 'PETR4' },
        { ativos: '1,,2' },
        { de: '2026-02-30x' },
      ]) {
        const res = await ctx.http().get('/v1/dashboard/noticias').query(query);
        expect(res.status).toBe(400);
      }
    });
  });

  describe('acesso', () => {
    const ROTAS = ['/v1/dashboard/resumo', '/v1/dashboard/noticias'];

    it('sem login → 401; leitor → 200', async () => {
      for (const rota of ROTAS) {
        expect((await ctx.http(null).get(rota)).status).toBe(401);
        expect((await ctx.http(ctx.tokens.leitor).get(rota)).status).toBe(200);
      }
      const historico = await ctx
        .http(ctx.tokens.leitor)
        .get('/v1/dashboard/historico')
        .query({ ativo_id: ids.PETR4 });
      expect(historico.status).toBe(200);
    });

    it('API key: válida → 403 (rota sem escopo); inválida → 401', async () => {
      const criada = await ctx
        .http()
        .post('/v1/agentes-tokens')
        .send({ nome: 'agente', escopos: ['sinais:read', 'precos:read', 'noticias:read'] });
      expect(criada.status).toBe(201);
      for (const rota of ROTAS) {
        const comChave = await request(ctx.servidor)
          .get(rota)
          .set('Authorization', `Bearer ${criada.body.chave}`);
        expect(comChave.status).toBe(403);
        const invalida = await request(ctx.servidor)
          .get(rota)
          .set('Authorization', `Bearer la_00000000_${'0'.repeat(32)}`);
        expect(invalida.status).toBe(401);
      }
    });
  });
});
