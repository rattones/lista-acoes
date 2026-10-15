import {
  BadRequestException,
  ConflictException,
  Dependencies,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CONEXAO_DB } from '../database/database.module';
import { gerarHashSenha, validarSenha, verificarSenha } from './senha';

export const ACESSO_SEGUNDOS = 15 * 60;
export const REFRESH_SEGUNDOS = 7 * 24 * 60 * 60;
const TENTATIVAS_ATE_BLOQUEIO = 5;
const MINUTOS_DE_BLOQUEIO = 15;

const credenciaisInvalidas = () =>
  new UnauthorizedException({ erro: 'nao_autenticado', mensagem: 'E-mail ou senha inválidos' });
const sessaoInvalida = () =>
  new UnauthorizedException({ erro: 'nao_autenticado', mensagem: 'Sessão inválida ou expirada' });

const senhaIncorreta = () =>
  new ForbiddenException({ erro: 'senha_incorreta', mensagem: 'Senha atual incorreta' });

const publico = ({ id, email, nome, papel }) => ({ id, email, nome, papel });

// Login, bloqueio por tentativas e sessão (tarefa 012). Os tokens levam o id e a
// versao_sessao do usuário; papel, ativo e exclusão são sempre lidos do banco.
@Injectable()
@Dependencies(CONEXAO_DB, JwtService)
export class AuthService {
  constructor(db, jwt) {
    this.db = db;
    this.jwt = jwt;
  }

  buscar(where, valor) {
    return this.db
      .prepare(
        `SELECT id, email, nome, papel, senha_hash, ativo, excluido_em, versao_sessao,
                bloqueado_ate > datetime('now','localtime') AS bloqueado
         FROM usuarios WHERE ${where} = ?`,
      )
      .get(valor);
  }

  // Hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quem existe).
  async hashFicticio() {
    this._hashFicticio ??= await gerarHashSenha('senha-ficticia-para-igualar-o-tempo');
    return this._hashFicticio;
  }

  async login(email, senha) {
    const usuario = this.buscar('email', email);
    if (!usuario) {
      await verificarSenha(await this.hashFicticio(), senha);
      throw credenciaisInvalidas();
    }
    // Durante o bloqueio a senha nem é conferida: 401 x 423 não pode servir de oráculo.
    if (usuario.bloqueado) {
      throw new HttpException(
        {
          erro: 'bloqueado',
          mensagem: 'Conta bloqueada temporariamente por excesso de tentativas. Tente mais tarde.',
        },
        423,
      );
    }
    if (!(await verificarSenha(usuario.senha_hash, senha))) {
      this.registrarFalha(usuario.id);
      throw credenciaisInvalidas();
    }
    if (!usuario.ativo || usuario.excluido_em) throw credenciaisInvalidas();

    this.db
      .prepare(
        `UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL,
                ultimo_login_em = datetime('now','localtime') WHERE id = ?`,
      )
      .run(usuario.id);
    return this.emitir(usuario);
  }

  // A 5ª falha seguida bloqueia por 15 minutos e zera o contador.
  registrarFalha(id) {
    this.db
      .prepare(
        `UPDATE usuarios SET
           bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= ${TENTATIVAS_ATE_BLOQUEIO}
             THEN datetime('now','localtime','+${MINUTOS_DE_BLOQUEIO} minutes') ELSE bloqueado_ate END,
           tentativas_falhas = CASE WHEN tentativas_falhas + 1 >= ${TENTATIVAS_ATE_BLOQUEIO}
             THEN 0 ELSE tentativas_falhas + 1 END
         WHERE id = ?`,
      )
      .run(id);
  }

  emitir(usuario) {
    const base = { sub: usuario.id, ver: usuario.versao_sessao };
    return {
      corpo: {
        token_acesso: this.jwt.sign({ ...base, tipo: 'acesso' }, { expiresIn: ACESSO_SEGUNDOS }),
        tipo: 'Bearer',
        expira_em_segundos: ACESSO_SEGUNDOS,
        usuario: publico(usuario),
      },
      refresh: this.jwt.sign({ ...base, tipo: 'refresh' }, { expiresIn: REFRESH_SEGUNDOS }),
    };
  }

  // Usuário da sessão, se o token é válido, do tipo certo e a sessão continua de pé.
  sessao(token, tipo) {
    let payload;
    try {
      payload = this.jwt.verify(token);
    } catch {
      return null;
    }
    if (payload.tipo !== tipo) return null;
    const usuario = this.buscar('id', payload.sub);
    if (
      !usuario ||
      !usuario.ativo ||
      usuario.excluido_em ||
      usuario.versao_sessao !== payload.ver
    ) {
      return null;
    }
    return usuario;
  }

  usuarioDoToken(token) {
    const usuario = this.sessao(token, 'acesso');
    return usuario ? publico(usuario) : null;
  }

  renovar(refresh) {
    const usuario = refresh ? this.sessao(refresh, 'refresh') : null;
    if (!usuario) throw sessaoInvalida();
    return this.emitir(usuario);
  }

  // Encerra todas as sessões do usuário (os tokens já emitidos deixam de valer).
  sair(id) {
    this.db.prepare('UPDATE usuarios SET versao_sessao = versao_sessao + 1 WHERE id = ?').run(id);
  }

  // Perfil e exclusão de conta (tarefa 017): ações sobre a própria conta pedem a senha atual.
  async confirmarSenha(id, senha) {
    const usuario = this.buscar('id', id);
    if (!usuario || !(await verificarSenha(usuario.senha_hash, senha))) throw senhaIncorreta();
    return usuario;
  }

  // Muda o nome e/ou a senha (o e-mail nunca muda). Trocar a senha encerra todas as sessões
  // e devolve uma sessão nova; sem troca, devolve só { usuario }.
  async atualizarPerfil(id, { nome, senha_atual: senhaAtual, nova_senha: novaSenha }) {
    if (novaSenha !== undefined) {
      try {
        validarSenha(novaSenha);
      } catch (erro) {
        throw new BadRequestException({
          erro: 'requisicao_invalida',
          mensagem: erro.message,
          detalhes: [{ campo: 'nova_senha', mensagem: erro.message }],
        });
      }
    }
    if (senhaAtual !== undefined) await this.confirmarSenha(id, senhaAtual);

    const atribuicoes = ["atualizado_em = datetime('now','localtime')"];
    const valores = { id };
    if (nome !== undefined) {
      atribuicoes.push('nome = @nome');
      valores.nome = nome;
    }
    if (novaSenha !== undefined) {
      atribuicoes.push('senha_hash = @senhaHash', 'versao_sessao = versao_sessao + 1');
      valores.senhaHash = await gerarHashSenha(novaSenha);
    }
    this.db.prepare(`UPDATE usuarios SET ${atribuicoes.join(', ')} WHERE id = @id`).run(valores);

    const usuario = this.buscar('id', id);
    return novaSenha !== undefined
      ? this.emitir(usuario)
      : { corpo: { usuario: publico(usuario) } };
  }

  // Apaga o usuário de vez; as FKs ON DELETE CASCADE levam o que ele criou (agentes_tokens).
  // O último admin ativo não pode se excluir: o sistema ficaria sem administração.
  async excluirConta(id, senha) {
    const usuario = await this.confirmarSenha(id, senha);
    this.db.transaction(() => {
      const outrosAdmins = this.db
        .prepare(
          `SELECT COUNT(*) FROM usuarios
           WHERE papel = 'admin' AND ativo = 1 AND excluido_em IS NULL AND id <> ?`,
        )
        .pluck()
        .get(id);
      if (usuario.papel === 'admin' && outrosAdmins === 0) {
        throw new ConflictException({
          erro: 'ultimo_admin',
          mensagem:
            'Você é o último administrador ativo: promova outro admin antes de excluir a conta.',
        });
      }
      this.db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    })();
  }
}
