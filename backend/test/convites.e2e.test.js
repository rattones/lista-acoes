import request from 'supertest';
import { ConvitesService } from '../src/auth/convites.service';
import { RecuperacaoSenhaService } from '../src/auth/recuperacao-senha.service';
import { MailService } from '../src/mail/mail.service';
import { ADMIN, criarAppTeste, idUsuario } from './utils/app-teste';

const CONVIDADO = 'convidado@teste.com';
const SENHA_NOVA = 'senha-do-convidado-123';

// Convites por link assinado, sem estado no banco (tarefa 015).
describe('convites', () => {
  let ctx;
  let enviados;
  let transporte;

  const publico = (url, corpo) => request(ctx.servidor).post(url).send(corpo);
  const convidar = (corpo, token) => ctx.http(token).post('/v1/convites').send(corpo);
  const validar = (token) => publico('/v1/convites/validar', { token });
  const aceitar = (token, extra = {}) =>
    publico('/v1/convites/aceitar', {
      token,
      nome: 'Convidado da Silva',
      senha: SENHA_NOVA,
      email_confirmado: CONVIDADO,
      ...extra,
    });
  const tokenDoEmail = (mensagem) => decodeURIComponent(/#c=([^\s"&<]+)/.exec(mensagem.text)[1]);
  const convidarEPegarToken = async (papel = 'leitor', email = CONVIDADO) => {
    const res = await convidar({ email, papel });
    expect(res.status).toBe(201);
    return tokenDoEmail(enviados.at(-1));
  };
  const payload = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  const comPayload = (token, mudancas) =>
    `${Buffer.from(JSON.stringify({ ...payload(token), ...mudancas })).toString('base64url')}.${token.split('.')[1]}`;

  beforeEach(async () => {
    ctx = await criarAppTeste();
    enviados = [];
    transporte = {
      sendMail: jest.fn(async (mensagem) => {
        enviados.push(mensagem);
        return { messageId: `<${enviados.length}@teste>` };
      }),
    };
    ctx.app.get(MailService).transporte = transporte;
  });
  afterEach(() => ctx.app.close());

  describe('POST /v1/convites (admin)', () => {
    it('envia o convite com o link no fragmento e devolve 201 com e-mail, papel e validade', async () => {
      const res = await convidar({ email: 'Convidado@Teste.com', papel: 'admin' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ email: CONVIDADO, papel: 'admin', expira_em: expect.any(String) });

      expect(enviados).toHaveLength(1);
      const [mensagem] = enviados;
      expect(mensagem.to).toBe(CONVIDADO);
      expect(mensagem.text).toMatch(/^http:\/\/app\.teste\/cadastro#c=[\w.%-]+$/m);
      expect(mensagem.text).toContain('Admin convidou você');
      expect(mensagem.text).toMatch(/administrador/);
      expect(mensagem.text).toContain('72 horas');
    });

    it('o convite vale por 72 horas', async () => {
      const res = await convidar({ email: CONVIDADO, papel: 'leitor' });
      const horas = (Date.parse(res.body.expira_em) - Date.now()) / 3_600_000;
      expect(horas).toBeGreaterThan(71.99);
      expect(horas).toBeLessThanOrEqual(72);
      expect(payload(tokenDoEmail(enviados[0])).exp * 1000).toBe(Date.parse(res.body.expira_em));
    });

    it('leitor recebe 403 e sem token 401; nada é enviado', async () => {
      expect(
        (await convidar({ email: CONVIDADO, papel: 'leitor' }, ctx.tokens.leitor)).status,
      ).toBe(403);
      expect((await convidar({ email: CONVIDADO, papel: 'leitor' }, null)).status).toBe(401);
      expect(enviados).toHaveLength(0);
    });

    it('e-mail já cadastrado (sem diferenciar maiúsculas) → 409', async () => {
      const res = await convidar({ email: 'LEITOR@teste.com', papel: 'leitor' });
      expect(res.status).toBe(409);
      expect(res.body.erro).toBe('conflito');
      expect(enviados).toHaveLength(0);
    });

    it('payload inválido (e-mail, papel) → 400', async () => {
      const res = await convidar({ email: 'nao-e-email', papel: 'dono' });
      expect(res.status).toBe(400);
      expect(res.body.detalhes.map((d) => d.campo)).toEqual(
        expect.arrayContaining(['email', 'papel']),
      );
    });

    it('falha no envio do e-mail → 503 falha_envio_email', async () => {
      transporte.sendMail.mockRejectedValueOnce(
        Object.assign(new Error('falhou'), { code: 'ECONNECTION' }),
      );
      const res = await convidar({ email: CONVIDADO, papel: 'leitor' });
      expect(res.status).toBe(503);
      expect(res.body.erro).toBe('falha_envio_email');
    });

    it('reenviar gera um novo link e o anterior continua valendo (limitação aceita)', async () => {
      const primeiro = await convidarEPegarToken();
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const segundo = await convidarEPegarToken();
      expect(segundo).not.toBe(primeiro);
      expect((await validar(primeiro)).status).toBe(200);
      expect((await validar(segundo)).status).toBe(200);
    });
  });

  describe('POST /v1/convites/validar (público)', () => {
    it('token válido → 200 com e-mail, papel e validade', async () => {
      const token = await convidarEPegarToken('admin');
      const res = await validar(token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: CONVIDADO, papel: 'admin', expira_em: expect.any(String) });
    });

    it('token adulterado (trocar o papel para admin) → 400', async () => {
      const token = await convidarEPegarToken('leitor');
      const res = await validar(comPayload(token, { papel: 'admin' }));
      expect(res.status).toBe(400);
      expect(res.body.erro).toBe('token_invalido');
    });

    it('assinatura adulterada, lixo ou token de outra finalidade → 400', async () => {
      const token = await convidarEPegarToken();
      const [p, assinatura] = token.split('.');
      const recuperacao = ctx.app
        .get(RecuperacaoSenhaService)
        .gerarToken(ctx.db.prepare('SELECT * FROM usuarios WHERE email = ?').get(ADMIN));
      for (const invalido of [
        `${p}.${assinatura[0] === 'A' ? 'B' : 'A'}${assinatura.slice(1)}`,
        'lixo',
        recuperacao,
      ]) {
        expect((await validar(invalido)).status).toBe(400);
      }
    });

    it('token expirado → 410', async () => {
      const expirado = ctx.app
        .get(ConvitesService)
        .gerarToken(
          { email: CONVIDADO, papel: 'leitor', por: idUsuario(ctx.db, ADMIN) },
          { validadeSegundos: -1 },
        );
      const res = await validar(expirado);
      expect(res.status).toBe(410);
      expect(res.body.erro).toBe('token_expirado');
    });

    it('convite para e-mail cadastrado depois → 409', async () => {
      const token = await convidarEPegarToken();
      ctx.db
        .prepare("INSERT INTO usuarios (email, nome, senha_hash) VALUES (?, 'Outro', 'x')")
        .run(CONVIDADO);
      expect((await validar(token)).status).toBe(409);
    });

    it('convite de quem deixou de ser admin, foi desativado ou excluído → 400', async () => {
      const token = await convidarEPegarToken();
      for (const mudanca of [
        "UPDATE usuarios SET papel = 'leitor' WHERE email = ?",
        "UPDATE usuarios SET papel = 'admin', ativo = 0 WHERE email = ?",
        "UPDATE usuarios SET ativo = 1, excluido_em = datetime('now') WHERE email = ?",
      ]) {
        ctx.db.prepare(mudanca).run(ADMIN);
        expect((await validar(token)).status).toBe(400);
      }
    });

    it('rate limit por IP nas rotas públicas: mais de 20 em 15 minutos → 429', async () => {
      const respostas = [];
      for (let i = 0; i < 21; i += 1) respostas.push((await validar('lixo')).status);
      expect(respostas.slice(0, 20).every((s) => s === 400)).toBe(true);
      expect(respostas[20]).toBe(429);
    });
  });

  describe('POST /v1/convites/aceitar (público)', () => {
    it('cria o usuário com o papel do convite, e ele consegue fazer login', async () => {
      const token = await convidarEPegarToken('admin');
      const res = await aceitar(token);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        email: CONVIDADO,
        nome: 'Convidado da Silva',
        papel: 'admin',
      });

      const criado = ctx.db.prepare('SELECT * FROM usuarios WHERE email = ?').get(CONVIDADO);
      expect(criado).toMatchObject({ papel: 'admin', ativo: 1 });
      expect(criado.senha_hash).toMatch(/^\$argon2id\$/);

      const login = await publico('/v1/auth/login', { email: CONVIDADO, senha: SENHA_NOVA });
      expect(login.status).toBe(200);
      expect(login.body.usuario.papel).toBe('admin');
    });

    it('aceitar duas vezes → 409 na segunda (e-mail já existe)', async () => {
      const token = await convidarEPegarToken();
      expect((await aceitar(token)).status).toBe(201);
      const segunda = await aceitar(token);
      expect(segunda.status).toBe(409);
      expect(segunda.body.erro).toBe('conflito');
    });

    it('email_confirmado diferente do token → 400; igual sem diferenciar maiúsculas → 201', async () => {
      const token = await convidarEPegarToken();
      const diferente = await aceitar(token, { email_confirmado: 'outro@teste.com' });
      expect(diferente.status).toBe(400);
      expect(diferente.body.detalhes.map((d) => d.campo)).toContain('email_confirmado');
      expect((await aceitar(token, { email_confirmado: 'CONVIDADO@teste.com' })).status).toBe(201);
    });

    it('senha fora da política ou nome vazio → 400, sem criar usuário', async () => {
      const token = await convidarEPegarToken();
      expect((await aceitar(token, { senha: 'curta' })).status).toBe(400);
      expect((await aceitar(token, { nome: '   ' })).status).toBe(400);
      expect(
        ctx.db.prepare('SELECT COUNT(*) FROM usuarios WHERE email = ?').pluck().get(CONVIDADO),
      ).toBe(0);
    });

    it('token expirado → 410 e token adulterado → 400, sem criar usuário', async () => {
      const convites = ctx.app.get(ConvitesService);
      const por = idUsuario(ctx.db, ADMIN);
      const expirado = convites.gerarToken(
        { email: CONVIDADO, papel: 'leitor', por },
        { validadeSegundos: -1 },
      );
      expect((await aceitar(expirado)).status).toBe(410);
      const valido = await convidarEPegarToken('leitor');
      expect((await aceitar(comPayload(valido, { papel: 'admin' }))).status).toBe(400);
      expect(
        ctx.db.prepare('SELECT COUNT(*) FROM usuarios WHERE email = ?').pluck().get(CONVIDADO),
      ).toBe(0);
    });

    it('o e-mail do novo usuário vem do token, não do corpo', async () => {
      const token = await convidarEPegarToken();
      const res = await aceitar(token, { email: 'invasor@teste.com' });
      expect(res.status).toBe(400);
      expect(
        ctx.db
          .prepare('SELECT COUNT(*) FROM usuarios WHERE email = ?')
          .pluck()
          .get('invasor@teste.com'),
      ).toBe(0);
    });
  });
});
