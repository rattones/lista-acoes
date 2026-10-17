'use strict';

const nodeCron = require('node-cron');
const { AGENTES } = require('./agentes');
const { iniciarAgendador } = require('./agendador');
const { ErroConfiguracao, lerConfiguracao } = require('./configuracao');
const { criarLog } = require('./log');
const { executarRodada } = require('./rodada');

// Processo residente dos agentes (tarefa 035), serviço "agentes" do compose: valida a
// configuração e agenda as rodadas.
function iniciar({ env = process.env, log, cron = nodeCron } = {}) {
  const config = lerConfiguracao(env);
  const registro = log ?? criarLog(config.nivelLog);
  const agendador = iniciarAgendador({
    config,
    agentes: AGENTES,
    cron,
    log: registro,
    rodar: (agente) => executarRodada(agente, { config, log: registro }),
  });
  registro.info({ fuso: config.fuso, horarios: agendador.horarios }, 'agentes agendados');
  return agendador;
}

const SEIS_HORAS = 6 * 60 * 60 * 1000;

// Configuração inválida (ex.: chaves ainda não geradas) não derruba o container: o
// `up -d --wait` do deploy, do rollback e do certificado seguiria falhando. O erro vai para o
// log e se repete a cada lembreteMs, sem nada agendado, até o agentes/.env ser corrigido.
function executarResidente({
  env = process.env,
  log,
  cron = nodeCron,
  lembreteMs = SEIS_HORAS,
} = {}) {
  try {
    const agendador = iniciar({ env, log, cron });
    return { configurado: true, parar: agendador.parar };
  } catch (e) {
    if (!(e instanceof ErroConfiguracao)) throw e;
    const registro = log ?? criarLog();
    const avisar = () =>
      registro.fatal(
        `${e.message}. Nenhuma coleta será feita; corrija o agentes/.env e recrie o serviço ` +
          '(docker compose -f infra/docker-compose.<dev|prod>.yml up -d agentes).',
      );
    avisar();
    const lembrete = setInterval(avisar, lembreteMs);
    return { configurado: false, parar: () => clearInterval(lembrete) };
  }
}

if (require.main === module) {
  const residente = executarResidente();
  for (const sinal of ['SIGTERM', 'SIGINT']) {
    process.on(sinal, () => {
      residente.parar();
      process.exit(0);
    });
  }
}

module.exports = { executarResidente, iniciar };
