'use strict';

const { principal } = require('../src/cli');
const { AGENTES } = require('../src/agentes');
const { ENV, logFalso } = require('./apoio');

// CLI dos agentes (tarefa 035): uma rodada sob demanda, com código de saída.
describe('CLI dos agentes', () => {
  const rodar = (resultado = { ok: true }) => jest.fn(async () => resultado);
  const executar = (argv, extra = {}) => {
    const saida = [];
    const deps = {
      env: ENV,
      log: logFalso(),
      rodar: rodar(),
      escrever: (t) => saida.push(t),
      ...extra,
    };
    return principal(argv, deps).then((codigo) => ({ codigo, saida: saida.join('\n'), ...deps }));
  };

  it('há um comando por agente: coletar-precos e coletar-noticias', () => {
    expect(AGENTES.map((a) => [a.nome, a.comando])).toEqual([
      ['precos', 'coletar-precos'],
      ['noticias', 'coletar-noticias'],
    ]);
  });

  it('coletar-precos roda o agente com as opções e termina com 0', async () => {
    const r = await executar(['coletar-precos', '--historico', '--ativo', 'PETR4']);
    expect(r.codigo).toBe(0);
    const [agente, contexto] = r.rodar.mock.calls[0];
    expect(agente.nome).toBe('precos');
    expect(contexto.opcoes).toEqual({ historico: true, ativo: 'PETR4' });
    expect(contexto.config.apiUrl).toBe('http://backend:3000');
  });

  it('coletar-noticias aceita --ativo, mas não --historico', async () => {
    expect((await executar(['coletar-noticias', '--ativo', 'TSLA'])).codigo).toBe(0);
    const r = await executar(['coletar-noticias', '--historico']);
    expect(r.codigo).toBe(2);
    expect(r.saida).toMatch(/Uso/);
  });

  it('rodada com falha termina com 1', async () => {
    expect((await executar(['coletar-precos'], { rodar: rodar({ ok: false }) })).codigo).toBe(1);
  });

  it('sem comando, comando desconhecido ou opção inválida: uso e código 2', async () => {
    for (const argv of [
      [],
      ['coletar-tudo'],
      ['coletar-precos', '--x'],
      ['coletar-precos', 'PETR4'],
    ]) {
      const r = await executar(argv);
      expect(r.codigo).toBe(2);
      expect(r.saida).toContain('coletar-precos');
      expect(r.rodar).not.toHaveBeenCalled();
    }
  });

  it('configuração inválida: erro no log e código 1, sem rodar', async () => {
    const r = await executar(['coletar-precos'], { env: { API_URL: ENV.API_URL } });
    expect(r.codigo).toBe(1);
    expect(r.rodar).not.toHaveBeenCalled();
    expect(r.log.registros).toContainEqual(
      expect.objectContaining({
        nivel: 'error',
        mensagem: expect.stringContaining('API_KEY_PRECOS'),
      }),
    );
  });
});

describe('agente ainda sem coleta (037)', () => {
  it.each(AGENTES.filter((a) => a.nome === 'noticias').map((a) => [a.nome, a]))(
    '%s avisa que ainda não coleta',
    async (_nome, agente) => {
      const log = logFalso();
      expect(await agente.executar({ api: {}, log }, {})).toEqual({
        ativos: 0,
        gravados: 0,
        falhas: 0,
      });
      expect(log.registros).toContainEqual(
        expect.objectContaining({
          nivel: 'warn',
          mensagem: expect.stringMatching(/ainda não implementad/),
        }),
      );
    },
  );
});
