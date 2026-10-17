'use strict';

const { parseArgs } = require('node:util');
const { AGENTES } = require('./agentes');
const { lerConfiguracao } = require('./configuracao');
const { criarLog } = require('./log');
const { executarRodada } = require('./rodada');

// CLI dos agentes (tarefa 035): uma rodada sob demanda.
//   node src/cli.js coletar-precos [--historico] [--ativo PETR4]
//   node src/cli.js coletar-noticias [--ativo PETR4]
// Saída: 0 = rodada sem falhas; 1 = falha ou configuração inválida; 2 = uso incorreto.

const USO = [
  'Uso: node src/cli.js <comando> [opções]',
  '',
  'Comandos:',
  '  coletar-precos [--historico] [--ativo CODIGO]   cotações diárias (Yahoo/Binance)',
  '  coletar-noticias [--ativo CODIGO]               notícias (RSS)',
].join('\n');

async function principal(
  argv,
  { env = process.env, log, rodar = executarRodada, escrever = console.log } = {},
) {
  const agente = AGENTES.find((a) => a.comando === argv[0]);
  let opcoes;
  try {
    if (!agente) throw new Error('comando desconhecido');
    opcoes = parseArgs({ args: argv.slice(1), options: agente.opcoes, strict: true }).values;
  } catch {
    escrever(USO);
    return 2;
  }

  let config;
  try {
    config = lerConfiguracao(env);
  } catch (e) {
    (log ?? criarLog()).error(e.message);
    return 1;
  }
  const { ok } = await rodar(agente, {
    config,
    log: log ?? criarLog(config.nivelLog),
    opcoes: { ...opcoes },
  });
  return ok ? 0 : 1;
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((codigo) => {
    process.exitCode = codigo;
  });
}

module.exports = { principal, USO };
