import { Body, Controller, Dependencies, HttpCode, Module, Post } from '@nestjs/common';
import Joi from 'joi';
import { Escopos, EscoposCrud, Papeis } from '../auth/decorators';
import { ControladorCrud, validar } from '../comum/crud/controlador-crud';
import {
  data,
  esquemaAtualizacao,
  esquemaListagem,
  esquemaLote,
  id,
  texto,
} from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_PRECOS = Symbol('REPOSITORIO_PRECOS');

const valor = () => Joi.number().min(0).allow(null);

const criacao = Joi.object({
  ativo_id: id().required(),
  data: data().required(),
  abertura: valor(),
  maxima: valor(),
  minima: valor(),
  fechamento: valor(),
  volume: valor(),
  moeda: texto().allow(null),
  fonte: texto().allow(null),
});

const esquemas = {
  criacao,
  atualizacao: esquemaAtualizacao(criacao),
  lote: esquemaLote(criacao),
  listagem: esquemaListagem({
    ordenacao: ['id', 'ativo_id', 'data', 'fechamento'],
    filtros: { ativo_id: id(), data: data(), fonte: texto() },
  }),
};

// Cotações diárias (tabela precos_diarios). POST /lote: upsert por (ativo_id, data), para o agente.
// Um preço fictício do DEV (fonte 'seed', tarefa 032) é substituído inteiro (tarefa 033).
@EscoposCrud({ leitura: 'precos:read', escrita: 'precos:write' })
@Controller('precos')
@Dependencies(REPOSITORIO_PRECOS)
export class PrecosController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }

  @Papeis('admin')
  @Escopos('precos:write')
  @Post('lote')
  @HttpCode(200)
  lote(@Body() corpo) {
    const { itens } = validar(esquemas.lote, corpo ?? {});
    return this.repositorio.upsertLote(itens, ['ativo_id', 'data'], {
      substituir: "fonte = 'seed'",
    });
  }
}

@Module({
  controllers: [PrecosController],
  providers: [
    {
      provide: REPOSITORIO_PRECOS,
      inject: [CONEXAO_DB],
      useFactory: (db) => new Repositorio(db, { tabela: 'precos_diarios' }),
    },
  ],
})
export class PrecosModule {}
