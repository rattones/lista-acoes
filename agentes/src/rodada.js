'use strict';

const { criarClienteApi } = require('./cliente-api');

// Uma rodada de um agente (tarefa 035): cliente da API com a chave do agente, execução e resumo
// no log. Nunca relança: o agendador segue para a próxima e a CLI decide o código de saída.
async function executarRodada(agente, { config, log, criarApi = criarClienteApi, opcoes = {} }) {
  const inicio = Date.now();
  const api = criarApi({
    url: config.apiUrl,
    chave: config.chaves[agente.nome],
    timeoutMs: config.timeoutMs,
  });
  try {
    const resumo = await agente.executar({ api, log: log.child({ agente: agente.nome }) }, opcoes);
    log.info(
      { agente: agente.nome, duracao_ms: Date.now() - inicio, ...resumo },
      'rodada concluída',
    );
    return { ok: !resumo?.falhas, resumo };
  } catch (e) {
    log.error({ agente: agente.nome, erro: e.message }, 'rodada falhou');
    return { ok: false, erro: e.message };
  }
}

module.exports = { executarRodada };
