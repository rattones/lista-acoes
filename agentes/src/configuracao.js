'use strict';

const Joi = require('joi');
const cron = require('node-cron');

// Configuração dos agentes (tarefa 035), lida do ambiente (agentes/.env no compose). As
// mensagens de erro citam a variável, nunca o valor (as chaves são segredos).

class ErroConfiguracao extends Error {
  constructor(problemas) {
    super(`Configuração dos agentes inválida (veja agentes/.env-example): ${problemas.join('; ')}`);
    this.name = 'ErroConfiguracao';
  }
}

const CHAVE = /^la_[0-9a-f]{8}_[0-9a-f]{32}$/;

// Feeds RSS gerais de mercado (tarefa 037): notícias sem ativo. FEEDS_GERAIS troca a lista.
const FEEDS_GERAIS = [
  'InfoMoney|https://www.infomoney.com.br/feed/',
  'Valor Econômico|https://pox.globo.com/rss/valor/',
  'Money Times|https://www.moneytimes.com.br/feed/',
  'CNBC|https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'MarketWatch|https://feeds.content.dowjones.io/public/rss/mw_topstories',
].join(';');

// "Nome|url;Nome|url" → [{ nome, url }]; "nenhum" = sem feeds gerais.
const lerFeeds = (texto) =>
  texto.trim().toLowerCase() === 'nenhum'
    ? []
    : texto
        .split(';')
        .map((par) => par.trim())
        .filter(Boolean)
        .map((par) => {
          const [nome, url] = par.split('|').map((parte) => parte?.trim());
          return { nome, url };
        });
const feedsValidos = (valor, ajudantes) => {
  const feeds = lerFeeds(valor);
  const valida = (url) => {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  };
  return feeds.every((f) => f.nome && valida(f.url)) ? feeds : ajudantes.error('any.invalid');
};
const NIVEIS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

const fusoValido = (valor, ajudantes) => {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: valor });
    return valor;
  } catch {
    return ajudantes.error('any.invalid');
  }
};
const horarioValido = (valor, ajudantes) =>
  cron.validate(valor) ? valor : ajudantes.error('any.invalid');

const chave = () =>
  Joi.string().pattern(CHAVE).required().messages({
    'any.required': '{{#label}} ausente: gere a API key no app (API keys) e informe aqui',
    'string.empty': '{{#label}} ausente: gere a API key no app (API keys) e informe aqui',
    'string.pattern.base': '{{#label}} fora do formato la_<prefixo>_<segredo>',
  });

const esquema = Joi.object({
  API_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'any.required': '{{#label}} ausente (ex.: http://backend:3000)',
      'string.uri': '{{#label}} deve ser uma URL http(s)',
    }),
  API_KEY_PRECOS: chave(),
  API_KEY_NOTICIAS: chave(),
  TZ: Joi.string()
    .default('America/Sao_Paulo')
    .custom(fusoValido)
    .messages({ 'any.invalid': '{{#label}} não é um fuso horário conhecido' }),
  LOG_LEVEL: Joi.string()
    .valid(...NIVEIS)
    .default('info'),
  API_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
  FONTES_USER_AGENT: Joi.string().default(
    'Mozilla/5.0 (compatible; lista-acoes-agentes/1.0; +https://www.listadecompras.net)',
  ),
  FONTES_TIMEOUT_MS: Joi.number().integer().min(1000).default(15000),
  FEEDS_GERAIS: Joi.string()
    .default(FEEDS_GERAIS)
    .custom(feedsValidos)
    .messages({ 'any.invalid': '{{#label}} deve ser Nome|url;Nome|url (http/https) ou nenhum' }),
  CRON_PRECOS: Joi.string()
    .default('30 19 * * *')
    .custom(horarioValido)
    .messages({ 'any.invalid': '{{#label}} não é uma expressão cron válida' }),
  CRON_NOTICIAS: Joi.string()
    .default('0 12 * * *')
    .custom(horarioValido)
    .messages({ 'any.invalid': '{{#label}} não é uma expressão cron válida' }),
}).unknown(true);

function lerConfiguracao(env = process.env) {
  const definidas = Object.fromEntries(
    Object.entries(env).filter(([, valor]) => valor !== undefined && valor !== ''),
  );
  const { error, value } = esquema.validate(definidas, {
    abortEarly: false,
    errors: { wrap: { label: false } },
  });
  if (error) throw new ErroConfiguracao(error.details.map((d) => d.message));
  return {
    apiUrl: value.API_URL.replace(/\/+$/, ''),
    chaves: { precos: value.API_KEY_PRECOS, noticias: value.API_KEY_NOTICIAS },
    fuso: value.TZ,
    nivelLog: value.LOG_LEVEL,
    timeoutMs: value.API_TIMEOUT_MS,
    cron: { precos: value.CRON_PRECOS, noticias: value.CRON_NOTICIAS },
    fontes: { userAgent: value.FONTES_USER_AGENT, timeoutMs: value.FONTES_TIMEOUT_MS },
    // O Joi não passa o padrão pelo custom: a lista padrão chega como texto.
    feedsGerais: Array.isArray(value.FEEDS_GERAIS)
      ? value.FEEDS_GERAIS
      : lerFeeds(value.FEEDS_GERAIS),
  };
}

module.exports = { ErroConfiguracao, lerConfiguracao };
