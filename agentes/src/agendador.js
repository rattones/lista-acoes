'use strict';

const nodeCron = require('node-cron');

// Agendador dos agentes (tarefa 035): um horário por agente (config.cron[nome]) no fuso
// configurado. Uma rodada não começa enquanto a anterior do mesmo agente ainda está rodando.
function iniciarAgendador({ config, agentes, log, rodar, cron = nodeCron }) {
  const emAndamento = new Set();

  const tarefaDo = (agente) => async () => {
    if (emAndamento.has(agente.nome)) {
      log.warn({ agente: agente.nome }, 'rodada anterior ainda em andamento; esta foi pulada');
      return;
    }
    emAndamento.add(agente.nome);
    try {
      await rodar(agente);
    } catch (e) {
      log.error({ agente: agente.nome, erro: e.message }, 'erro inesperado na rodada');
    } finally {
      emAndamento.delete(agente.nome);
    }
  };

  const tarefas = agentes.map((agente) =>
    cron.schedule(config.cron[agente.nome], tarefaDo(agente), {
      timezone: config.fuso,
      name: agente.nome,
    }),
  );

  return {
    horarios: Object.fromEntries(agentes.map((a) => [a.nome, config.cron[a.nome]])),
    parar: () => tarefas.forEach((tarefa) => tarefa.stop()),
  };
}

module.exports = { iniciarAgendador };
