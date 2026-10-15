import { Dependencies, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import nodemailer from 'nodemailer';
import { TEMPLATES } from './templates';

export const TRANSPORTE_EMAIL = Symbol('TRANSPORTE_EMAIL');

const EMAIL = /[^\s<>"'@]+@[^\s<>"'@]+/g;

// Para os logs: f***@dominio.com (o endereço completo é dado pessoal).
export const mascararEmail = (email) => {
  const [usuario, dominio] = String(email).split('@');
  return usuario && dominio ? `${usuario[0]}***@${dominio}` : '***';
};

// Erro tratável por quem chama; se não for tratado, vira 503 no formato padrão.
export class ErroEnvioEmail extends HttpException {
  constructor(mensagem, causa) {
    super({ erro: 'falha_envio_email', mensagem }, 503, { cause: causa });
    this.message = mensagem;
  }
}

// Transporte SMTP (Gmail com senha de app). Sem usuário ou senha, devolve null: e-mail desligado.
export function criarTransporte(config) {
  const user = config.get('SMTP_USER');
  const pass = config.get('SMTP_PASS');
  if (!user || !pass) return null;
  const port = Number(config.get('SMTP_PORT'));
  return nodemailer.createTransport({
    host: config.get('SMTP_HOST'),
    port,
    secure: port === 465, // 465: TLS direto; 587: STARTTLS
    auth: { user, pass },
  });
}

// Envio de e-mails com templates (tarefa 013). O log registra o template e o destinatário
// mascarado, nunca o conteúdo (os links levam tokens).
@Injectable()
@Dependencies(ConfigService, Logger, TRANSPORTE_EMAIL)
export class MailService {
  constructor(config, logger, transporte) {
    this.config = config;
    this.logger = logger;
    this.transporte = transporte;
  }

  // Link do app a partir de APP_URL. Os parâmetros vão no fragmento (#), que o navegador
  // não envia ao servidor: tokens não aparecem nos logs de acesso.
  montarLink(caminho, fragmento = {}) {
    const base = this.config.get('APP_URL').replace(/\/+$/, '');
    const parametros = new URLSearchParams(fragmento).toString();
    return `${base}${caminho}${parametros ? `#${parametros}` : ''}`;
  }

  async enviar({ para, assunto, template, dados = {} }) {
    const modelo = TEMPLATES[template];
    if (!modelo) throw new Error(`Template de e-mail desconhecido: ${template}`);
    const ausentes = modelo.obrigatorios.filter(
      (campo) => dados[campo] == null || dados[campo] === '',
    );
    if (ausentes.length) {
      throw new Error(`Template ${template}: dado obrigatório ausente: ${ausentes.join(', ')}`);
    }

    const registro = { template, para: mascararEmail(para) };
    if (!this.transporte) {
      this.logger.warn(registro, 'E-mail não enviado: SMTP não configurado (SMTP_USER/SMTP_PASS)');
      throw new ErroEnvioEmail('Envio de e-mail indisponível no momento');
    }

    try {
      const info = await this.transporte.sendMail({
        from: this.config.get('MAIL_FROM') ?? this.config.get('SMTP_USER'),
        to: para,
        subject: assunto,
        html: modelo.html(dados),
        text: modelo.texto(dados),
      });
      this.logger.log({ ...registro, id: info.messageId }, 'E-mail enviado');
      return info;
    } catch (erro) {
      this.logger.error(
        {
          ...registro,
          codigo: erro.code,
          resposta: erro.responseCode,
          erro: String(erro.message).replace(EMAIL, mascararEmail),
        },
        'Falha no envio de e-mail',
      );
      throw new ErroEnvioEmail(
        'Não foi possível enviar o e-mail. Tente novamente mais tarde.',
        erro,
      );
    }
  }
}
