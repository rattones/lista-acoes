import request from 'supertest';
import { verificarSenha } from '../src/auth/senha';
import { ADMIN, criarAppTeste, idUsuario, LEITOR, SENHA } from './utils/app-teste';

const SENHA_NOVA = 'outra-senha-forte-456';

// Perfil e exclusão permanente da própria conta (tarefa 017).
describe('/v1/auth/eu: perfil e exclusão de conta', () => {
  let ctx;

  const usuario = (email) => ctx.db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  const login = (email, senha = SENHA) =>
    request(ctx.servidor).post('/v1/auth/login').send({ email, senha });
  const excluir = (corpo, token = ctx.tokens.leitor) =>
    ctx.http(token).delete('/v1/auth/eu').send(corpo);
  const editar = (corpo, token = ctx.tokens.leitor) =>
    ctx.http(token).patch('/v1/auth/eu').send(corpo);
  const cookieRefresh = (res) =>
    [res.headers['set-cookie']].flat().find((c) => c?.startsWith('refresh_token='));
  const novaChave = async () => {
    const res = await ctx
      .http()
      .post('/v1/agentes-tokens')
      .send({
        nome: 'coletor',
        escopos: ['ativos:read'],
      });
    expect(res.status).toBe(201);
    return res.body.chave;
  };
  const comChave = (chave) =>
    request(ctx.servidor).get('/v1/ativos').set('Authorization', `Bearer ${chave}`);
  const outroAdmin = (email = 'admin2@teste.com') =>
    ctx.db
      .prepare(
        "INSERT INTO usuarios (email, nome, senha_hash, papel) VALUES (?, 'Admin 2', ?, 'admin')",
      )
      .run(email, usuario(ADMIN).senha_hash);

  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  describe('DELETE /v1/auth/eu', () => {
    it('com a senha certa, apaga o usuário de vez (204), limpa o cookie e encerra a sessão', async () => {
      const id = idUsuario(ctx.db, LEITOR);
      const res = await excluir({ senha: SENHA });
      expect(res.status).toBe(204);
      expect(cookieRefresh(res)).toMatch(/^refresh_token=;/);
      expect(ctx.db.prepare('SELECT COUNT(*) FROM usuarios WHERE id = ?').pluck().get(id)).toBe(0);
      expect((await ctx.http(ctx.tokens.leitor).get('/v1/auth/eu')).status).toBe(401);
      expect((await login(LEITOR)).status).toBe(401);
    });

    it('senha errada → 403, nada é apagado', async () => {
      const res = await excluir({ senha: 'senha-errada-123' });
      expect(res.status).toBe(403);
      expect(res.body.erro).toBe('senha_incorreta');
      expect(usuario(LEITOR)).toBeDefined();
      expect((await ctx.http(ctx.tokens.leitor).get('/v1/auth/eu')).status).toBe(200);
    });

    it('sem senha → 400; sem token → 401', async () => {
      expect((await excluir({})).status).toBe(400);
      expect((await excluir({ senha: SENHA }, null)).status).toBe(401);
      expect(usuario(LEITOR)).toBeDefined();
    });

    it('critério de aceite: apaga o usuário e as API keys dele, que deixam de autenticar', async () => {
      outroAdmin();
      const chave = await novaChave();
      expect((await comChave(chave)).status).toBe(200);
      const id = idUsuario(ctx.db, ADMIN);

      expect((await excluir({ senha: SENHA }, ctx.tokens.admin)).status).toBe(204);

      expect((await comChave(chave)).status).toBe(401);
      // Nenhum registro ligado ao id: toda FK para usuarios é ON DELETE CASCADE.
      const tabelas = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .all();
      for (const tabela of tabelas) {
        for (const fk of ctx.db.pragma(`foreign_key_list(${tabela})`)) {
          if (fk.table !== 'usuarios') continue;
          const restantes = ctx.db
            .prepare(`SELECT COUNT(*) FROM ${tabela} WHERE ${fk.from} = ?`)
            .pluck()
            .get(id);
          expect({ tabela, restantes }).toEqual({ tabela, restantes: 0 });
        }
      }
      expect(ctx.db.prepare('SELECT COUNT(*) FROM agentes_tokens').pluck().get()).toBe(0);
    });

    it('último admin ativo → 409, nada é apagado', async () => {
      const res = await excluir({ senha: SENHA }, ctx.tokens.admin);
      expect(res.status).toBe(409);
      expect(res.body.erro).toBe('ultimo_admin');
      expect(usuario(ADMIN)).toBeDefined();
    });

    it('admin inativo ou excluído não conta como outro admin', async () => {
      outroAdmin();
      ctx.db.prepare("UPDATE usuarios SET ativo = 0 WHERE email = 'admin2@teste.com'").run();
      expect((await excluir({ senha: SENHA }, ctx.tokens.admin)).status).toBe(409);
      ctx.db
        .prepare(
          "UPDATE usuarios SET ativo = 1, excluido_em = datetime('now') WHERE email = 'admin2@teste.com'",
        )
        .run();
      expect((await excluir({ senha: SENHA }, ctx.tokens.admin)).status).toBe(409);
    });

    it('com outro admin ativo, o admin pode se excluir', async () => {
      outroAdmin();
      expect((await excluir({ senha: SENHA }, ctx.tokens.admin)).status).toBe(204);
      expect(usuario(ADMIN)).toBeUndefined();
    });

    it('API key não exclui conta (403)', async () => {
      const chave = await novaChave();
      const res = await request(ctx.servidor)
        .delete('/v1/auth/eu')
        .set('Authorization', `Bearer ${chave}`)
        .send({ senha: SENHA });
      expect(res.status).toBe(403);
      expect(usuario(ADMIN)).toBeDefined();
    });
  });

  describe('PATCH /v1/auth/eu', () => {
    it('altera o nome e devolve o usuário', async () => {
      const res = await editar({ nome: '  Leitor Novo  ' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        usuario: {
          id: idUsuario(ctx.db, LEITOR),
          email: LEITOR,
          nome: 'Leitor Novo',
          papel: 'leitor',
        },
      });
      expect(usuario(LEITOR).nome).toBe('Leitor Novo');
      expect(usuario(LEITOR).atualizado_em).not.toBeNull();
      // Sem troca de senha, a sessão continua.
      expect((await ctx.http(ctx.tokens.leitor).get('/v1/auth/eu')).status).toBe(200);
    });

    it('e-mail, papel ou ativo no corpo → 400, nada muda', async () => {
      for (const corpo of [
        { email: 'novo@teste.com' },
        { nome: 'X', email: 'novo@teste.com' },
        { papel: 'admin' },
        { ativo: false },
        {},
        { nome: '' },
      ]) {
        const res = await editar(corpo);
        expect(res.status).toBe(400);
        expect(res.body.erro).toBe('requisicao_invalida');
      }
      expect(usuario(LEITOR)).toMatchObject({ email: LEITOR, nome: 'Leitor', papel: 'leitor' });
    });

    it('troca a senha com a senha atual, encerra as outras sessões e devolve uma sessão nova', async () => {
      const antes = usuario(LEITOR);
      const res = await editar({ senha_atual: SENHA, nova_senha: SENHA_NOVA });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        token_acesso: expect.any(String),
        tipo: 'Bearer',
        expira_em_segundos: 900,
        usuario: expect.objectContaining({ email: LEITOR }),
      });
      expect(cookieRefresh(res)).toMatch(/HttpOnly/);

      const depois = usuario(LEITOR);
      expect(await verificarSenha(depois.senha_hash, SENHA_NOVA)).toBe(true);
      expect(depois.versao_sessao).toBe(antes.versao_sessao + 1);
      expect((await ctx.http(ctx.tokens.leitor).get('/v1/auth/eu')).status).toBe(401);
      expect((await ctx.http(res.body.token_acesso).get('/v1/auth/eu')).status).toBe(200);
      expect((await login(LEITOR)).status).toBe(401);
      expect((await login(LEITOR, SENHA_NOVA)).status).toBe(200);
    });

    it('senha atual errada → 403, nada muda', async () => {
      const antes = usuario(LEITOR);
      const res = await editar({
        nome: 'Outro',
        senha_atual: 'errada-errada',
        nova_senha: SENHA_NOVA,
      });
      expect(res.status).toBe(403);
      expect(res.body.erro).toBe('senha_incorreta');
      expect(usuario(LEITOR)).toEqual(antes);
    });

    it('nova senha sem a atual, ou curta demais → 400', async () => {
      expect((await editar({ nova_senha: SENHA_NOVA })).status).toBe(400);
      expect((await editar({ senha_atual: SENHA })).status).toBe(400);
      const curta = await editar({ senha_atual: SENHA, nova_senha: 'curta' });
      expect(curta.status).toBe(400);
      expect(curta.body.detalhes).toEqual([{ campo: 'nova_senha', mensagem: expect.any(String) }]);
      expect(await verificarSenha(usuario(LEITOR).senha_hash, SENHA)).toBe(true);
    });

    it('sem token → 401', async () => {
      expect((await editar({ nome: 'X' }, null)).status).toBe(401);
    });
  });

  it('rate limit: mais de 10 confirmações de senha em 15 minutos do mesmo IP → 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await excluir({ senha: 'senha-errada-123' })).status).toBe(403);
    }
    expect((await excluir({ senha: SENHA })).status).toBe(429);
    expect(usuario(LEITOR)).toBeDefined();
  });
});
