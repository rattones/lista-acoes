'use strict';

const { ErroConfiguracao, lerConfiguracao } = require('../src/configuracao');
const { CHAVE_NOTICIAS, CHAVE_PRECOS, ENV } = require('./apoio');

// Configuração dos agentes (tarefa 035), lida do ambiente (agentes/.env no compose).
describe('lerConfiguracao', () => {
  it('lê a URL da API, as chaves e os padrões de fuso, log e horários', () => {
    expect(lerConfiguracao(ENV)).toEqual({
      apiUrl: 'http://backend:3000',
      chaves: { precos: CHAVE_PRECOS, noticias: CHAVE_NOTICIAS },
      fuso: 'America/Sao_Paulo',
      nivelLog: 'info',
      timeoutMs: 30000,
      cron: { precos: '30 19 * * *', noticias: '0 12 * * *' },
    });
  });

  it('aceita horários, fuso e nível de log do ambiente', () => {
    const config = lerConfiguracao({
      ...ENV,
      API_URL: 'http://backend:3000/',
      TZ: 'UTC',
      LOG_LEVEL: 'debug',
      CRON_PRECOS: '0 20 * * 1-5',
      CRON_NOTICIAS: '*/30 * * * *',
    });
    expect(config).toMatchObject({
      apiUrl: 'http://backend:3000',
      fuso: 'UTC',
      nivelLog: 'debug',
      cron: { precos: '0 20 * * 1-5', noticias: '*/30 * * * *' },
    });
  });

  it('sem API_URL ou sem chave: erro que cita as variáveis', () => {
    const erro = (env) => {
      try {
        lerConfiguracao(env);
      } catch (e) {
        return e;
      }
      throw new Error('deveria ter falhado');
    };
    const semUrl = erro({ ...ENV, API_URL: undefined });
    expect(semUrl).toBeInstanceOf(ErroConfiguracao);
    expect(semUrl.message).toContain('API_URL');

    const semChaves = erro({ API_URL: ENV.API_URL });
    expect(semChaves.message).toContain('API_KEY_PRECOS');
    expect(semChaves.message).toContain('API_KEY_NOTICIAS');
    expect(semChaves.message).toMatch(/agentes\/\.env/);
  });

  it('chave fora do formato la_<prefixo>_<segredo>: erro sem mostrar o valor', () => {
    const valor = 'la_curta_segredo-que-nao-pode-aparecer';
    expect(() => lerConfiguracao({ ...ENV, API_KEY_PRECOS: valor })).toThrow(/API_KEY_PRECOS/);
    try {
      lerConfiguracao({ ...ENV, API_KEY_PRECOS: valor });
    } catch (e) {
      expect(e.message).not.toContain(valor);
    }
  });

  it('recusa horários, fuso, URL e nível de log inválidos', () => {
    for (const [variavel, valor] of [
      ['CRON_PRECOS', 'todo dia'],
      ['CRON_NOTICIAS', '61 25 * * *'],
      ['TZ', 'Marte/Olympus'],
      ['API_URL', 'backend:3000'],
      ['LOG_LEVEL', 'barulhento'],
    ]) {
      expect(() => lerConfiguracao({ ...ENV, [variavel]: valor })).toThrow(variavel);
    }
  });
});
