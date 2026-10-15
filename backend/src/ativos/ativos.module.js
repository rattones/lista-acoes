import { Controller, Dependencies, Module } from '@nestjs/common';
import Joi from 'joi';
import { EscoposCrud } from '../auth/decorators';
import { ControladorCrud } from '../comum/crud/controlador-crud';
import { data, esquemaAtualizacao, esquemaListagem, texto, url } from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_ATIVOS = Symbol('REPOSITORIO_ATIVOS');

const TIPOS = ['acao', 'etf', 'moeda', 'cripto', 'stablecoin', 'indice'];
const STATUS = ['ativo', 'inativo'];

const criacao = Joi.object({
  ativo: texto().max(30).required(),
  nome: texto().allow(null),
  tipo: Joi.string()
    .valid(...TIPOS)
    .required(),
  bolsa: texto().allow(null),
  ticker_google: texto().allow(null),
  ticker_yahoo: texto().allow(null),
  url_historico: url().required(),
  url_cotacao: url().allow(null),
  url_pagina: url().allow(null),
  status: Joi.string().valid(...STATUS),
  adicionado_em: data(),
  observacao: texto().allow(null, ''),
});

const esquemas = {
  criacao,
  atualizacao: esquemaAtualizacao(criacao),
  listagem: esquemaListagem({
    ordenacao: ['id', 'ativo', 'nome', 'tipo', 'status', 'adicionado_em'],
    filtros: {
      ativo: texto(),
      tipo: Joi.string().valid(...TIPOS),
      status: Joi.string().valid(...STATUS),
      bolsa: texto(),
    },
  }),
};

@EscoposCrud({ leitura: 'ativos:read' })
@Controller('ativos')
@Dependencies(REPOSITORIO_ATIVOS)
export class AtivosController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }
}

@Module({
  controllers: [AtivosController],
  providers: [
    {
      provide: REPOSITORIO_ATIVOS,
      inject: [CONEXAO_DB],
      useFactory: (db) => new Repositorio(db, { tabela: 'ativos' }),
    },
  ],
})
export class AtivosModule {}
