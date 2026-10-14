import { criarAppTeste, idAtivo } from './utils/app-teste';
import { fluxoCrud } from './utils/fluxo-crud';

const ATIVOS = ['PETR4', 'TSLA', 'CSCO'];

const sinal = (ctx, i) => ({
  execucao_id: ctx.apoio.execucaoId,
  ativo_id: idAtivo(ctx.db, ATIVOS[i]),
  ticker_yahoo: ATIVOS[i],
  data_preco: '2026-10-13',
  noticias: 'positivo',
  grafico: 'alta',
  pontos_noticias: 1,
  pontos_grafico: 1,
  pontos_extremos: 0,
  soma: 2,
  nota: 4,
  concordam: true,
  rsi14: 55.2,
});

const preparar = async (ctx) => {
  const res = await ctx
    .http()
    .post('/v1/execucoes')
    .send({ data_execucao: '2026-10-13', fonte_lista: 'lista_salva' });
  return { execucaoId: res.body.id };
};

fluxoCrud({
  recurso: 'sinais',
  preparar,
  novo: sinal,
  atualizacao: { nota: 2, destaque: 'Queda forte' },
  invalido: { payload: { nota: 7 }, campo: 'nota' },
});

describe('/v1/sinais (regras)', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await criarAppTeste();
    ctx.apoio = await preparar(ctx);
  });
  afterEach(() => ctx.app.close());

  it('preenche o código do ativo a partir do ativo_id e grava booleanos como 0/1', async () => {
    const res = await ctx.http().post('/v1/sinais').send(sinal(ctx, 0));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ativo: 'PETR4', concordam: 1 });

    const tsla = idAtivo(ctx.db, 'TSLA');
    const atualizado = await ctx.http().patch(`/v1/sinais/${res.body.id}`).send({ ativo_id: tsla });
    expect(atualizado.body).toMatchObject({ ativo_id: tsla, ativo: 'TSLA' });
  });

  it('não aceita o código do ativo no payload (vem do ativo_id)', async () => {
    const res = await ctx
      .http()
      .post('/v1/sinais')
      .send({ ...sinal(ctx, 0), ativo: 'XPTO' });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.map((d) => d.campo)).toContain('ativo');
  });

  it('ativo_id inexistente → 422', async () => {
    const res = await ctx
      .http()
      .post('/v1/sinais')
      .send({ ...sinal(ctx, 0), ativo_id: 999 });
    expect(res.status).toBe(422);
    expect(res.body.erro).toBe('entidade_invalida');
  });

  it('execucao_id inexistente → 422', async () => {
    const res = await ctx
      .http()
      .post('/v1/sinais')
      .send({ ...sinal(ctx, 0), execucao_id: 999 });
    expect(res.status).toBe(422);
  });

  it('valida os valores permitidos de noticias e grafico', async () => {
    const res = await ctx
      .http()
      .post('/v1/sinais')
      .send({ ...sinal(ctx, 0), noticias: 'otimo', grafico: 'subindo' });
    expect(res.body.detalhes.map((d) => d.campo)).toEqual(
      expect.arrayContaining(['noticias', 'grafico']),
    );
  });

  it('filtra por execucao_id e ativo_id', async () => {
    await ctx.http().post('/v1/sinais').send(sinal(ctx, 0));
    await ctx.http().post('/v1/sinais').send(sinal(ctx, 1));
    const res = await ctx
      .http()
      .get('/v1/sinais')
      .query({ ativo_id: idAtivo(ctx.db, 'TSLA') });
    expect(res.body.dados.map((s) => s.ativo)).toEqual(['TSLA']);
  });
});
