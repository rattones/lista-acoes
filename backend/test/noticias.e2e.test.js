import { criarAppTeste, idAtivo } from './utils/app-teste';
import { fluxoCrud } from './utils/fluxo-crud';

const noticia = (ctx, i) => ({
  ativo_id: idAtivo(ctx.db, 'PETR4'),
  titulo: `Petrobras anuncia dividendos ${i}`,
  resumo: 'Resumo da notícia',
  fonte: 'Valor',
  url: `https://exemplo.com/noticias/${i}`,
  publicada_em: '2026-10-13T09:30:00-03:00',
  sentimento: 'positivo',
});

fluxoCrud({
  recurso: 'noticias',
  novo: noticia,
  atualizacao: { sentimento: 'neutro', ativo_id: null },
  invalido: { payload: { titulo: 'x', url: 'nao-e-url' }, campo: 'url' },
});

describe('/v1/noticias (regras e lote)', () => {
  let ctx;
  const contar = () => ctx.db.prepare('SELECT COUNT(*) FROM noticias').pluck().get();

  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  it('aceita notícia geral (sem ativo) e preenche coletada_em', async () => {
    const res = await ctx
      .http()
      .post('/v1/noticias')
      .send({ titulo: 'Mercado', url: 'https://exemplo.com/geral' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ativo_id: null, coletada_em: expect.any(String) });
  });

  it('URL repetida → 409', async () => {
    await ctx.http().post('/v1/noticias').send(noticia(ctx, 0));
    expect((await ctx.http().post('/v1/noticias').send(noticia(ctx, 0))).status).toBe(409);
  });

  it('POST /lote faz upsert pela URL', async () => {
    await ctx
      .http()
      .post('/v1/noticias/lote')
      .send({ itens: [noticia(ctx, 0)] });
    const res = await ctx
      .http()
      .post('/v1/noticias/lote')
      .send({ itens: [{ ...noticia(ctx, 0), sentimento: 'negativo' }, noticia(ctx, 1)] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inseridos: 1, atualizados: 1 });
    expect(contar()).toBe(2);
    expect(
      ctx.db.prepare("SELECT sentimento FROM noticias WHERE url LIKE '%/0'").pluck().get(),
    ).toBe('negativo');
  });

  it('sentimento fora da lista → 400', async () => {
    const res = await ctx
      .http()
      .post('/v1/noticias')
      .send({ ...noticia(ctx, 0), sentimento: 'otimo' });
    expect(res.status).toBe(400);
  });
});
