import { criarAppTeste, idAtivo } from './utils/app-teste';
import { fluxoCrud } from './utils/fluxo-crud';

const preco = (ctx, i) => ({
  ativo_id: idAtivo(ctx.db, 'PETR4'),
  data: `2026-10-${String(10 + i).padStart(2, '0')}`,
  abertura: 38,
  maxima: 39,
  minima: 37.5,
  fechamento: 38.5,
  volume: 1000000,
  moeda: 'BRL',
  fonte: 'yahoo',
});

fluxoCrud({
  recurso: 'precos',
  tabela: 'precos_diarios',
  novo: preco,
  atualizacao: { fechamento: 40.1 },
  invalido: { payload: { data: '2026-10-13' }, campo: 'ativo_id' },
});

describe('/v1/precos (regras e lote)', () => {
  let ctx;
  const contar = () => ctx.db.prepare('SELECT COUNT(*) FROM precos_diarios').pluck().get();

  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  it('preço repetido para o mesmo ativo e data → 409', async () => {
    await ctx.http().post('/v1/precos').send(preco(ctx, 0));
    expect((await ctx.http().post('/v1/precos').send(preco(ctx, 0))).status).toBe(409);
  });

  it('POST /lote insere vários preços', async () => {
    const res = await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [preco(ctx, 0), preco(ctx, 1)] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inseridos: 2, atualizados: 0 });
    expect(contar()).toBe(2);
  });

  it('lote com duplicata faz upsert, não duplica', async () => {
    await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [preco(ctx, 0)] });
    const res = await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [{ ...preco(ctx, 0), fechamento: 41 }, preco(ctx, 1)] });
    expect(res.body).toEqual({ inseridos: 1, atualizados: 1 });
    expect(contar()).toBe(2);
    expect(
      ctx.db
        .prepare("SELECT fechamento FROM precos_diarios WHERE data = '2026-10-10'")
        .pluck()
        .get(),
    ).toBe(41);
  });

  it('duplicata dentro do mesmo lote fica com o último valor', async () => {
    const res = await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [preco(ctx, 0), { ...preco(ctx, 0), fechamento: 42 }] });
    expect(res.body).toEqual({ inseridos: 1, atualizados: 1 });
    expect(contar()).toBe(1);
    expect(ctx.db.prepare('SELECT fechamento FROM precos_diarios').pluck().get()).toBe(42);
  });

  it('upsert só altera os campos enviados', async () => {
    await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [preco(ctx, 0)] });
    const { ativo_id: ativoId, data } = preco(ctx, 0);
    await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [{ ativo_id: ativoId, data, fechamento: 50 }] });
    expect(ctx.db.prepare('SELECT abertura, fechamento FROM precos_diarios').get()).toEqual({
      abertura: 38,
      fechamento: 50,
    });
  });

  // Saída dos dados fictícios (tarefa 033): um preço real substitui o do seed por inteiro.
  it('lote sobre um preço fictício (fonte seed) substitui o registro inteiro', async () => {
    const { ativo_id: ativoId, data } = preco(ctx, 0);
    ctx.db
      .prepare(
        `INSERT INTO precos_diarios (ativo_id, data, abertura, maxima, minima, fechamento, volume, moeda, fonte)
         VALUES (?, ?, 10, 11, 9, 10.5, 123, 'BRL', 'seed')`,
      )
      .run(ativoId, data);
    const res = await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [{ ativo_id: ativoId, data, fechamento: 38.5, fonte: 'yahoo' }] });
    expect(res.body).toEqual({ inseridos: 0, atualizados: 1 });
    expect(
      ctx.db
        .prepare(
          'SELECT abertura, maxima, minima, fechamento, volume, moeda, fonte, excluido_em FROM precos_diarios',
        )
        .all(),
    ).toEqual([
      {
        abertura: null,
        maxima: null,
        minima: null,
        fechamento: 38.5,
        volume: null,
        moeda: null,
        fonte: 'yahoo',
        excluido_em: null,
      },
    ]);
  });

  it('lote sobre um preço fictício sem fonte no item também não herda nada do seed', async () => {
    const { ativo_id: ativoId, data } = preco(ctx, 0);
    ctx.db
      .prepare(
        `INSERT INTO precos_diarios (ativo_id, data, abertura, fechamento, fonte) VALUES (?, ?, 10, 10.5, 'seed')`,
      )
      .run(ativoId, data);
    await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [{ ativo_id: ativoId, data, fechamento: 40 }] });
    expect(ctx.db.prepare('SELECT abertura, fechamento, fonte FROM precos_diarios').get()).toEqual({
      abertura: null,
      fechamento: 40,
      fonte: null,
    });
  });

  it('lote com item inválido → 400 indicando o item, sem gravar nada', async () => {
    const res = await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [preco(ctx, 0), { ...preco(ctx, 1), data: 'ontem' }] });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.map((d) => d.campo)).toContain('itens.1.data');
    expect(contar()).toBe(0);
  });

  it('lote com ativo inexistente → 422, sem gravar nada', async () => {
    const res = await ctx
      .http()
      .post('/v1/precos/lote')
      .send({ itens: [preco(ctx, 0), { ...preco(ctx, 1), ativo_id: 999 }] });
    expect(res.status).toBe(422);
    expect(contar()).toBe(0);
  });

  it('lote aceita até 1000 itens', async () => {
    const dia = (i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    const itens = Array.from({ length: 1000 }, (_, i) => ({ ...preco(ctx, 0), data: dia(i) }));
    const res = await ctx.http().post('/v1/precos/lote').send({ itens });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inseridos: 1000, atualizados: 0 });
  });

  it('lote vazio ou com mais de 1000 itens → 400', async () => {
    expect((await ctx.http().post('/v1/precos/lote').send({ itens: [] })).status).toBe(400);
    const muitos = Array.from({ length: 1001 }, (_, i) => ({
      ...preco(ctx, 0),
      data: `2020-01-01`,
      volume: i,
    }));
    expect((await ctx.http().post('/v1/precos/lote').send({ itens: muitos })).status).toBe(400);
  });
});
