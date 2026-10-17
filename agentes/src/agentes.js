'use strict';

const { coletarNoticias } = require('./noticias');
const { coletarPrecos } = require('./precos');

// Agentes coletores (tarefa 035). nome: chave em config.chaves e config.cron; comando: CLI;
// opcoes: as opções aceitas pelo comando (formato do util.parseArgs).
const AGENTES = [
  {
    nome: 'precos',
    comando: 'coletar-precos',
    descricao: 'cotações diárias dos ativos ativos (Yahoo/Binance)',
    opcoes: { ativo: { type: 'string' }, historico: { type: 'boolean' } },
    executar: coletarPrecos,
  },
  {
    nome: 'noticias',
    comando: 'coletar-noticias',
    descricao: 'notícias dos ativos ativos e gerais (RSS)',
    opcoes: { ativo: { type: 'string' } },
    executar: coletarNoticias,
  },
];

module.exports = { AGENTES };
