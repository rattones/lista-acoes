import Joi from 'joi';

// Blocos de validação comuns aos recursos do CRUD (tarefa 011).

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DATA_HORA = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const dataValida = (valor, ajudantes) =>
  Number.isNaN(Date.parse(valor.slice(0, 10))) ? ajudantes.error('any.invalid') : valor;

export const data = () =>
  Joi.string().pattern(DATA).custom(dataValida).messages({
    'string.pattern.base': '{{#label}} deve ser uma data AAAA-MM-DD',
    'any.invalid': '{{#label}} não é uma data válida',
  });

export const dataHora = () =>
  Joi.string().pattern(DATA_HORA).custom(dataValida).messages({
    'string.pattern.base': '{{#label}} deve ser data/hora ISO 8601',
    'any.invalid': '{{#label}} não é uma data válida',
  });

export const url = () =>
  Joi.string()
    .trim()
    .uri({ scheme: ['http', 'https'] });
export const texto = () => Joi.string().trim();
export const id = () => Joi.number().integer().positive();

export const esquemaParamId = Joi.object({ id: id().required() });
export const esquemaObter = Joi.object({ incluir_excluidos: Joi.boolean().default(false) });
export const esquemaExcluir = Joi.object({ permanente: Joi.boolean().default(false) });

// Query da listagem: paginação, ordenação ('campo' ou '-campo') e filtros de igualdade.
export function esquemaListagem({ ordenacao, filtros = {} }) {
  return Joi.object({
    pagina: Joi.number().integer().min(1).default(1),
    por_pagina: Joi.number().integer().min(1).max(100).default(20),
    ordenar: Joi.string()
      .valid(...ordenacao.flatMap((campo) => [campo, `-${campo}`]))
      .default('id'),
    incluir_excluidos: Joi.boolean().default(false),
    ...filtros,
  });
}

// PATCH: os mesmos campos da criação, todos opcionais, com ao menos um.
export const esquemaAtualizacao = (criacao) =>
  criacao.fork(Object.keys(criacao.describe().keys ?? {}), (campo) => campo.optional()).min(1);

export const esquemaLote = (item) =>
  Joi.object({ itens: Joi.array().items(item).min(1).max(1000).required() });
