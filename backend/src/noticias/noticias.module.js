import { Body, Controller, Dependencies, HttpCode, Module, Post } from '@nestjs/common';
import Joi from 'joi';
import { Escopos, EscoposCrud, Papeis } from '../auth/decorators';
import { ControladorCrud, validar } from '../comum/crud/controlador-crud';
import {
  dataHora,
  esquemaAtualizacao,
  esquemaListagem,
  esquemaLote,
  id,
  texto,
  url,
} from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_NOTICIAS = Symbol('REPOSITORIO_NOTICIAS');

const SENTIMENTOS = ['positivo', 'neutro', 'negativo'];

const criacao = Joi.object({
  ativo_id: id().allow(null),
  titulo: texto().required(),
  resumo: texto().allow(null, ''),
  fonte: texto().allow(null),
  url: url().required(),
  publicada_em: dataHora().allow(null),
  sentimento: Joi.string()
    .valid(...SENTIMENTOS)
    .allow(null),
});

const esquemas = {
  criacao,
  atualizacao: esquemaAtualizacao(criacao),
  lote: esquemaLote(criacao),
  listagem: esquemaListagem({
    ordenacao: ['id', 'publicada_em', 'coletada_em'],
    filtros: { ativo_id: id(), fonte: texto(), sentimento: Joi.string().valid(...SENTIMENTOS) },
  }),
};

// POST /lote: upsert pela URL, para o agente coletor de notícias.
@EscoposCrud({ leitura: 'noticias:read', escrita: 'noticias:write' })
@Controller('noticias')
@Dependencies(REPOSITORIO_NOTICIAS)
export class NoticiasController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }

  @Papeis('admin')
  @Escopos('noticias:write')
  @Post('lote')
  @HttpCode(200)
  lote(@Body() corpo) {
    const { itens } = validar(esquemas.lote, corpo ?? {});
    return this.repositorio.upsertLote(itens, ['url']);
  }
}

@Module({
  controllers: [NoticiasController],
  providers: [
    {
      provide: REPOSITORIO_NOTICIAS,
      inject: [CONEXAO_DB],
      useFactory: (db) => new Repositorio(db, { tabela: 'noticias' }),
    },
  ],
})
export class NoticiasModule {}
