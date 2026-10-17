'use strict';

const { executarRodada } = require('../src/rodada');
const { lerConfiguracao } = require('../src/configuracao');
const { CHAVE_NOTICIAS, CHAVE_PRECOS, ENV, logFalso } = require('./apoio');

// Uma rodada de um agente (tarefa 035): cliente da API com a chave do agente e resumo no log.
describe('executarRodada', () => {
  const config = lerConfiguracao(ENV);

  it('usa a chave do agente, repassa as opções e registra o resumo', async () => {
    const log = logFalso();
    const criarApi = jest.fn(() => ({ api: true }));
    const criarHttp = jest.fn(() => ({ http: true }));
    const executar = jest.fn(async () => ({ ativos: 3, gravados: 15, falhas: 0 }));
    const resultado = await executarRodada(
      { nome: 'precos', executar },
      { config, log, criarApi, criarHttp, opcoes: { ativo: 'PETR4' } },
    );
    expect(criarApi).toHaveBeenCalledWith({
      url: 'http://backend:3000',
      chave: CHAVE_PRECOS,
      timeoutMs: 30000,
    });
    // Fontes externas: o User-Agent e o timeout da configuração, sem cache entre rodadas.
    expect(criarHttp).toHaveBeenCalledWith(config.fontes);
    expect(executar).toHaveBeenCalledWith(
      { api: { api: true }, http: { http: true }, log, agora: Date.now },
      { ativo: 'PETR4' },
    );
    expect(resultado).toEqual({ ok: true, resumo: { ativos: 3, gravados: 15, falhas: 0 } });
    expect(log.registros).toContainEqual(
      expect.objectContaining({
        nivel: 'info',
        mensagem: 'rodada concluída',
        dados: expect.objectContaining({
          agente: 'precos',
          gravados: 15,
          duracao_ms: expect.any(Number),
        }),
      }),
    );
  });

  it('com falhas no resumo, a rodada não fica ok', async () => {
    const criarApi = jest.fn(() => ({}));
    const resultado = await executarRodada(
      { nome: 'noticias', executar: async () => ({ falhas: 2 }) },
      { config, log: logFalso(), criarApi },
    );
    expect(criarApi.mock.calls[0][0].chave).toBe(CHAVE_NOTICIAS);
    expect(resultado.ok).toBe(false);
  });

  it('erro na rodada é registrado e não é relançado', async () => {
    const log = logFalso();
    const resultado = await executarRodada(
      {
        nome: 'precos',
        executar: async () => {
          throw new Error('API fora do ar');
        },
      },
      { config, log, criarApi: () => ({}) },
    );
    expect(resultado).toEqual({ ok: false, erro: 'API fora do ar' });
    expect(log.registros).toContainEqual(
      expect.objectContaining({
        nivel: 'error',
        mensagem: 'rodada falhou',
        dados: { agente: 'precos', erro: 'API fora do ar' },
      }),
    );
  });
});
