import {
  Body,
  ConflictException,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Papeis } from '../../auth/decorators';
import { proibido } from '../../auth/guards';
import { ValidacaoPipe } from '../validacao.pipe';
import { esquemaExcluir, esquemaObter, esquemaParamId } from './esquemas';

const validar = (esquema, valor) => new ValidacaoPipe(esquema).transform(valor);

const exigirAdminParaExcluidos = (req, incluirExcluidos) => {
  if (incluirExcluidos && req.usuario?.papel !== 'admin') throw proibido();
};

const naoEncontrado = (id) =>
  new NotFoundException({ erro: 'nao_encontrado', mensagem: `Registro ${id} não encontrado` });

// Rotas de CRUD de um recurso (tarefa 011). Cada recurso estende esta classe com
// @Controller('<recurso>') e @Dependencies(<token do repositório>), passando os esquemas Joi
// { listagem, criacao, atualizacao }. Para tirar uma rota, sobrescreva o método sem decorator.
// Permissões (tarefa 012): leitura para qualquer usuário autenticado; escrita, exclusão,
// restauração e incluir_excluidos só para admin.
export class ControladorCrud {
  constructor(repositorio, esquemas) {
    this.repositorio = repositorio;
    this.esquemas = esquemas;
  }

  @Get()
  listar(@Query() query, @Req() req) {
    const filtros = validar(this.esquemas.listagem, query);
    exigirAdminParaExcluidos(req, filtros.incluir_excluidos);
    return this.repositorio.listar(filtros);
  }

  @Get(':id')
  obter(@Param() params, @Query() query, @Req() req) {
    const { id } = validar(esquemaParamId, params);
    const { incluir_excluidos: incluirExcluidos } = validar(esquemaObter, query);
    exigirAdminParaExcluidos(req, incluirExcluidos);
    const registro = this.repositorio.obter(id, { incluirExcluidos });
    if (!registro) throw naoEncontrado(id);
    return registro;
  }

  @Papeis('admin')
  @Post()
  criar(@Body() corpo) {
    return this.repositorio.criar(validar(this.esquemas.criacao, corpo ?? {}));
  }

  @Papeis('admin')
  @Patch(':id')
  atualizar(@Param() params, @Body() corpo) {
    const { id } = validar(esquemaParamId, params);
    const registro = this.repositorio.atualizar(
      id,
      validar(this.esquemas.atualizacao, corpo ?? {}),
    );
    if (!registro) throw naoEncontrado(id);
    return registro;
  }

  // Exclusão lógica; com ?permanente=true, física (inclusive de registro já excluído).
  @Papeis('admin')
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param() params, @Query() query) {
    const { id } = validar(esquemaParamId, params);
    const { permanente } = validar(esquemaExcluir, query);
    const excluido = permanente
      ? this.repositorio.excluirFisico(id)
      : this.repositorio.excluirLogico(id);
    if (!excluido) throw naoEncontrado(id);
  }

  @Papeis('admin')
  @Post(':id/restaurar')
  @HttpCode(200)
  restaurar(@Param() params) {
    const { id } = validar(esquemaParamId, params);
    const registro = this.repositorio.restaurar(id);
    if (registro) return registro;
    if (!this.repositorio.obter(id, { incluirExcluidos: true })) throw naoEncontrado(id);
    throw new ConflictException({ erro: 'conflito', mensagem: `Registro ${id} não está excluído` });
  }
}

// Validação de corpo para rotas extras dos recursos (ex.: lotes).
export { validar };
