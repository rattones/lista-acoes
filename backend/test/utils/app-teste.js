import request from 'supertest';
import { criarApp } from '../../src/criar-app';
import { CONEXAO_DB } from '../../src/database/database.module';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../../src/database/migracoes';

// App completo com banco em memória já migrado (schema e carga inicial).
export async function criarAppTeste() {
  const app = await criarApp();
  await app.init();
  const db = app.get(CONEXAO_DB);
  aplicarMigracoes(db, PASTA_MIGRACOES);
  return { app, db, http: () => request(app.getHttpServer()) };
}

export const idAtivo = (db, ativo) =>
  db.prepare('SELECT id FROM ativos WHERE ativo = ?').pluck().get(ativo);
