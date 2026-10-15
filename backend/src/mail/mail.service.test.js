import nodemailer from 'nodemailer';
import { criarTransporte, ErroEnvioEmail, MailService, mascararEmail } from './mail.service';

// Serviço de e-mail (tarefa 013), com transporte falso: jsonTransport devolve a mensagem montada.
describe('MailService', () => {
  const configuracao = {
    APP_URL: 'http://app.teste:8080',
    MAIL_FROM: 'Lista de Ações <lista@teste.com>',
  };
  const config = { get: (chave) => configuracao[chave] };
  let logger;

  const servico = (transporte = nodemailer.createTransport({ jsonTransport: true })) =>
    new MailService(config, logger, transporte);
  const mensagem = (info) => JSON.parse(info.message);

  beforeEach(() => {
    logger = { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  it('renderiza o template de recuperação de senha e envia ao destinatário', async () => {
    const link = 'http://app.teste:8080/redefinir-senha#t=abc.def';
    const info = await servico().enviar({
      para: 'fulano@teste.com',
      assunto: 'Redefinição de senha',
      template: 'recuperacao-senha',
      dados: { nome: 'Fulano', link },
    });

    const msg = mensagem(info);
    expect(msg.to).toEqual([{ address: 'fulano@teste.com', name: '' }]);
    expect(msg.from).toEqual({ address: 'lista@teste.com', name: 'Lista de Ações' });
    expect(msg.subject).toBe('Redefinição de senha');
    expect(msg.html).toContain('Fulano');
    expect(msg.html).toContain(`href="${link}"`);
    expect(msg.html).toContain('24 horas');
    expect(msg.text).toContain(link);
    expect(msg.text).toContain('24 horas');
  });

  it('renderiza o template de convite com o papel e a validade de 72 horas', async () => {
    const info = await servico().enviar({
      para: 'convidado@teste.com',
      assunto: 'Convite',
      template: 'convite',
      dados: {
        link: 'http://app.teste:8080/cadastro#t=xyz',
        papel: 'leitor',
        convidadoPor: 'Admin',
      },
    });
    const msg = mensagem(info);
    for (const corpo of [msg.html, msg.text]) {
      expect(corpo).toContain('http://app.teste:8080/cadastro#t=xyz');
      expect(corpo).toContain('72 horas');
      expect(corpo).toContain('Admin');
      expect(corpo).toMatch(/leitor/i);
    }
  });

  it('escapa o HTML dos dados', async () => {
    const info = await servico().enviar({
      para: 'fulano@teste.com',
      assunto: 'x',
      template: 'recuperacao-senha',
      dados: { nome: '<script>alert(1)</script>', link: 'http://app.teste:8080/r#t="x"' },
    });
    const { html } = mensagem(info);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="http://app.teste:8080/r#t=&quot;x&quot;"');
  });

  it('registra o envio no log sem o conteúdo nem o destinatário completo', async () => {
    await servico().enviar({
      para: 'fulano@teste.com',
      assunto: 'x',
      template: 'recuperacao-senha',
      dados: { nome: 'Fulano', link: 'http://app.teste:8080/r#t=segredo' },
    });
    const registrado = JSON.stringify(logger.log.mock.calls);
    expect(registrado).toContain('recuperacao-senha');
    expect(registrado).toContain('f***@teste.com');
    expect(registrado).not.toMatch(/fulano@|segredo/);
  });

  it('template inexistente ou dados obrigatórios ausentes são erro de programação', async () => {
    await expect(
      servico().enviar({ para: 'a@teste.com', assunto: 'x', template: 'nao-existe', dados: {} }),
    ).rejects.toThrow(/Template de e-mail desconhecido: nao-existe/);
    await expect(
      servico().enviar({
        para: 'a@teste.com',
        assunto: 'x',
        template: 'convite',
        dados: { papel: 'admin' },
      }),
    ).rejects.toThrow(/link/);
  });

  it('falha do transporte gera ErroEnvioEmail (503) e log de erro', async () => {
    const transporte = {
      sendMail: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' })),
    };
    const envio = servico(transporte).enviar({
      para: 'fulano@teste.com',
      assunto: 'x',
      template: 'recuperacao-senha',
      dados: { nome: 'Fulano', link: 'http://app.teste:8080/r#t=segredo' },
    });

    await expect(envio).rejects.toBeInstanceOf(ErroEnvioEmail);
    await expect(envio).rejects.toMatchObject({ status: 503 });
    const erro = await envio.catch((e) => e);
    expect(erro.getResponse()).toEqual({ erro: 'falha_envio_email', mensagem: expect.any(String) });
    expect(erro.message).toBe(erro.getResponse().mensagem);

    expect(logger.error).toHaveBeenCalled();
    const registrado = JSON.stringify(logger.error.mock.calls);
    expect(registrado).toContain('EAUTH');
    expect(registrado).not.toMatch(/fulano@|segredo/);
  });

  it('sem SMTP configurado (transporte nulo), não envia: ErroEnvioEmail e aviso no log', async () => {
    await expect(
      servico(null).enviar({
        para: 'fulano@teste.com',
        assunto: 'x',
        template: 'recuperacao-senha',
        dados: { nome: 'Fulano', link: 'http://x' },
      }),
    ).rejects.toBeInstanceOf(ErroEnvioEmail);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('montarLink usa APP_URL e leva os parâmetros no fragmento (não vão ao servidor)', () => {
    expect(servico().montarLink('/redefinir-senha', { t: 'a.b+c/d' })).toBe(
      'http://app.teste:8080/redefinir-senha#t=a.b%2Bc%2Fd',
    );
    expect(servico().montarLink('/cadastro')).toBe('http://app.teste:8080/cadastro');
    configuracao.APP_URL = 'https://app.listadecompras.net/';
    expect(servico().montarLink('/x', { t: '1' })).toBe('https://app.listadecompras.net/x#t=1');
    configuracao.APP_URL = 'http://app.teste:8080';
  });
});

describe('mascararEmail', () => {
  it('mostra só a primeira letra do usuário e o domínio', () => {
    expect(mascararEmail('fulano@teste.com')).toBe('f***@teste.com');
    expect(mascararEmail('a@b.com')).toBe('a***@b.com');
    expect(mascararEmail('invalido')).toBe('***');
  });
});

describe('criarTransporte', () => {
  const comConfig = (valores) => ({ get: (chave) => valores[chave] });

  it('sem usuário ou senha SMTP, devolve null (e-mail desligado)', () => {
    expect(criarTransporte(comConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465 }))).toBeNull();
  });

  it('porta 465 usa TLS direto; 587 usa STARTTLS', () => {
    const base = {
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'u@gmail.com',
      SMTP_PASS: 'senha-de-app',
    };
    const tls = criarTransporte(comConfig({ ...base, SMTP_PORT: 465 }));
    expect(tls.options).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'u@gmail.com' },
    });
    expect(criarTransporte(comConfig({ ...base, SMTP_PORT: 587 })).options.secure).toBe(false);
  });
});
