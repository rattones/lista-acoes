import request from 'supertest';
import { criarAppTeste, idAtivo } from './utils/app-teste';

// Notícias que pesaram na nota de cada sinal (tarefa 040), gravadas pelo agente de decisão.
describe('/v1/sinais/:id/noticias', () => {
  let ctx;
  let sinal;
  let noticias;

  const noticia = (titulo, publicadaEm, excluidoEm = null) =>
    ctx.db
      .prepare(
        `INSERT INTO noticias (ativo_id, titulo, fonte, url, publicada_em, excluido_em)
         VALUES (?, ?, 'Fonte', ?, ?, ?)`,
      )
      .run(idAtivo(ctx.db, 'PETR4'), titulo, `https://n.teste/${titulo}`, publicadaEm, excluidoEm)
      .lastInsertRowid;

  const gravar = (ids, token) =>
    ctx.http(token).post(`/v1/sinais/${sinal}/noticias`).send({ noticia_ids: ids });
  const ligadas = () =>
    ctx.db
      .prepare('SELECT noticia_id FROM sinais_noticias WHERE sinal_id = ? ORDER BY noticia_id')
      .pluck()
      .all(sinal);

  beforeEach(async () => {
    ctx = await criarAppTeste();
    const execucao = ctx.db
      .prepare("INSERT INTO execucoes (data_execucao, fonte_lista) VALUES ('2026-10-13', 'agente')")
      .run().lastInsertRowid;
    sinal = ctx.db
      .prepare(
        `INSERT INTO sinais (execucao_id, ativo_id, ativo, ticker_yahoo, data_preco, noticias, grafico,
           pontos_noticias, pontos_grafico, pontos_extremos, soma, nota, concordam)
         VALUES (?, ?, 'PETR4', 'PETR4.SA', '2026-10-13', 'positivo', 'alta', 2, 2, 0, 4, 5, 1)`,
      )
      .run(execucao, idAtivo(ctx.db, 'PETR4')).lastInsertRowid;
    noticias = {
      antiga: noticia('antiga', '2026-10-10 09:00:00'),
      nova: noticia('nova', '2026-10-12 09:00:00'),
      meio: noticia('meio', '2026-10-11 09:00:00'),
      excluida: noticia('excluida', '2026-10-12 10:00:00', '2026-10-12 11:00:00'),
    };
  });
  afterEach(() => ctx.app.close());

  describe('POST (substitui a lista)', () => {
    it('grava as notícias do sinal e devolve a lista, mais recentes primeiro', async () => {
      const res = await gravar([noticias.antiga, noticias.nova]);
      expect(res.status).toBe(200);
      expect(res.body.map((n) => n.titulo)).toEqual(['nova', 'antiga']);
      expect(res.body[0]).toMatchObject({
        id: noticias.nova,
        url: 'https://n.teste/nova',
        fonte: 'Fonte',
        publicada_em: '2026-10-12 09:00:00',
      });
      expect(ligadas()).toEqual([noticias.antiga, noticias.nova].sort((a, b) => a - b));
    });

    it('repetir substitui sem duplicar; lista vazia limpa', async () => {
      await gravar([noticias.antiga, noticias.nova]);
      await gravar([noticias.nova, noticias.meio, noticias.nova]);
      expect(ligadas()).toEqual([noticias.nova, noticias.meio].sort((a, b) => a - b));
      expect((await gravar([])).body).toEqual([]);
      expect(ligadas()).toEqual([]);
    });

    it('notícia inexistente ou excluída → 422, sem mudar a lista', async () => {
      await gravar([noticias.antiga]);
      for (const ids of [[noticias.nova, 99999], [noticias.excluida]]) {
        const res = await gravar(ids);
        expect(res.status).toBe(422);
        expect(res.body.erro).toBe('entidade_invalida');
      }
      expect(ligadas()).toEqual([noticias.antiga]);
    });

    it('sinal inexistente ou excluído → 404', async () => {
      expect(
        (await ctx.http().post('/v1/sinais/99999/noticias').send({ noticia_ids: [] })).status,
      ).toBe(404);
      ctx.db
        .prepare("UPDATE sinais SET excluido_em = '2026-10-13 12:00:00' WHERE id = ?")
        .run(sinal);
      expect((await gravar([noticias.antiga])).status).toBe(404);
    });

    it('corpo inválido → 400', async () => {
      for (const corpo of [
        {},
        { noticia_ids: 'x' },
        { noticia_ids: [0] },
        { noticia_ids: Array(51).fill(1) },
      ]) {
        const res = await ctx.http().post(`/v1/sinais/${sinal}/noticias`).send(corpo);
        expect(res.status).toBe(400);
        expect(res.body.erro).toBe('requisicao_invalida');
      }
    });

    it('leitor → 403', async () => {
      expect((await gravar([noticias.antiga], ctx.tokens.leitor)).status).toBe(403);
    });
  });

  describe('GET', () => {
    it('lista as notícias do sinal sem as excluídas, mais recentes primeiro; leitor lê', async () => {
      ctx.db
        .prepare('INSERT INTO sinais_noticias (sinal_id, noticia_id) VALUES (?, ?), (?, ?), (?, ?)')
        .run(sinal, noticias.antiga, sinal, noticias.excluida, sinal, noticias.meio);
      const res = await ctx.http(ctx.tokens.leitor).get(`/v1/sinais/${sinal}/noticias`);
      expect(res.status).toBe(200);
      expect(res.body.map((n) => n.titulo)).toEqual(['meio', 'antiga']);
    });

    it('sinal inexistente → 404; sem login → 401', async () => {
      expect((await ctx.http().get('/v1/sinais/99999/noticias')).status).toBe(404);
      expect((await ctx.http(null).get(`/v1/sinais/${sinal}/noticias`)).status).toBe(401);
    });
  });

  describe('API key', () => {
    const chave = async (escopos) =>
      (await ctx.http().post('/v1/agentes-tokens').send({ nome: 'agente', escopos })).body.chave;
    const comChave = (k) => ({
      get: (url) => request(ctx.servidor).get(url).set('Authorization', `Bearer ${k}`),
      post: (url) => request(ctx.servidor).post(url).set('Authorization', `Bearer ${k}`),
    });

    it('sinais:write grava e sinais:read lê; sem o escopo → 403', async () => {
      const escrita = comChave(await chave(['sinais:write']));
      const res = await escrita
        .post(`/v1/sinais/${sinal}/noticias`)
        .send({ noticia_ids: [noticias.nova] });
      expect(res.status).toBe(200);
      expect((await escrita.get(`/v1/sinais/${sinal}/noticias`)).status).toBe(403);

      const leitura = comChave(await chave(['sinais:read']));
      expect((await leitura.get(`/v1/sinais/${sinal}/noticias`)).status).toBe(200);
      expect(
        (await leitura.post(`/v1/sinais/${sinal}/noticias`).send({ noticia_ids: [] })).status,
      ).toBe(403);
    });
  });
});
