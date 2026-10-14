import { criarAppTeste } from './utils/app-teste';
import { fluxoCrud } from './utils/fluxo-crud';

const execucao = (i) => ({
  data_execucao: `2026-10-${String(10 + i).padStart(2, '0')}`,
  fonte_lista: 'lista_salva',
});

fluxoCrud({
  recurso: 'execucoes',
  novo: (_ctx, i) => execucao(i),
  atualizacao: { relatorio_url: 'https://exemplo.com/relatorio.html' },
  invalido: {
    payload: { data_execucao: '13/10/2026', fonte_lista: 'lista_salva' },
    campo: 'data_execucao',
  },
});

describe('/v1/execucoes (regras)', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  it('fonte_lista aceita só google_finance ou lista_salva', async () => {
    const res = await ctx
      .http()
      .post('/v1/execucoes')
      .send({ ...execucao(0), fonte_lista: 'outra' });
    expect(res.status).toBe(400);
  });

  it('data de execução repetida → 409', async () => {
    await ctx.http().post('/v1/execucoes').send(execucao(0));
    expect((await ctx.http().post('/v1/execucoes').send(execucao(0))).status).toBe(409);
  });
});
