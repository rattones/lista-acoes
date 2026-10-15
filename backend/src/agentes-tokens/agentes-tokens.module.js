import {
  Body,
  Controller,
  Dependencies,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import Joi from 'joi';
import {
  AgentesTokensService,
  apresentarToken,
  ESCOPOS_AGENTES,
} from '../auth/agentes-tokens.service';
import { AuthModule } from '../auth/auth.module';
import { Papeis } from '../auth/decorators';
import { ControladorCrud, validar } from '../comum/crud/controlador-crud';
import { esquemaListagem, esquemaParamId, id, texto } from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_AGENTES_TOKENS = Symbol('REPOSITORIO_AGENTES_TOKENS');

const criacao = Joi.object({
  nome: texto().min(1).max(100).required(),
  escopos: Joi.array()
    .items(Joi.string().valid(...ESCOPOS_AGENTES))
    .min(1)
    .unique()
    .required(),
});

const esquemas = {
  criacao,
  listagem: esquemaListagem({
    ordenacao: ['id', 'nome', 'criado_em', 'ultimo_uso_em', 'revogado_em'],
    filtros: { nome: texto(), criado_por: id() },
  }),
};

// API keys dos agentes (tarefa 016), só para admin. O segredo sai uma única vez, na criação;
// token_hash nunca sai da API. Sem PATCH: para mudar nome ou escopos, crie outra chave e
// revogue a antiga. Exclusão lógica/física e restauração vêm do CRUD.
@Papeis('admin')
@Controller('agentes-tokens')
@Dependencies(REPOSITORIO_AGENTES_TOKENS, AgentesTokensService)
export class AgentesTokensController extends ControladorCrud {
  constructor(repositorio, agentesTokens) {
    super(repositorio, esquemas);
    this.agentesTokens = agentesTokens;
  }

  @Get('escopos')
  escopos() {
    return ESCOPOS_AGENTES;
  }

  @Post()
  criar(@Body() corpo, @Req() req) {
    return this.agentesTokens.gerar(validar(esquemas.criacao, corpo ?? {}), req.usuario.id);
  }

  @Post(':id/revogar')
  @HttpCode(200)
  revogar(@Param() params) {
    return this.agentesTokens.revogar(validar(esquemaParamId, params).id);
  }

  // Sobrescrito sem decorator: remove a rota PATCH herdada.
  atualizar() {}
}

@Module({
  imports: [AuthModule],
  controllers: [AgentesTokensController],
  providers: [
    {
      provide: REPOSITORIO_AGENTES_TOKENS,
      inject: [CONEXAO_DB],
      useFactory: (db) =>
        new Repositorio(db, {
          tabela: 'agentes_tokens',
          ocultas: ['token_hash'],
          apresentar: apresentarToken,
        }),
    },
  ],
})
export class AgentesTokensModule {}
