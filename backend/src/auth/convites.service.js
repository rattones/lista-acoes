import {
  BadRequestException,
  ConflictException,
  Dependencies,
  GoneException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONEXAO_DB } from '../database/database.module';
import { MailService } from '../mail/mail.service';
import { gerarHashSenha, validarSenha } from './senha';
import { assinarToken, assinaturaValida, derivarChave, lerPayload } from './token-assinado';

const FINALIDADE = 'convite';
export const VALIDADE_SEGUNDOS = 72 * 60 * 60;
const PAPEIS = ['admin', 'leitor'];

const tokenInvalido = () =>
  new BadRequestException({
    erro: 'token_invalido',
    mensagem: 'Convite inválido. Peça um novo a quem convidou.',
  });
const tokenExpirado = () =>
  new GoneException({
    erro: 'token_expirado',
    mensagem: 'Convite expirado. Peça um novo a quem convidou.',
  });
const emailCadastrado = () =>
  new ConflictException({
    erro: 'conflito',
    mensagem: 'E-mail já cadastrado',
    detalhes: [{ campo: 'email', mensagem: 'valor já cadastrado' }],
  });
const invalido = (campo, mensagem) =>
  new BadRequestException({
    erro: 'requisicao_invalida',
    mensagem,
    detalhes: [{ campo, mensagem }],
  });

const expiraEm = (exp) => new Date(exp * 1000).toISOString();

// Convites por link sem estado (tarefa 015). O token leva e-mail, papel, quem convidou (por)
// e validade de 72 h, assinado com uma chave derivada do JWT_SEGREDO só para convites.
// Não há cancelamento: o convite deixa de valer quando expira, quando o e-mail é cadastrado
// ou quando quem convidou deixa de ser um admin ativo.
@Injectable()
@Dependencies(CONEXAO_DB, ConfigService, MailService)
export class ConvitesService {
  constructor(db, config, mail) {
    this.db = db;
    this.config = config;
    this.mail = mail;
  }

  chave() {
    return derivarChave(this.config.get('JWT_SEGREDO'), FINALIDADE);
  }

  emailExiste(email) {
    return Boolean(this.db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email));
  }

  gerarToken({ email, papel, por }, { validadeSegundos = VALIDADE_SEGUNDOS } = {}) {
    const exp = Math.floor(Date.now() / 1000) + validadeSegundos;
    return assinarToken({ fin: FINALIDADE, email, papel, por, exp }, this.chave());
  }

  // Envia o convite; falha no envio vira ErroEnvioEmail (503) para o admin saber.
  async convidar(admin, { email, papel }) {
    if (this.emailExiste(email)) throw emailCadastrado();
    const token = this.gerarToken({ email, papel, por: admin.id });
    await this.mail.enviar({
      para: email,
      assunto: 'Convite para o Lista de Ações',
      template: 'convite',
      dados: {
        link: this.mail.montarLink('/cadastro', { c: token }),
        papel,
        convidadoPor: admin.nome,
      },
    });
    return { email, papel, expira_em: expiraEm(lerPayload(token).exp) };
  }

  // Dados do convite; 400 se inválido/adulterado, 410 se expirado, 409 se o e-mail já existe.
  validar(token) {
    const payload = lerPayload(token);
    if (
      payload?.fin !== FINALIDADE ||
      typeof payload.email !== 'string' ||
      !PAPEIS.includes(payload.papel) ||
      !Number.isInteger(payload.por) ||
      !assinaturaValida(token, this.chave())
    ) {
      throw tokenInvalido();
    }
    const quemConvidou = this.db
      .prepare(
        "SELECT 1 FROM usuarios WHERE id = ? AND papel = 'admin' AND ativo = 1 AND excluido_em IS NULL",
      )
      .get(payload.por);
    if (!quemConvidou) throw tokenInvalido();
    if (!(payload.exp > Date.now() / 1000)) throw tokenExpirado();
    if (this.emailExiste(payload.email)) throw emailCadastrado();
    return { email: payload.email, papel: payload.papel, expira_em: expiraEm(payload.exp) };
  }

  // Cria o usuário com o e-mail e o papel do convite (o e-mail só é confirmado, nunca alterado).
  async aceitar({ token, nome, senha, email_confirmado: emailConfirmado }) {
    const { email, papel } = this.validar(token);
    if (emailConfirmado.toLowerCase() !== email.toLowerCase()) {
      throw invalido('email_confirmado', 'O e-mail confirmado não é o do convite');
    }
    try {
      validarSenha(senha);
    } catch (erro) {
      throw invalido('senha', erro.message);
    }
    const senhaHash = await gerarHashSenha(senha);
    // Dois aceites simultâneos: o UNIQUE do e-mail barra o segundo (409 pelo filtro de erros).
    return this.db
      .prepare(
        'INSERT INTO usuarios (email, nome, senha_hash, papel) VALUES (?, ?, ?, ?) RETURNING id, email, nome, papel',
      )
      .get(email, nome, senhaHash, papel);
  }
}
