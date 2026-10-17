'use strict';

const { Writable } = require('node:stream');
const { criarLog } = require('../src/log');
const { CHAVE_PRECOS } = require('./apoio');

// Log dos agentes (tarefa 035): pino em JSON, sem as API keys.
describe('criarLog', () => {
  const capturar = (nivel = 'info') => {
    const linhas = [];
    const destino = new Writable({
      write(pedaco, _codificacao, pronto) {
        linhas.push(JSON.parse(pedaco.toString()));
        pronto();
      },
    });
    return { log: criarLog(nivel, destino), linhas };
  };

  it('grava JSON com o serviço e o nível configurado', () => {
    const { log, linhas } = capturar('warn');
    log.info('não aparece');
    log.warn({ agente: 'precos' }, 'aviso');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ servico: 'agentes', agente: 'precos', msg: 'aviso' });
  });

  it('oculta chaves e cabeçalho Authorization', () => {
    const { log, linhas } = capturar();
    log.info(
      { chave: CHAVE_PRECOS, headers: { authorization: `Bearer ${CHAVE_PRECOS}` } },
      'requisição',
    );
    expect(JSON.stringify(linhas)).not.toContain(CHAVE_PRECOS);
    expect(linhas[0].chave).toBe('[oculto]');
  });
});
