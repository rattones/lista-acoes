'use strict';

const { ErroApi, criarClienteApi, TAMANHO_LOTE } = require('../src/cliente-api');
const { CHAVE_PRECOS, json } = require('./apoio');

// Cliente da API usado pelos agentes (tarefa 035): API key no Bearer e lotes de até 1000 itens.
describe('criarClienteApi', () => {
  const criar = (fetch) =>
    criarClienteApi({ url: 'http://backend:3000', chave: CHAVE_PRECOS, fetch });

  it('GET e POST com a API key no Authorization, em JSON', async () => {
    const fetch = jest.fn(async () => json({ dados: [] }));
    const api = criar(fetch);
    expect(await api.get('/v1/ativos?status=ativo')).toEqual({ dados: [] });
    await api.post('/v1/precos/lote', { itens: [] });

    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe('http://backend:3000/v1/ativos?status=ativo');
    expect(opcoes.method).toBe('GET');
    expect(opcoes.headers.authorization).toBe(`Bearer ${CHAVE_PRECOS}`);
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);

    const [, post] = fetch.mock.calls[1];
    expect(post.method).toBe('POST');
    expect(post.headers['content-type']).toBe('application/json');
    expect(JSON.parse(post.body)).toEqual({ itens: [] });
  });

  it('erro da API vira ErroApi com status, código e mensagem, sem a chave', async () => {
    const fetch = jest.fn(async () =>
      json({ erro: 'proibido', mensagem: 'Permissão insuficiente para esta operação' }, 403),
    );
    const erro = await criar(fetch)
      .get('/v1/ativos')
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 403, codigo: 'proibido' });
    expect(erro.message).toContain('Permissão insuficiente');
    expect(JSON.stringify(erro)).not.toContain(CHAVE_PRECOS);
    expect(erro.message).not.toContain(CHAVE_PRECOS);
  });

  it('resposta sem o formato da API e falha de rede também viram ErroApi', async () => {
    const html = jest.fn(async () => new Response('<html>', { status: 500 }));
    await expect(criar(html).get('/v1/ativos')).rejects.toMatchObject({
      status: 500,
      codigo: 'erro_http',
    });
    const rede = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(criar(rede).get('/v1/ativos')).rejects.toMatchObject({
      status: 0,
      codigo: 'sem_conexao',
    });
  });

  it('enviarLote divide em lotes de até 1000 itens e soma o resultado', async () => {
    expect(TAMANHO_LOTE).toBe(1000);
    const tamanhos = [];
    const fetch = jest.fn(async (url, opcoes) => {
      const { itens } = JSON.parse(opcoes.body);
      tamanhos.push(itens.length);
      return json({ inseridos: itens.length - 1, atualizados: 1 });
    });
    const itens = Array.from({ length: 2500 }, (_, i) => ({ i }));
    expect(await criar(fetch).enviarLote('/v1/precos/lote', itens)).toEqual({
      inseridos: 2497,
      atualizados: 3,
    });
    expect(tamanhos).toEqual([1000, 1000, 500]);
    expect(fetch.mock.calls[0][0]).toBe('http://backend:3000/v1/precos/lote');
  });

  it('enviarLote sem itens não chama a API', async () => {
    const fetch = jest.fn();
    expect(await criar(fetch).enviarLote('/v1/precos/lote', [])).toEqual({
      inseridos: 0,
      atualizados: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
