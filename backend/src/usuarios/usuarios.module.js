import { Controller, Dependencies, Module } from '@nestjs/common';
import Joi from 'joi';
import { Papeis } from '../auth/decorators';
import { ControladorCrud } from '../comum/crud/controlador-crud';
import { esquemaListagem, texto } from '../comum/crud/esquemas';
import { Repositorio } from '../comum/crud/repositorio';
import { CONEXAO_DB } from '../database/database.module';

export const REPOSITORIO_USUARIOS = Symbol('REPOSITORIO_USUARIOS');

const PAPEIS = ['admin', 'leitor'];

// E-mail e senha não mudam por aqui: e-mail é imutável e a senha tem fluxo próprio (012/014/017).
const atualizacao = Joi.object({
  nome: texto().min(1),
  papel: Joi.string().valid(...PAPEIS),
  ativo: Joi.boolean(),
}).min(1);

const esquemas = {
  atualizacao,
  listagem: esquemaListagem({
    ordenacao: ['id', 'nome', 'email', 'papel', 'criado_em', 'ultimo_login_em'],
    filtros: { email: texto(), papel: Joi.string().valid(...PAPEIS), ativo: Joi.boolean() },
  }),
};

// Usuários sem rota de criação (só por convite, tarefa 015) e sem senha_hash nas respostas.
// Só admin gerencia usuários, inclusive a leitura (tarefa 012).
@Papeis('admin')
@Controller('usuarios')
@Dependencies(REPOSITORIO_USUARIOS)
export class UsuariosController extends ControladorCrud {
  constructor(repositorio) {
    super(repositorio, esquemas);
  }

  // Sobrescrito sem decorator: remove a rota POST /usuarios herdada.
  criar() {}
}

@Module({
  controllers: [UsuariosController],
  providers: [
    {
      provide: REPOSITORIO_USUARIOS,
      inject: [CONEXAO_DB],
      useFactory: (db) =>
        new Repositorio(db, { tabela: 'usuarios', ocultas: ['senha_hash', 'versao_sessao'] }),
    },
  ],
})
export class UsuariosModule {}
