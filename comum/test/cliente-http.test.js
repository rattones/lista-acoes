const { ClienteHttp, FonteIndisponivel } = require('../src/cliente-http');

const URL_TESTE = 'https://fonte.teste/dados';
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

// Cliente HTTP das fontes externas (tarefa 018; em comum/ desde a 035, usado pela API e pelos agentes).
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

  it('depois das tentativas, lança FonteIndisponivel com o nome da fonte', async () => {
    const fetch = jest.fn(async () => json({}, 500));
    const erro = await cliente(fetch)
      .getJson(URL_TESTE, { fonte: 'Yahoo Finance' })
      .catch((e) => e);
    expect(erro).toBeInstanceOf(FonteIndisponivel);
    expect(erro).toMatchObject({ name: 'FonteIndisponivel', fonte: 'Yahoo Finance' });
    expect(erro.message).toContain('Yahoo Finance');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('erroIndisponivel troca o erro lançado (a API usa o 502 do Nest)', async () => {
    const fetch = jest.fn(async () => json({}, 500));
    const erroIndisponivel = (fonte) => Object.assign(new Error('fora'), { status: 502, fonte });
    await expect(
      cliente(fetch, { erroIndisponivel }).getJson(URL_TESTE, { fonte: 'Binance' }),
    ).rejects.toMatchObject({ status: 502, fonte: 'Binance' });
  });

  it('timeout conta como falha e é repetido', async () => {
    const fetch = jest.fn(
      (url, { signal }) =>
        new Promise((resolver, rejeitar) => {
          signal.addEventListener('abort', () => rejeitar(signal.reason));
        }),
    );
    await expect(cliente(fetch).getJson(URL_TESTE, { fonte: 'Fonte' })).rejects.toBeInstanceOf(
      FonteIndisponivel,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('corpo que não é JSON numa resposta 200 → fonte_indisponivel', async () => {
    const fetch = jest.fn(async () => new Response('<html>', { status: 200 }));
    await expect(cliente(fetch).getJson(URL_TESTE, { fonte: 'Fonte' })).rejects.toBeInstanceOf(
      FonteIndisponivel,
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

  describe('getTexto (RSS, tarefa 037)', () => {
    const xml = (texto, status = 200) =>
      new Response(texto, { status, headers: { 'content-type': 'application/rss+xml' } });

    it('devolve o corpo como texto, pedindo XML, com as mesmas tentativas', async () => {
      const respostas = [() => xml('', 503), () => xml('<rss></rss>')];
      const fetch = jest.fn(() => respostas.shift()());
      expect(await cliente(fetch).getTexto(URL_TESTE, { fonte: 'Feed' })).toEqual({
        status: 200,
        corpo: '<rss></rss>',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      const { headers } = fetch.mock.calls[0][1];
      expect(new Headers(headers).get('accept')).toMatch(/xml/);
      expect(new Headers(headers).get('user-agent')).toBe('agente-de-teste/1.0');
    });

    it('esgotadas as tentativas, FonteIndisponivel; 4xx volta ao chamador', async () => {
      await expect(
        cliente(jest.fn(async () => xml('', 500))).getTexto(URL_TESTE, { fonte: 'Feed' }),
      ).rejects.toBeInstanceOf(FonteIndisponivel);
      expect(
        await cliente(jest.fn(async () => xml('não', 404))).getTexto(URL_TESTE, { fonte: 'Feed' }),
      ).toEqual({ status: 404, corpo: 'não' });
    });
  });
});
