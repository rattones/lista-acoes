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
} from '@nestjs/common';
import { ValidacaoPipe } from '../validacao.pipe';
import { esquemaExcluir, esquemaObter, esquemaParamId } from './esquemas';

const validar = (esquema, valor) => new ValidacaoPipe(esquema).transform(valor);

const naoEncontrado = (id) =>
  new NotFoundException({ erro: 'nao_encontrado', mensagem: `Registro ${id} não encontrado` });

// Rotas de CRUD de um recurso (tarefa 011). Cada recurso estende esta classe com
// @Controller('<recurso>') e @Dependencies(<token do repositório>), passando os esquemas Joi
// { listagem, criacao, atualizacao }. Para tirar uma rota, sobrescreva o método sem decorator.
// incluir_excluidos e permanente ficam restritos a admin na tarefa 012 (guards).
export class ControladorCrud {
  constructor(repositorio, esquemas) {
    this.repositorio = repositorio;
    this.esquemas = esquemas;
  }

  @Get()
  listar(@Query() query) {
    return this.repositorio.listar(validar(this.esquemas.listagem, query));
  }

  @Get(':id')
  obter(@Param() params, @Query() query) {
    const { id } = validar(esquemaParamId, params);
    const { incluir_excluidos: incluirExcluidos } = validar(esquemaObter, query);
    const registro = this.repositorio.obter(id, { incluirExcluidos });
    if (!registro) throw naoEncontrado(id);
    return registro;
  }

  @Post()
  criar(@Body() corpo) {
    return this.repositorio.criar(validar(this.esquemas.criacao, corpo ?? {}));
  }

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
