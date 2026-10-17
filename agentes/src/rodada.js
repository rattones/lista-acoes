'use strict';

const { ClienteHttp } = require('@lista-acoes/comum/cliente-http');
const { criarClienteApi } = require('./cliente-api');

// Fontes externas (Yahoo, Binance, RSS): sem cache, já que cada rodada pede dados novos.
const criarClienteFontes = ({ userAgent, timeoutMs }) =>
  new ClienteHttp({ userAgent, timeoutMs, cacheSegundos: 0 });

// Uma rodada de um agente (tarefa 035): cliente da API com a chave do agente, cliente das
// fontes externas, execução e resumo no log. Nunca relança: o agendador segue para a próxima e
// a CLI decide o código de saída.
async function executarRodada(
  agente,
  { config, log, criarApi = criarClienteApi, criarHttp = criarClienteFontes, opcoes = {} },
) {
  const inicio = Date.now();
  const api = criarApi({
    url: config.apiUrl,
    chave: config.chaves[agente.nome],
    timeoutMs: config.timeoutMs,
  });
  try {
    const contexto = {
      api,
      http: criarHttp(config.fontes),
      log: log.child({ agente: agente.nome }),
      agora: Date.now,
      fuso: config.fuso,
      feedsGerais: config.feedsGerais,
    };
    const resumo = await agente.executar(contexto, opcoes);
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
