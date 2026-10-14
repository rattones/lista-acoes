import { criarAppTeste } from './utils/app-teste';
import { fluxoCrud } from './utils/fluxo-crud';

const ativo = (i) => ({
  ativo: `TESTE${i}`,
  nome: `Ativo de teste ${i}`,
  tipo: 'acao',
  bolsa: 'BVMF',
  ticker_yahoo: `TESTE${i}.SA`,
  url_historico: `https://query1.finance.yahoo.com/v8/finance/chart/TESTE${i}.SA?range=2y&interval=1d`,
});

fluxoCrud({
  recurso: 'ativos',
  novo: (_ctx, i) => ativo(i),
  atualizacao: { nome: 'Novo nome', status: 'inativo' },
  invalido: { payload: { ...ativo(0), tipo: 'imovel' }, campo: 'tipo' },
});

describe('/v1/ativos (regras)', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  it('aplica os padrões do schema (status ativo, adicionado_em hoje)', async () => {
    const res = await ctx.http().post('/v1/ativos').send(ativo(1));
    expect(res.body).toMatchObject({
      status: 'ativo',
      adicionado_em: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('exige ativo, tipo e url_historico, e valida URLs', async () => {
    const res = await ctx.http().post('/v1/ativos').send({ url_pagina: 'nao-e-url' });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.map((d) => d.campo)).toEqual(
      expect.arrayContaining(['ativo', 'tipo', 'url_historico', 'url_pagina']),
    );
  });

  it('código de ativo repetido → 409 indicando o campo', async () => {
    const res = await ctx
      .http()
      .post('/v1/ativos')
      .send({ ...ativo(1), ativo: 'PETR4' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ erro: 'conflito', detalhes: [{ campo: 'ativo' }] });
  });

  it('filtra por campos simples', async () => {
    await ctx.http().patch('/v1/ativos/1').send({ status: 'inativo' });
    const res = await ctx.http().get('/v1/ativos').query({ status: 'inativo' });
    expect(res.body.dados.map((a) => a.id)).toEqual([1]);
    const porTipo = await ctx.http().get('/v1/ativos').query({ tipo: 'stablecoin' });
    expect(porTipo.body.dados.map((a) => a.ativo)).toEqual(['USDT-BRL']);
  });

  it('ordena por padrão por id e aceita ordenação por outro campo', async () => {
    const padrao = await ctx.http().get('/v1/ativos');
    expect(padrao.body.dados.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6]);
    const porAtivo = await ctx.http().get('/v1/ativos').query({ ordenar: '-ativo' });
    expect(porAtivo.body.dados[0].ativo).toBe('USDT-BRL');
  });
});
