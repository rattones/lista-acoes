// Comandos do banco: npm run db:migrate | db:status -w backend (na imagem de PROD:
// node dist/database/cli.js migrate|status). Lê DB_ARQUIVO do ambiente ou do backend/.env.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { validarConfig } from '../config/configuracao';
import { abrirConexao } from './conexao';
import { aplicarMigracoes, statusMigracoes } from './migracoes';

export const PASTA_MIGRACOES = join(__dirname, '..', '..', 'migrations');

const comandos = {
  migrate({ db, pasta, saida }) {
    const aplicadas = aplicarMigracoes(db, pasta);
    if (aplicadas.length === 0) {
      saida('Nenhuma migration pendente.');
      return;
    }
    aplicadas.forEach(({ nome }) => saida(`aplicada: ${nome}`));
    saida(`${aplicadas.length} migration(s) aplicada(s).`);
  },

  status({ db, pasta, saida }) {
    const migracoes = statusMigracoes(db, pasta);
    migracoes.forEach(({ nome, aplicadaEm }) =>
      saida(aplicadaEm ? `aplicada  ${nome}  (${aplicadaEm})` : `pendente  ${nome}`),
    );
    saida(`${migracoes.filter((m) => !m.aplicadaEm).length} pendente(s).`);
  },
};

export function executar(comando, contexto) {
  const acao = comandos[comando];
  if (!acao) {
    throw new Error(
      `Comando desconhecido: ${comando}. Uso: cli.js ${Object.keys(comandos).join('|')}`,
    );
  }
  acao(contexto);
}

if (require.main === module) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { DB_ARQUIVO } = validarConfig(process.env);
  const db = abrirConexao(DB_ARQUIVO);
  try {
    executar(process.argv[2], { db, pasta: PASTA_MIGRACOES, saida: console.log });
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
