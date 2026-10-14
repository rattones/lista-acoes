import { criarAppTeste } from './app-teste';

// Fluxo padrão de CRUD (tarefa 011), repetido para cada recurso:
// criar, listar paginado, obter, atualizar, exclusão lógica, restaurar e exclusão física.
//
// opcoes:
//   recurso      caminho em /v1 e nome da tabela (tabela, se diferente)
//   novo(ctx, i) payload válido e único para POST (ausente = recurso sem POST)
//   semear(ctx, i) cria o registro direto no banco e devolve o id (quando não há POST)
//   atualizacao  payload válido para PATCH
//   invalido     { payload, campo } que deve gerar 400 no POST (ou no PATCH, se não há POST)
//   preparar(ctx) dados de apoio criados antes de cada teste
export function fluxoCrud(opcoes) {
  const { recurso, tabela = recurso, novo, semear, atualizacao, invalido, preparar } = opcoes;
  const base = `/v1/${recurso}`;

  describe(`${base} (CRUD)`, () => {
    let ctx;

    const criar = async (i = 0) => {
      if (novo) {
        const res = await ctx
          .http()
          .post(base)
          .send(await novo(ctx, i));
        expect(res.status).toBe(201);
        return res.body;
      }
      const id = semear(ctx, i);
      return (await ctx.http().get(`${base}/${id}`)).body;
    };
    const contarNoBanco = (id) =>
      ctx.db.prepare(`SELECT COUNT(*) FROM ${tabela} WHERE id = ?`).pluck().get(id);

    beforeEach(async () => {
      ctx = await criarAppTeste();
      ctx.apoio = preparar ? await preparar(ctx) : {};
    });

    afterEach(async () => {
      await ctx.app.close();
    });

    if (novo) {
      it('POST cria e devolve 201 com o registro', async () => {
        const payload = await novo(ctx, 0);
        const res = await ctx.http().post(base).send(payload);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: expect.any(Number), excluido_em: null });
        expect(contarNoBanco(res.body.id)).toBe(1);
      });
    } else {
      it('POST não existe para este recurso', async () => {
        const res = await ctx.http().post(base).send({});
        expect(res.status).toBe(404);
      });
    }

    it('payload inválido → 400 com detalhes', async () => {
      const res = novo
        ? await ctx.http().post(base).send(invalido.payload)
        : await ctx
            .http()
            .patch(`${base}/${(await criar()).id}`)
            .send(invalido.payload);
      expect(res.status).toBe(400);
      expect(res.body.erro).toBe('requisicao_invalida');
      expect(res.body.detalhes.map((d) => d.campo)).toContain(invalido.campo);
    });

    it('GET lista com paginação e ordenação', async () => {
      const criados = [await criar(0), await criar(1), await criar(2)];
      const total = ctx.db.prepare(`SELECT COUNT(*) FROM ${tabela}`).pluck().get();

      const res = await ctx.http().get(base).query({ pagina: 2, por_pagina: 1, ordenar: '-id' });
      expect(res.status).toBe(200);
      expect(res.body.paginacao).toEqual({
        pagina: 2,
        por_pagina: 1,
        total,
        total_paginas: total,
      });
      expect(res.body.dados).toHaveLength(1);
      expect(res.body.dados[0].id).toBe(criados[1].id);
    });

    it('GET com parâmetros inválidos → 400', async () => {
      for (const query of [
        { por_pagina: 1000 },
        { pagina: 0 },
        { ordenar: 'nao_existe' },
        { x: 1 },
      ]) {
        const res = await ctx.http().get(base).query(query);
        expect(res.status).toBe(400);
      }
    });

    it('GET /:id obtém; id inexistente → 404; id inválido → 400', async () => {
      const criado = await criar();
      const res = await ctx.http().get(`${base}/${criado.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(criado);

      const inexistente = await ctx.http().get(`${base}/999999`);
      expect(inexistente.status).toBe(404);
      expect(inexistente.body.erro).toBe('nao_encontrado');

      expect((await ctx.http().get(`${base}/abc`)).status).toBe(400);
    });

    it('PATCH atualiza os campos enviados', async () => {
      const criado = await criar();
      const res = await ctx.http().patch(`${base}/${criado.id}`).send(atualizacao);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ...atualizacao, id: criado.id });

      expect((await ctx.http().patch(`${base}/${criado.id}`).send({})).status).toBe(400);
      expect((await ctx.http().patch(`${base}/999999`).send(atualizacao)).status).toBe(404);
    });

    it('DELETE faz exclusão lógica: some da listagem e do GET, mas fica no banco', async () => {
      const criado = await criar();
      expect((await ctx.http().delete(`${base}/${criado.id}`)).status).toBe(204);

      const lista = await ctx.http().get(base).query({ por_pagina: 100 });
      expect(lista.body.dados.map((r) => r.id)).not.toContain(criado.id);
      expect((await ctx.http().get(`${base}/${criado.id}`)).status).toBe(404);
      expect((await ctx.http().patch(`${base}/${criado.id}`).send(atualizacao)).status).toBe(404);
      expect((await ctx.http().delete(`${base}/${criado.id}`)).status).toBe(404);
      expect(contarNoBanco(criado.id)).toBe(1);

      const comExcluidos = await ctx
        .http()
        .get(base)
        .query({ por_pagina: 100, incluir_excluidos: true });
      const excluido = comExcluidos.body.dados.find((r) => r.id === criado.id);
      expect(excluido.excluido_em).toMatch(/^\d{4}-\d{2}-\d{2} /);
      const obtido = await ctx
        .http()
        .get(`${base}/${criado.id}`)
        .query({ incluir_excluidos: true });
      expect(obtido.status).toBe(200);
    });

    it('POST /:id/restaurar desfaz a exclusão lógica', async () => {
      const criado = await criar();
      await ctx.http().delete(`${base}/${criado.id}`);

      const res = await ctx.http().post(`${base}/${criado.id}/restaurar`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: criado.id, excluido_em: null });
      expect((await ctx.http().get(`${base}/${criado.id}`)).status).toBe(200);

      const deNovo = await ctx.http().post(`${base}/${criado.id}/restaurar`);
      expect(deNovo.status).toBe(409);
      expect((await ctx.http().post(`${base}/999999/restaurar`)).status).toBe(404);
    });

    it('DELETE ?permanente=true apaga do banco (também registro já excluído)', async () => {
      const criado = await criar();
      const res = await ctx.http().delete(`${base}/${criado.id}`).query({ permanente: true });
      expect(res.status).toBe(204);
      expect(contarNoBanco(criado.id)).toBe(0);
      expect(
        (await ctx.http().get(`${base}/${criado.id}`).query({ incluir_excluidos: true })).status,
      ).toBe(404);

      const outro = await criar(1);
      await ctx.http().delete(`${base}/${outro.id}`);
      expect(
        (await ctx.http().delete(`${base}/${outro.id}`).query({ permanente: true })).status,
      ).toBe(204);
      expect(contarNoBanco(outro.id)).toBe(0);
      expect((await ctx.http().delete(`${base}/999999`).query({ permanente: true })).status).toBe(
        404,
      );
    });
  });
}
