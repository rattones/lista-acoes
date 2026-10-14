import { criarAppTeste } from './utils/app-teste';
import { fluxoCrud } from './utils/fluxo-crud';

const semear = (ctx, i) =>
  Number(
    ctx.db
      .prepare('INSERT INTO usuarios (email, nome, senha_hash) VALUES (?, ?, ?)')
      .run(`usuario${i}@teste.com`, `Usuário ${i}`, '$argon2id$v=19$segredo').lastInsertRowid,
  );

fluxoCrud({
  recurso: 'usuarios',
  semear,
  atualizacao: { nome: 'Nome novo', papel: 'admin' },
  invalido: { payload: { papel: 'dono' }, campo: 'papel' },
});

describe('/v1/usuarios (regras)', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await criarAppTeste();
    semear(ctx, 0);
    semear(ctx, 1);
  });
  afterEach(() => ctx.app.close());

  it('nunca retorna senha_hash (listagem, obter, atualizar, restaurar)', async () => {
    const respostas = [
      await ctx.http().get('/v1/usuarios'),
      await ctx.http().get('/v1/usuarios').query({ incluir_excluidos: true }),
      await ctx.http().get('/v1/usuarios/1'),
      await ctx.http().patch('/v1/usuarios/1').send({ nome: 'Outro' }),
    ];
    await ctx.http().delete('/v1/usuarios/2');
    respostas.push(await ctx.http().post('/v1/usuarios/2/restaurar'));

    for (const res of respostas) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/senha_hash|argon2/);
    }
  });

  it('não permite alterar e-mail nem senha por esta rota', async () => {
    for (const payload of [
      { email: 'novo@teste.com' },
      { senha_hash: 'x' },
      { senha: 'senha-nova-123' },
    ]) {
      const res = await ctx.http().patch('/v1/usuarios/1').send(payload);
      expect(res.status).toBe(400);
    }
  });

  it('PATCH registra atualizado_em e grava ativo como 0/1', async () => {
    const res = await ctx.http().patch('/v1/usuarios/1').send({ ativo: false });
    expect(res.body).toMatchObject({
      ativo: 0,
      atualizado_em: expect.stringMatching(/^\d{4}-\d{2}-\d{2} /),
    });
  });

  it('não permite filtrar nem ordenar por senha_hash', async () => {
    expect((await ctx.http().get('/v1/usuarios').query({ ordenar: 'senha_hash' })).status).toBe(
      400,
    );
    expect((await ctx.http().get('/v1/usuarios').query({ senha_hash: 'x' })).status).toBe(400);
  });

  it('filtra por papel e e-mail (sem diferenciar maiúsculas)', async () => {
    const res = await ctx.http().get('/v1/usuarios').query({ email: 'USUARIO1@teste.com' });
    expect(res.body.dados.map((u) => u.id)).toEqual([2]);
  });

  it('exclusão física de usuário apaga suas API keys', async () => {
    ctx.db
      .prepare(
        "INSERT INTO agentes_tokens (nome, prefixo, token_hash, criado_por) VALUES ('a', 'p1', 'h', 1)",
      )
      .run();
    await ctx.http().delete('/v1/usuarios/1').query({ permanente: true });
    expect(ctx.db.prepare('SELECT COUNT(*) FROM agentes_tokens').pluck().get()).toBe(0);
  });
});
