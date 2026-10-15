import { ClienteHttp } from './cliente-http';

const URL_TESTE = 'https://fonte.teste/dados';
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

// Cliente HTTP das fontes externas do wrapper (tarefa 018).
describe('ClienteHttp', () => {
  let esperas;
  const cliente = (fetch, opcoes = {}) =>
    new ClienteHttp({
      fetch,
      userAgent: 'agente-de-teste/1.0',
      timeoutMs: 50,
      tentativas: 3,
      esperaBaseMs: 100,
      cacheSegundos: 60,
      dormir: async (ms) => esperas.push(ms),
      ...opcoes,
    });

  beforeEach(() => {
    esperas = [];
  });

  it('devolve status e corpo JSON, enviando o User-Agent configurado', async () => {
    const fetch = jest.fn(async () => json({ ok: 1 }));
    expect(await cliente(fetch).getJson(URL_TESTE, { fonte: 'Fonte' })).toEqual({
      status: 200,
      corpo: { ok: 1 },
    });
    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe(URL_TESTE);
    expect(new Headers(opcoes.headers).get('user-agent')).toBe('agente-de-teste/1.0');
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
  });

  it('erro de rede, 5xx e 429 são repetidos com backoff exponencial', async () => {
    const respostas = [
      () => Promise.reject(new TypeError('fetch failed')),
      () => json({}, 503),
      () => json({ ok: 2 }),
    ];
    const fetch = jest.fn(() => respostas.shift()());
    expect((await cliente(fetch).getJson(URL_TESTE, { fonte: 'Fonte' })).corpo).toEqual({ ok: 2 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([100, 200]);

    const limitado = jest.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValue(json({}));
    await cliente(limitado).getJson(URL_TESTE, { fonte: 'Fonte' });
    expect(limitado).toHaveBeenCalledTimes(2);
  });

  it('depois das tentativas, lança fonte_indisponivel (502) com o nome da fonte', async () => {
    const fetch = jest.fn(async () => json({}, 500));
    await expect(cliente(fetch).getJson(URL_TESTE, { fonte: 'Yahoo Finance' })).rejects.toEqual(
      expect.objectContaining({
        status: 502,
        response: expect.objectContaining({
          erro: 'fonte_indisponivel',
          mensagem: expect.stringContaining('Yahoo Finance'),
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('timeout conta como falha e é repetido', async () => {
    const fetch = jest.fn(
      (url, { signal }) =>
        new Promise((resolver, rejeitar) => {
          signal.addEventListener('abort', () => rejeitar(signal.reason));
        }),
    );
    await expect(cliente(fetch).getJson(URL_TESTE, { fonte: 'Fonte' })).rejects.toEqual(
      expect.objectContaining({ status: 502 }),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('corpo que não é JSON numa resposta 200 → fonte_indisponivel', async () => {
    const fetch = jest.fn(async () => new Response('<html>', { status: 200 }));
    await expect(cliente(fetch).getJson(URL_TESTE, { fonte: 'Fonte' })).rejects.toEqual(
      expect.objectContaining({ status: 502 }),
    );
  });

  it('4xx não é repetido nem guardado em cache: volta ao chamador', async () => {
    const fetch = jest.fn(async () => json({ erro: 'nao existe' }, 404));
    const http = cliente(fetch);
    expect(await http.getJson(URL_TESTE, { fonte: 'Fonte' })).toEqual({
      status: 404,
      corpo: { erro: 'nao existe' },
    });
    await http.getJson(URL_TESTE, { fonte: 'Fonte' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cache curto: a mesma URL dentro do prazo não vai à rede', async () => {
    let agora = 1_000_000;
    const fetch = jest.fn(async () => json({ ok: 1 }));
    const http = cliente(fetch, { agora: () => agora });
    await http.getJson(URL_TESTE, { fonte: 'Fonte' });
    agora += 59_000;
    await http.getJson(URL_TESTE, { fonte: 'Fonte' });
    expect(fetch).toHaveBeenCalledTimes(1);
    agora += 2_000;
    await http.getJson(URL_TESTE, { fonte: 'Fonte' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cacheSegundos = 0 desliga o cache', async () => {
    const fetch = jest.fn(async () => json({ ok: 1 }));
    const http = cliente(fetch, { cacheSegundos: 0 });
    await http.getJson(URL_TESTE, { fonte: 'Fonte' });
    await http.getJson(URL_TESTE, { fonte: 'Fonte' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
