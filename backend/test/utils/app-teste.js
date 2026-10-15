import request from 'supertest';
import { criarApp } from '../../src/criar-app';
import { criarAdmin } from '../../src/database/admin';
import { CONEXAO_DB } from '../../src/database/database.module';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../../src/database/migracoes';

export const SENHA = 'senha-forte-123';
export const ADMIN = 'admin@teste.com';
export const LEITOR = 'leitor@teste.com';

const METODOS = ['get', 'post', 'patch', 'put', 'delete'];

// App completo com banco em memória já migrado (schema e carga inicial), um admin e um leitor.
// ctx.http() faz requisições como admin; ctx.http(ctx.tokens.leitor) como leitor;
// ctx.http(null) sem autenticação.
export async function criarAppTeste() {
  const app = await criarApp();
  await app.init();
  const db = app.get(CONEXAO_DB);
  aplicarMigracoes(db, PASTA_MIGRACOES);
  await criarAdmin(db, { email: ADMIN, nome: 'Admin', senha: SENHA });
  await criarAdmin(db, { email: LEITOR, nome: 'Leitor', senha: SENHA });
  db.prepare("UPDATE usuarios SET papel = 'leitor' WHERE email = ?").run(LEITOR);

  const servidor = app.getHttpServer();
  const entrar = async (email) => {
    const res = await request(servidor).post('/v1/auth/login').send({ email, senha: SENHA });
    if (res.status !== 200)
      throw new Error(`login de teste falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.token_acesso;
  };
  const tokens = { admin: await entrar(ADMIN), leitor: await entrar(LEITOR) };

  const http = (token = tokens.admin) =>
    Object.fromEntries(
      METODOS.map((metodo) => [
        metodo,
        (url) => {
          const req = request(servidor)[metodo](url);
          return token ? req.set('Authorization', `Bearer ${token}`) : req;
        },
      ]),
    );

  return { app, db, http, tokens, servidor };
}

export const idAtivo = (db, ativo) =>
  db.prepare('SELECT id FROM ativos WHERE ativo = ?').pluck().get(ativo);

export const idUsuario = (db, email) =>
  db.prepare('SELECT id FROM usuarios WHERE email = ?').pluck().get(email);
