'use strict';

const { iniciar } = require('../src/main');
const { ENV, logFalso } = require('./apoio');

// Processo residente dos agentes (tarefa 035): valida a configuração e agenda os horários.
describe('iniciar', () => {
  it('agenda os dois agentes e registra os horários no log', () => {
    const log = logFalso();
    const cron = { schedule: jest.fn(() => ({ stop: jest.fn() })) };
    const agendador = iniciar({ env: ENV, log, cron });
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    expect(log.registros).toContainEqual(
      expect.objectContaining({
        nivel: 'info',
        dados: {
          fuso: 'America/Sao_Paulo',
          horarios: { precos: '30 19 * * *', noticias: '0 12 * * *' },
        },
      }),
    );
    agendador.parar();
  });

  it('sem as chaves, falha com mensagem clara e não agenda nada', () => {
    const cron = { schedule: jest.fn() };
    expect(() => iniciar({ env: { API_URL: ENV.API_URL }, log: logFalso(), cron })).toThrow(
      /API_KEY_PRECOS/,
    );
    expect(cron.schedule).not.toHaveBeenCalled();
  });
});

describe('executarResidente', () => {
  const { executarResidente } = require('../src/main');

  it('com configuração válida, agenda e devolve configurado: true', () => {
    const cron = { schedule: jest.fn(() => ({ stop: jest.fn() })) };
    const residente = executarResidente({ env: ENV, log: logFalso(), cron });
    expect(residente.configurado).toBe(true);
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    residente.parar();
  });

  it('sem as chaves, não sai: registra o erro, não agenda e repete o aviso periodicamente', () => {
    jest.useFakeTimers();
    try {
      const log = logFalso();
      const cron = { schedule: jest.fn() };
      const residente = executarResidente({
        env: { API_URL: ENV.API_URL },
        log,
        cron,
        lembreteMs: 1000,
      });
      expect(residente.configurado).toBe(false);
      expect(cron.schedule).not.toHaveBeenCalled();
      const erros = () => log.registros.filter((r) => r.nivel === 'fatal' || r.nivel === 'error');
      expect(erros()).toHaveLength(1);
      expect(erros()[0].mensagem).toMatch(/API_KEY_PRECOS[\s\S]*up -d agentes/);

      jest.advanceTimersByTime(2500);
      expect(erros()).toHaveLength(3);
      residente.parar();
      jest.advanceTimersByTime(5000);
      expect(erros()).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
