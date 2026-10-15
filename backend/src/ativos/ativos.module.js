import {
  Body,
  Controller,
  Dependencies,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import Joi from 'joi';
import { EscoposCrud, Papeis } from '../auth/decorators';
import { ControladorCrud, validar } from '../comum/crud/controlador-crud';
import {
  data,
  esquemaAtualizacao,
  esquemaListagem,
  esquemaParamId,
  texto,
  url,
} from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';
import { urlGoogle } from '../wrapper/urls';
import { WrapperModule } from '../wrapper/wrapper.module';
import { WrapperService } from '../wrapper/wrapper.service';

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

const esquemaPreVisualizar = Joi.object({ url: Joi.string().trim().max(2000).required() });

// Campos que o wrapper preenche; código, status, data de inclusão e observação não mudam.
const CAMPOS_DO_WRAPPER = [
  'nome',
  'tipo',
  'bolsa',
  'ticker_google',
  'ticker_yahoo',
  'url_historico',
  'url_cotacao',
  'url_pagina',
];

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
@Dependencies(REPOSITORIO_ATIVOS, WrapperService)
export class AtivosController extends ControladorCrud {
  constructor(repositorio, wrapper) {
    super(repositorio, esquemas);
    this.wrapper = wrapper;
  }

  // Wrapper (tarefa 018): campos do ativo a partir de um link do Google/Yahoo Finance e a
  // última cotação, sem gravar. A tela de inclusão confirma e envia ao POST /ativos.
  @Papeis('admin')
  @Post('pre-visualizar')
  @HttpCode(200)
  preVisualizar(@Body() corpo) {
    return this.wrapper.preVisualizar(validar(esquemaPreVisualizar, corpo ?? {}).url);
  }

  // Refaz a busca pela página do ativo e atualiza os campos do wrapper no cadastro.
  @Papeis('admin')
  @Post(':id/atualizar-dados')
  @HttpCode(200)
  async atualizarDados(@Param() params) {
    const { id } = validar(esquemaParamId, params);
    const atual = this.repositorio.obter(id);
    if (!atual) {
      throw new NotFoundException({
        erro: 'nao_encontrado',
        mensagem: `Registro ${id} não encontrado`,
      });
    }
    const pagina =
      atual.url_pagina ??
      (atual.ticker_google && urlGoogle(atual.ticker_google)) ??
      (atual.ticker_yahoo &&
        `https://finance.yahoo.com/quote/${encodeURIComponent(atual.ticker_yahoo)}`);
    if (!pagina) {
      throw new UnprocessableEntityException({
        erro: 'entidade_invalida',
        mensagem: 'O ativo não tem url_pagina nem ticker para refazer a busca',
      });
    }
    const { ativo, cotacao } = await this.wrapper.preVisualizar(pagina);
    const dados = Object.fromEntries(CAMPOS_DO_WRAPPER.map((campo) => [campo, ativo[campo]]));
    return { ativo: this.repositorio.atualizar(id, dados), cotacao };
  }
}

@Module({
  imports: [WrapperModule],
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
