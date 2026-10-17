import {
  Body,
  Controller,
  Dependencies,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import Joi from 'joi';
import { Escopos, EscoposCrud, Papeis } from '../auth/decorators';
import { ControladorCrud, validar } from '../comum/crud/controlador-crud';
import {
  data,
  esquemaAtualizacao,
  esquemaListagem,
  esquemaParamId,
  id,
  texto,
} from '../comum/crud/esquemas';
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

// Notícias que pesaram na nota (tarefa 040): até 50 por sinal.
const esquemaNoticiasDoSinal = Joi.object({
  noticia_ids: Joi.array().items(id()).max(50).required(),
});

const SQL_NOTICIAS_DO_SINAL = `
  SELECT n.id, n.ativo_id, n.titulo, n.resumo, n.fonte, n.url, n.publicada_em, n.sentimento
  FROM sinais_noticias sn
  JOIN noticias n ON n.id = sn.noticia_id
  WHERE sn.sinal_id = ? AND n.excluido_em IS NULL
  ORDER BY COALESCE(n.publicada_em, n.coletada_em) DESC, n.id DESC`;

@EscoposCrud({ leitura: 'sinais:read', escrita: 'sinais:write' })
@Controller('sinais')
@Dependencies(REPOSITORIO_SINAIS)
export class SinaisController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }

  get db() {
    return this.repositorio.db;
  }

  sinalAtivo(params) {
    const { id: sinalId } = validar(esquemaParamId, params);
    if (!this.repositorio.obter(sinalId)) {
      throw new NotFoundException({
        erro: 'nao_encontrado',
        mensagem: `Registro ${sinalId} não encontrado`,
      });
    }
    return sinalId;
  }

  @Escopos('sinais:read')
  @Get(':id/noticias')
  noticias(@Param() params) {
    return this.db.prepare(SQL_NOTICIAS_DO_SINAL).all(this.sinalAtivo(params));
  }

  // Substitui a lista do sinal (idempotente). Notícia inexistente ou excluída → 422, sem mudar
  // nada. Escrita do agente de decisão (sinais:write) ou do admin.
  @Papeis('admin')
  @Escopos('sinais:write')
  @Post(':id/noticias')
  @HttpCode(200)
  gravarNoticias(@Param() params, @Body() corpo) {
    const sinalId = this.sinalAtivo(params);
    const ids = [...new Set(validar(esquemaNoticiasDoSinal, corpo ?? {}).noticia_ids)];
    const existentes = ids.length
      ? this.db
          .prepare(
            `SELECT id FROM noticias WHERE excluido_em IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
          )
          .pluck()
          .all(...ids)
      : [];
    const faltam = ids.filter((n) => !existentes.includes(n));
    if (faltam.length) {
      throw new UnprocessableEntityException({
        erro: 'entidade_invalida',
        mensagem: `Notícia(s) inexistente(s) ou excluída(s): ${faltam.join(', ')}`,
      });
    }
    const ligar = this.db.prepare(
      'INSERT INTO sinais_noticias (sinal_id, noticia_id) VALUES (?, ?)',
    );
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM sinais_noticias WHERE sinal_id = ?').run(sinalId);
      for (const noticiaId of ids) ligar.run(sinalId, noticiaId);
    })();
    return this.db.prepare(SQL_NOTICIAS_DO_SINAL).all(sinalId);
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
