import { Controller, Dependencies, Module, UnprocessableEntityException } from '@nestjs/common';
import Joi from 'joi';
import { EscoposCrud } from '../auth/decorators';
import { ControladorCrud } from '../comum/crud/controlador-crud';
import { data, esquemaAtualizacao, esquemaListagem, id, texto } from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_SINAIS = Symbol('REPOSITORIO_SINAIS');

const NOTICIAS = ['positivo', 'misto_pos', 'misto', 'misto_neg', 'negativo'];
const GRAFICO = ['alta', 'lateral', 'recuperacao', 'baixa'];
const INDICADORES = [
  'ret_5d',
  'ret_1m',
  'ret_3m',
  'ret_6m',
  'ret_1a',
  'mm20',
  'mm50',
  'mm200',
  'dist_mm20',
  'dist_mm50',
  'dist_mm200',
  'rsi14',
  'macd',
  'macd_sinal',
  'macd_hist',
  'bollinger_pctb',
  'max_52s',
  'min_52s',
  'dist_max_52s',
  'dist_min_52s',
  'volume_5d_50d',
];

// O código do ativo (sinais.ativo) não vem no payload: é copiado de ativos pelo ativo_id.
const criacao = Joi.object({
  execucao_id: id().required(),
  ativo_id: id().required(),
  ticker_yahoo: texto().required(),
  bolsa: texto().allow(null),
  tipo: texto().allow(null),
  referencia: texto().allow(null),
  data_preco: data().required(),
  moeda: texto().allow(null),
  fechamento: Joi.number().allow(null),
  noticias: Joi.string()
    .valid(...NOTICIAS)
    .required(),
  grafico: Joi.string()
    .valid(...GRAFICO)
    .required(),
  pontos_noticias: Joi.number().required(),
  pontos_grafico: Joi.number().required(),
  pontos_extremos: Joi.number().required(),
  soma: Joi.number().required(),
  nota: Joi.number().integer().min(1).max(5).required(),
  concordam: Joi.boolean().required(),
  tendencia: texto().allow(null),
  proximo_evento: texto().allow(null),
  proximo_evento_data: data().allow(null),
  destaque: texto().allow(null),
  mm50_subindo: Joi.boolean().allow(null),
  mm200_subindo: Joi.boolean().allow(null),
  ...Object.fromEntries(INDICADORES.map((campo) => [campo, Joi.number().allow(null)])),
});

const esquemas = {
  criacao,
  atualizacao: esquemaAtualizacao(criacao),
  listagem: esquemaListagem({
    ordenacao: ['id', 'execucao_id', 'ativo', 'data_preco', 'nota'],
    filtros: {
      execucao_id: id(),
      ativo_id: id(),
      ativo: texto(),
      data_preco: data(),
      nota: Joi.number().integer().min(1).max(5),
    },
  }),
};

function preencherCodigoAtivo(dados, db) {
  if (dados.ativo_id === undefined) return dados;
  const ativo = db.prepare('SELECT ativo FROM ativos WHERE id = ?').pluck().get(dados.ativo_id);
  if (!ativo) {
    throw new UnprocessableEntityException({
      erro: 'entidade_invalida',
      mensagem: `Ativo ${dados.ativo_id} não existe`,
    });
  }
  return { ...dados, ativo };
}

@EscoposCrud({ leitura: 'sinais:read', escrita: 'sinais:write' })
@Controller('sinais')
@Dependencies(REPOSITORIO_SINAIS)
export class SinaisController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }
}

@Module({
  controllers: [SinaisController],
  providers: [
    {
      provide: REPOSITORIO_SINAIS,
      inject: [CONEXAO_DB],
      useFactory: (db) => new Repositorio(db, { tabela: 'sinais', preparar: preencherCodigoAtivo }),
    },
  ],
})
export class SinaisModule {}
