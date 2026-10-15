import { BadRequestException, Dependencies, GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { CONEXAO_DB } from '../database/database.module';
import { ErroEnvioEmail, MailService } from '../mail/mail.service';
import { gerarHashSenha, validarSenha } from './senha';
import { assinarToken, assinaturaValida, derivarChave, lerPayload } from './token-assinado';

const FINALIDADE = 'recuperacao-senha';
export const VALIDADE_SEGUNDOS = 24 * 60 * 60;

const tokenInvalido = () =>
  new BadRequestException({
    erro: 'token_invalido',
    mensagem: 'Link inválido ou já utilizado. Peça um novo.',
  });
const tokenExpirado = () =>
  new GoneException({ erro: 'token_expirado', mensagem: 'Link expirado. Peça um novo.' });

// Recuperação de senha por link sem estado (tarefa 014). O token leva id, e-mail e validade,
// assinado com uma chave derivada do JWT_SEGREDO e do senha_hash atual: trocar a senha
// invalida todos os links já enviados.
@Injectable()
@Dependencies(CONEXAO_DB, ConfigService, MailService, Logger)
export class RecuperacaoSenhaService {
  constructor(db, config, mail, logger) {
    this.db = db;
    this.config = config;
    this.mail = mail;
    this.logger = logger;
  }

  chave(usuario) {
    return derivarChave(this.config.get('JWT_SEGREDO'), FINALIDADE, usuario.senha_hash);
  }

  gerarToken(usuario, { validadeSegundos = VALIDADE_SEGUNDOS } = {}) {
    const exp = Math.floor(Date.now() / 1000) + validadeSegundos;
    return assinarToken(
      { fin: FINALIDADE, id: usuario.id, email: usuario.email, exp },
      this.chave(usuario),
    );
  }

  // Envia o link se o e-mail é de um usuário ativo. Não espera o envio: o tempo de resposta
  // não pode revelar se o e-mail existe. Falhas ficam no log (MailService).
  solicitar(email) {
    const usuario = this.db
      .prepare(
        'SELECT id, email, nome, senha_hash FROM usuarios WHERE email = ? AND ativo = 1 AND excluido_em IS NULL',
      )
      .get(email);
    if (!usuario) return;

    this.mail
      .enviar({
        para: usuario.email,
        assunto: 'Redefinição de senha — Lista de Ações',
        template: 'recuperacao-senha',
        dados: {
          nome: usuario.nome,
          link: this.mail.montarLink('/redefinir-senha', { t: this.gerarToken(usuario) }),
        },
      })
      .catch((erro) => {
        if (!(erro instanceof ErroEnvioEmail)) {
          this.logger.error(
            { err: erro },
            'Erro inesperado ao enviar o link de recuperação de senha',
          );
        }
      });
  }

  // Usuário dono de um token válido; 400 se inválido/adulterado/já usado, 410 se expirado.
  validar(token) {
    const payload = lerPayload(token);
    if (payload?.fin !== FINALIDADE || !Number.isInteger(payload.id)) throw tokenInvalido();

    const usuario = this.db
      .prepare('SELECT id, email, nome, senha_hash, ativo, excluido_em FROM usuarios WHERE id = ?')
      .get(payload.id);
    if (!usuario || !usuario.ativo || usuario.excluido_em) throw tokenInvalido();
    if (String(payload.email).toLowerCase() !== usuario.email.toLowerCase()) throw tokenInvalido();
    if (!assinaturaValida(token, this.chave(usuario))) throw tokenInvalido();
    if (!(payload.exp > Date.now() / 1000)) throw tokenExpirado();
    return usuario;
  }

  // Grava a nova senha, zera o bloqueio e encerra as sessões abertas.
  async redefinir(token, senha) {
    const usuario = this.validar(token);
    try {
      validarSenha(senha);
    } catch (erro) {
      throw new BadRequestException({
        erro: 'requisicao_invalida',
        mensagem: erro.message,
        detalhes: [{ campo: 'senha', mensagem: erro.message }],
      });
    }
    const novoHash = await gerarHashSenha(senha);
    // Confere o hash antigo de novo: dois pedidos simultâneos com o mesmo token não passam.
    const { changes } = this.db
      .prepare(
        `UPDATE usuarios SET senha_hash = ?, tentativas_falhas = 0, bloqueado_ate = NULL,
                versao_sessao = versao_sessao + 1, atualizado_em = datetime('now','localtime')
         WHERE id = ? AND senha_hash = ?`,
      )
      .run(novoHash, usuario.id, usuario.senha_hash);
    if (changes === 0) throw tokenInvalido();
  }
}
