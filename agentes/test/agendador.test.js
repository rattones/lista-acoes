'use strict';

const { iniciarAgendador } = require('../src/agendador');
const { lerConfiguracao } = require('../src/configuracao');
const { ENV, logFalso } = require('./apoio');

// Agendador dos agentes (tarefa 035): um horário por agente, no fuso configurado.
describe('iniciarAgendador', () => {
  const AGENTES = [
    { nome: 'precos', comando: 'coletar-precos' },
    { nome: 'noticias', comando: 'coletar-noticias' },
  ];

  const cronFalso = () => {
    const agendadas = [];
    return {
      agendadas,
      schedule: jest.fn((expressao, tarefa, opcoes) => {
        const registro = { expressao, tarefa, opcoes, stop: jest.fn() };
        agendadas.push(registro);
        return registro;
      }),
    };
  };

  it('registra os horários de cada agente no fuso configurado', () => {
    const cron = cronFalso();
    const config = lerConfiguracao({ ...ENV, TZ: 'America/Sao_Paulo' });
    const agendador = iniciarAgendador({
      config,
      agentes: AGENTES,
      cron,
      log: logFalso(),
      rodar: jest.fn(),
    });
    expect(cron.agendadas.map((a) => [a.expressao, a.opcoes])).toEqual([
      ['30 19 * * *', { timezone: 'America/Sao_Paulo', name: 'precos' }],
      ['0 12 * * *', { timezone: 'America/Sao_Paulo', name: 'noticias' }],
    ]);
    expect(agendador.horarios).toEqual({ precos: '30 19 * * *', noticias: '0 12 * * *' });

    agendador.parar();
    for (const a of cron.agendadas) expect(a.stop).toHaveBeenCalled();
  });

  it('cada horário dispara a rodada do seu agente', async () => {
    const cron = cronFalso();
    const rodar = jest.fn(async () => ({ ok: true }));
    iniciarAgendador({
      config: lerConfiguracao(ENV),
      agentes: AGENTES,
      cron,
      log: logFalso(),
      rodar,
    });
    await cron.agendadas[1].tarefa();
    expect(rodar).toHaveBeenCalledWith(AGENTES[1]);
  });

  it('rodada sobreposta do mesmo agente é pulada com aviso; outro agente roda', async () => {
    const cron = cronFalso();
    const log = logFalso();
    let terminar;
    const rodar = jest.fn(
      (agente) =>
        new Promise((resolver) => {
          if (agente.nome === 'precos') terminar = resolver;
          else resolver();
        }),
    );
    iniciarAgendador({ config: lerConfiguracao(ENV), agentes: AGENTES, cron, log, rodar });
    const [precos, noticias] = cron.agendadas;

    const primeira = precos.tarefa();
    await precos.tarefa();
    await noticias.tarefa();
    expect(rodar).toHaveBeenCalledTimes(2);
    expect(log.registros).toContainEqual(
      expect.objectContaining({ nivel: 'warn', dados: { agente: 'precos' } }),
    );

    terminar();
    await primeira;
    const terceira = precos.tarefa();
    terminar();
    await terceira;
    expect(rodar).toHaveBeenCalledTimes(3);
  });

  it('erro inesperado na rodada não derruba o agendador', async () => {
    const cron = cronFalso();
    const log = logFalso();
    const rodar = jest.fn(async () => {
      throw new Error('quebrou');
    });
    iniciarAgendador({ config: lerConfiguracao(ENV), agentes: AGENTES, cron, log, rodar });
    await expect(cron.agendadas[0].tarefa()).resolves.toBeUndefined();
    expect(log.registros).toContainEqual(expect.objectContaining({ nivel: 'error' }));
    await cron.agendadas[0].tarefa();
    expect(rodar).toHaveBeenCalledTimes(2);
  });
});
