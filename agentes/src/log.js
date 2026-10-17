'use strict';

const pino = require('pino');

// Log dos agentes (tarefa 035): pino em JSON no stdout, como a API. As API keys ficam ocultas
// mesmo se algum objeto registrado as trouxer.
const criarLog = (nivel = 'info', destino = undefined) =>
  pino(
    {
      level: nivel,
      base: { servico: 'agentes' },
      redact: {
        paths: ['chave', '*.chave', 'chaves', 'authorization', 'headers.authorization'],
        censor: '[oculto]',
      },
    },
    destino,
  );

module.exports = { criarLog };
