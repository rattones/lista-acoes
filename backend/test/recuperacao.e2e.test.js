import request from 'supertest';
import { RecuperacaoSenhaService } from '../src/auth/recuperacao-senha.service';
import { verificarSenha } from '../src/auth/senha';
import { MailService } from '../src/mail/mail.service';
import { ADMIN, criarAppTeste, LEITOR, SENHA } from './utils/app-teste';

const NOVA = 'nova-senha-forte-456';

// Recuperação de senha por link assinado, sem estado no banco (tarefa 014).
describe('recuperação de senha', () => {
  let ctx;
  let enviados;
  let transporte;

  const post = (url, corpo) => request(ctx.servidor).post(url).send(corpo);
  const pedir = (email) => post('/v1/auth/recuperar-senha', { email });
  const validar = (token) => post('/v1/auth/redefinir-senha/validar', { token });
  const redefinir = (token, senha = NOVA) => post('/v1/auth/redefinir-senha', { token, senha });
  const login = (email, senha) => post('/v1/auth/login', { email, senha });
  const usuario = (email) => ctx.db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);

  // O e-mail sai em segundo plano: espera o envio (ou a confirmação de que não houve).
  const esperarEnvios = async (quantidade) => {
    for (let i = 0; i < 50 && enviados.length < quantidade; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  };
  const tokenDoEmail = (mensagem) => decodeURIComponent(/#t=([^\s"&<]+)/.exec(mensagem.text)[1]);
  const pedirToken = async (email = ADMIN) => {
    await pedir(email);
    await esperarEnvios(enviados.length + 1);
    return tokenDoEmail(enviados.at(-1));
  };

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

  describe('POST /v1/auth/recuperar-senha', () => {
    it('e-mail cadastrado → 202 e envia o link com o token no fragmento', async () => {
      const res = await pedir('ADMIN@teste.com');
      expect(res.status).toBe(202);
      expect(res.body).toEqual({
        mensagem: expect.stringMatching(/Se o e-mail estiver cadastrado/),
      });

      await esperarEnvios(1);
      expect(enviados).toHaveLength(1);
      const [mensagem] = enviados;
      expect(mensagem.to).toBe(ADMIN);
      expect(mensagem.subject).toMatch(/senha/i);
      expect(mensagem.text).toMatch(/^http:\/\/app\.teste\/redefinir-senha#t=[\w.%-]+$/m);
      expect(mensagem.text).not.toMatch(/\?t=/);
    });

    it('e-mail inexistente → mesmo 202 e nenhum envio', async () => {
      const existente = await pedir(ADMIN);
      const inexistente = await pedir('ninguem@teste.com');
      expect(inexistente.status).toBe(202);
      expect(inexistente.body).toEqual(existente.body);
      await esperarEnvios(2);
      expect(enviados.map((m) => m.to)).toEqual([ADMIN]);
    });

    it('usuário inativo ou excluído → 202 e nenhum envio', async () => {
      ctx.db.prepare('UPDATE usuarios SET ativo = 0 WHERE email = ?').run(ADMIN);
      ctx.db
        .prepare("UPDATE usuarios SET excluido_em = datetime('now') WHERE email = ?")
        .run(LEITOR);
      expect((await pedir(ADMIN)).status).toBe(202);
      expect((await pedir(LEITOR)).status).toBe(202);
      await esperarEnvios(1);
      expect(enviados).toHaveLength(0);
    });

    it('falha no envio do e-mail não muda a resposta (202)', async () => {
      transporte.sendMail.mockRejectedValueOnce(
        Object.assign(new Error('falhou'), { code: 'ECONNECTION' }),
      );
      expect((await pedir(ADMIN)).status).toBe(202);
      await esperarEnvios(1);
      expect(transporte.sendMail).toHaveBeenCalledTimes(1);
    });

    it('e-mail malformado → 400', async () => {
      expect((await pedir('nao-e-email')).status).toBe(400);
    });

    it('rate limit por e-mail: o 4º pedido na hora para o mesmo e-mail → 429; outro e-mail segue', async () => {
      for (let i = 0; i < 3; i += 1) expect((await pedir(ADMIN)).status).toBe(202);
      expect((await pedir('admin@TESTE.com')).status).toBe(429);
      expect((await pedir(LEITOR)).status).toBe(202);
    });

    it('rate limit por IP: mais de 10 pedidos em 15 minutos → 429', async () => {
      const respostas = [];
      for (let i = 0; i < 11; i += 1) respostas.push((await pedir(`pessoa${i}@teste.com`)).status);
      expect(respostas.slice(0, 10).every((s) => s === 202)).toBe(true);
      expect(respostas[10]).toBe(429);
    });
  });

  describe('POST /v1/auth/redefinir-senha/validar', () => {
    it('token válido → 200 com o e-mail', async () => {
      const res = await validar(await pedirToken());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: ADMIN });
    });

    it('token adulterado (payload ou assinatura) ou malformado → 400', async () => {
      const token = await pedirToken();
      const [payload, assinatura] = token.split('.');
      const dados = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const outroPayload = Buffer.from(
        JSON.stringify({ ...dados, exp: dados.exp + 3600 }),
      ).toString('base64url');
      const outraAssinatura = (assinatura[0] === 'A' ? 'B' : 'A') + assinatura.slice(1);

      for (const adulterado of [
        `${outroPayload}.${assinatura}`,
        `${payload}.${outraAssinatura}`,
        'lixo',
        '',
      ]) {
        const res = await validar(adulterado);
        expect(res.status).toBe(400);
        expect(res.body.erro).toMatch(/token_invalido|requisicao_invalida/);
      }
    });

    it('token expirado (> 24 h) → 410', async () => {
      const recuperacao = ctx.app.get(RecuperacaoSenhaService);
      const expirado = recuperacao.gerarToken(usuario(ADMIN), { validadeSegundos: -1 });
      const res = await validar(expirado);
      expect(res.status).toBe(410);
      expect(res.body.erro).toBe('token_expirado');
    });

    it('o link vale por 24 horas', async () => {
      const token = await pedirToken();
      const { exp } = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
      const horas = (exp - Date.now() / 1000) / 3600;
      expect(horas).toBeGreaterThan(23.99);
      expect(horas).toBeLessThanOrEqual(24);
    });

    it('token de usuário excluído depois do pedido → 400', async () => {
      const token = await pedirToken();
      ctx.db
        .prepare("UPDATE usuarios SET excluido_em = datetime('now') WHERE email = ?")
        .run(ADMIN);
      expect((await validar(token)).status).toBe(400);
    });
  });

  describe('POST /v1/auth/redefinir-senha', () => {
    it('token válido redefine a senha (argon2id): a nova entra, a antiga não', async () => {
      const res = await redefinir(await pedirToken());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ mensagem: expect.any(String) });

      const { senha_hash: hash } = usuario(ADMIN);
      expect(hash).toMatch(/^\$argon2id\$/);
      await expect(verificarSenha(hash, NOVA)).resolves.toBe(true);
      expect((await login(ADMIN, NOVA)).status).toBe(200);
      expect((await login(ADMIN, SENHA)).status).toBe(401);
    });

    it('o mesmo token falha depois (a assinatura muda com o novo hash)', async () => {
      const token = await pedirToken();
      expect((await redefinir(token)).status).toBe(200);
      expect((await redefinir(token, 'outra-senha-forte-789')).status).toBe(400);
      expect((await validar(token)).status).toBe(400);
    });

    it('links pedidos antes da troca também deixam de valer', async () => {
      const primeiro = await pedirToken();
      const segundo = await pedirToken();
      expect((await redefinir(segundo)).status).toBe(200);
      expect((await redefinir(primeiro, 'outra-senha-forte-789')).status).toBe(400);
    });

    it('zera o bloqueio e as tentativas falhas', async () => {
      const token = await pedirToken();
      ctx.db
        .prepare(
          "UPDATE usuarios SET tentativas_falhas = 3, bloqueado_ate = datetime('now','localtime','+10 minutes') WHERE email = ?",
        )
        .run(ADMIN);
      await redefinir(token);
      expect(usuario(ADMIN)).toMatchObject({ tentativas_falhas: 0, bloqueado_ate: null });
      expect((await login(ADMIN, NOVA)).status).toBe(200);
    });

    it('encerra as sessões abertas (tokens emitidos antes deixam de valer)', async () => {
      await redefinir(await pedirToken());
      expect((await ctx.http().get('/v1/auth/eu')).status).toBe(401);
    });

    it('senha fora da política (< 10 caracteres) → 400 e nada muda', async () => {
      const token = await pedirToken();
      const antes = usuario(ADMIN).senha_hash;
      const res = await redefinir(token, 'curta');
      expect(res.status).toBe(400);
      expect(res.body.mensagem).toMatch(/10 caracteres/);
      expect(usuario(ADMIN).senha_hash).toBe(antes);
      expect((await redefinir(token)).status).toBe(200);
    });

    it('token expirado → 410 e nada muda', async () => {
      const expirado = ctx.app
        .get(RecuperacaoSenhaService)
        .gerarToken(usuario(ADMIN), { validadeSegundos: -1 });
      expect((await redefinir(expirado)).status).toBe(410);
      expect((await login(ADMIN, SENHA)).status).toBe(200);
    });
  });
});
