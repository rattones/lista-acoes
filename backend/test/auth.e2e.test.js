import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ADMIN, criarAppTeste, idUsuario, LEITOR, SENHA } from './utils/app-teste';

// Login, bloqueio, tokens e sessão (tarefa 012).
describe('/v1/auth', () => {
  let ctx;
  const login = (email, senha = SENHA) =>
    request(ctx.servidor).post('/v1/auth/login').send({ email, senha });
  const usuario = (email) => ctx.db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  const cookieRefresh = (res) =>
    [res.headers['set-cookie']].flat().find((c) => c?.startsWith('refresh_token='));

  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  describe('POST /login', () => {
    it('login válido devolve o token de acesso, o usuário e o refresh em cookie httpOnly', async () => {
      const res = await login(ADMIN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        token_acesso: expect.any(String),
        tipo: 'Bearer',
        expira_em_segundos: 900,
        usuario: { id: idUsuario(ctx.db, ADMIN), email: ADMIN, nome: 'Admin', papel: 'admin' },
      });
      const cookie = cookieRefresh(res);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/v1\/auth/);
      expect(cookie).toMatch(/Max-Age=604800/);
    });

    it('o token de acesso expira em 15 minutos', async () => {
      const { body } = await login(ADMIN);
      const { iat, exp } = ctx.app.get(JwtService).decode(body.token_acesso);
      expect(exp - iat).toBe(900);
    });

    it('e-mail sem diferenciar maiúsculas', async () => {
      expect((await login('ADMIN@Teste.com')).status).toBe(200);
    });

    it('senha errada e e-mail inexistente → mesmo 401 genérico', async () => {
      const errada = await login(ADMIN, 'senha-errada-123');
      const inexistente = await login('ninguem@teste.com');
      for (const res of [errada, inexistente]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({
          erro: 'nao_autenticado',
          mensagem: 'E-mail ou senha inválidos',
          detalhes: null,
        });
        expect(cookieRefresh(res)).toBeUndefined();
      }
    });

    it('payload inválido → 400', async () => {
      expect((await request(ctx.servidor).post('/v1/auth/login').send({ email: 'x' })).status).toBe(
        400,
      );
    });

    it('sucesso zera as tentativas falhas e registra ultimo_login_em', async () => {
      await login(ADMIN, 'senha-errada-123');
      await login(ADMIN, 'senha-errada-123');
      expect(usuario(ADMIN).tentativas_falhas).toBe(2);
      await login(ADMIN);
      expect(usuario(ADMIN)).toMatchObject({
        tentativas_falhas: 0,
        ultimo_login_em: expect.stringMatching(/^\d{4}-/),
      });
    });

    it('5 falhas bloqueiam por 15 minutos; durante o bloqueio, até a senha certa → 423', async () => {
      for (let i = 0; i < 4; i += 1)
        expect((await login(ADMIN, 'senha-errada-123')).status).toBe(401);
      expect((await login(ADMIN, 'senha-errada-123')).status).toBe(401);

      const bloqueado = usuario(ADMIN);
      expect(bloqueado.bloqueado_ate).toEqual(expect.any(String));
      const minutos = ctx.db
        .prepare("SELECT round((julianday(?) - julianday('now','localtime')) * 1440)")
        .pluck()
        .get(bloqueado.bloqueado_ate);
      expect(minutos).toBe(15);

      const certa = await login(ADMIN);
      expect(certa.status).toBe(423);
      expect(certa.body.erro).toBe('bloqueado');
      expect(cookieRefresh(certa)).toBeUndefined();
    });

    it('o 423 informa quanto falta para o desbloqueio (para o app mostrar)', async () => {
      ctx.db
        .prepare(
          "UPDATE usuarios SET bloqueado_ate = datetime('now','localtime','+10 minutes') WHERE email = ?",
        )
        .run(ADMIN);
      const res = await login(ADMIN);
      expect(res.status).toBe(423);
      expect(res.body.detalhes.segundos_restantes).toBeGreaterThan(595);
      expect(res.body.detalhes.segundos_restantes).toBeLessThanOrEqual(600);
    });

    it('depois do prazo do bloqueio, entra', async () => {
      ctx.db
        .prepare(
          "UPDATE usuarios SET bloqueado_ate = datetime('now','localtime','-1 minute') WHERE email = ?",
        )
        .run(ADMIN);
      expect((await login(ADMIN)).status).toBe(200);
      expect(usuario(ADMIN).bloqueado_ate).toBeNull();
    });

    it('usuário inativo ou excluído não entra (401 genérico)', async () => {
      ctx.db.prepare('UPDATE usuarios SET ativo = 0 WHERE email = ?').run(ADMIN);
      ctx.db
        .prepare("UPDATE usuarios SET excluido_em = datetime('now') WHERE email = ?")
        .run(LEITOR);
      for (const email of [ADMIN, LEITOR]) {
        const res = await login(email);
        expect(res.status).toBe(401);
        expect(res.body.mensagem).toBe('E-mail ou senha inválidos');
      }
    });

    it('senha_hash está em argon2id', () => {
      expect(usuario(ADMIN).senha_hash).toMatch(/^\$argon2id\$/);
    });

    it('rate limit: mais de 10 tentativas por minuto do mesmo IP → 429', async () => {
      // O criarAppTeste já fez 2 logins (admin e leitor) nesta janela: restam 8.
      const respostas = [];
      for (let i = 0; i < 9; i += 1) respostas.push((await login('ninguem@teste.com')).status);
      expect(respostas.slice(0, 8).every((s) => s === 401)).toBe(true);
      expect(respostas[8]).toBe(429);
    });
  });

  describe('token de acesso', () => {
    const assinar = (payload, opcoes) => ctx.app.get(JwtService).sign(payload, opcoes);

    it('GET /eu devolve o usuário logado, sem senha_hash', async () => {
      const res = await ctx.http().get('/v1/auth/eu');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: idUsuario(ctx.db, ADMIN),
        email: ADMIN,
        nome: 'Admin',
        papel: 'admin',
      });
    });

    it('sem token, token inválido ou expirado → 401', async () => {
      const id = idUsuario(ctx.db, ADMIN);
      const expirado = assinar({
        sub: id,
        tipo: 'acesso',
        ver: 0,
        exp: Math.floor(Date.now() / 1000) - 10,
      });
      for (const token of [null, 'nao-e-jwt', expirado]) {
        const res = await ctx.http(token).get('/v1/auth/eu');
        expect(res.status).toBe(401);
        expect(res.body.erro).toBe('nao_autenticado');
      }
    });

    it('token assinado com outro segredo → 401', async () => {
      const outro = new JwtService({ secret: 'outro-segredo-com-mais-de-32-caracteres!!' }).sign({
        sub: idUsuario(ctx.db, ADMIN),
        tipo: 'acesso',
        ver: 0,
      });
      expect((await ctx.http(outro).get('/v1/auth/eu')).status).toBe(401);
    });

    it('refresh token não serve como token de acesso', async () => {
      const res = await login(ADMIN);
      const refresh = cookieRefresh(res).split(';')[0].split('=')[1];
      expect((await ctx.http(refresh).get('/v1/auth/eu')).status).toBe(401);
    });

    it('usuário desativado, excluído ou removido perde o acesso na hora', async () => {
      ctx.db.prepare('UPDATE usuarios SET ativo = 0 WHERE email = ?').run(ADMIN);
      expect((await ctx.http().get('/v1/auth/eu')).status).toBe(401);

      ctx.db
        .prepare("UPDATE usuarios SET excluido_em = datetime('now') WHERE email = ?")
        .run(LEITOR);
      expect((await ctx.http(ctx.tokens.leitor).get('/v1/auth/eu')).status).toBe(401);
    });

    it('mudança de papel vale na hora (o papel vem do banco, não do token)', async () => {
      ctx.db.prepare("UPDATE usuarios SET papel = 'admin' WHERE email = ?").run(LEITOR);
      const res = await ctx.http(ctx.tokens.leitor).get('/v1/auth/eu');
      expect(res.body.papel).toBe('admin');
    });
  });

  describe('refresh e logout', () => {
    const refresh = (cookie) => {
      const req = request(ctx.servidor).post('/v1/auth/refresh');
      return cookie ? req.set('Cookie', cookie.split(';')[0]) : req;
    };

    it('POST /refresh com o cookie gera novo token de acesso e renova o cookie', async () => {
      const cookie = cookieRefresh(await login(ADMIN));
      const res = await refresh(cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        token_acesso: expect.any(String),
        tipo: 'Bearer',
        expira_em_segundos: 900,
      });
      expect(cookieRefresh(res)).toMatch(/^refresh_token=/);
      expect((await ctx.http(res.body.token_acesso).get('/v1/auth/eu')).status).toBe(200);
    });

    it('POST /refresh sem cookie, com cookie inválido ou com token de acesso → 401', async () => {
      expect((await refresh()).status).toBe(401);
      expect((await refresh('refresh_token=lixo')).status).toBe(401);
      expect((await refresh(`refresh_token=${ctx.tokens.admin}`)).status).toBe(401);
    });

    it('POST /refresh de usuário desativado → 401', async () => {
      const cookie = cookieRefresh(await login(ADMIN));
      ctx.db.prepare('UPDATE usuarios SET ativo = 0 WHERE email = ?').run(ADMIN);
      expect((await refresh(cookie)).status).toBe(401);
    });

    it('POST /logout encerra as sessões: limpa o cookie e invalida os tokens já emitidos', async () => {
      const respostaLogin = await login(ADMIN);
      const cookie = cookieRefresh(respostaLogin);
      const token = respostaLogin.body.token_acesso;

      const res = await ctx.http(token).post('/v1/auth/logout');
      expect(res.status).toBe(204);
      expect(cookieRefresh(res)).toMatch(/refresh_token=;.*(Expires=Thu, 01 Jan 1970|Max-Age=0)/);

      expect((await ctx.http(token).get('/v1/auth/eu')).status).toBe(401);
      expect((await ctx.http(ctx.tokens.admin).get('/v1/auth/eu')).status).toBe(401);
      expect((await refresh(cookie)).status).toBe(401);
      expect((await login(ADMIN)).status).toBe(200);
    });

    it('POST /logout exige autenticação', async () => {
      expect((await ctx.http(null).post('/v1/auth/logout')).status).toBe(401);
    });
  });
});
