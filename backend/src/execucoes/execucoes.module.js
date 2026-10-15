import { Controller, Dependencies, Module } from '@nestjs/common';
import Joi from 'joi';
import { EscoposCrud } from '../auth/decorators';
import { ControladorCrud } from '../comum/crud/controlador-crud';
import { data, esquemaAtualizacao, esquemaListagem, url } from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_EXECUCOES = Symbol('REPOSITORIO_EXECUCOES');

const FONTES = ['google_finance', 'lista_salva'];

const criacao = Joi.object({
  data_execucao: data().required(),
  fonte_lista: Joi.string()
    .valid(...FONTES)
    .required(),
  lista_lida_em: data().allow(null),
  relatorio_url: url().allow(null),
});

const esquemas = {
  criacao,
  atualizacao: esquemaAtualizacao(criacao),
  listagem: esquemaListagem({
    ordenacao: ['id', 'data_execucao', 'criado_em'],
    filtros: { data_execucao: data(), fonte_lista: Joi.string().valid(...FONTES) },
  }),
};

@EscoposCrud({ leitura: 'execucoes:read', escrita: 'execucoes:write' })
@Controller('execucoes')
@Dependencies(REPOSITORIO_EXECUCOES)
export class ExecucoesController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }
}

@Module({
  controllers: [ExecucoesController],
  providers: [
    {
      provide: REPOSITORIO_EXECUCOES,
      inject: [CONEXAO_DB],
      useFactory: (db) => new Repositorio(db, { tabela: 'execucoes' }),
    },
  ],
})
export class ExecucoesModule {}
