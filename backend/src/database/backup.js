import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

// Backup do banco (tarefa 028) pela API online do SQLite: copia um retrato consistente com
// a API no ar (inclusive o que ainda está no WAL), sem o sqlite3 CLI na imagem nem no host.

// Confere a integridade de uma cópia; devolve as contagens para o log.
export function verificarBackup(arquivo) {
  const copia = new Database(arquivo, { readonly: true, fileMustExist: true });
  try {
    const integridade = copia.pragma('integrity_check', { simple: true });
    if (integridade !== 'ok') {
      throw new Error(`Falha na verificação de integridade de ${arquivo}: ${integridade}`);
    }
    // Banco vazio ou sem as tabelas (ex.: o atual, guardado numa restauração de desastre):
    // a contagem vem null em vez de falhar.
    const existe = (tabela) =>
      copia.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(tabela);
    const contar = (tabela) =>
      existe(tabela) ? copia.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n : null;
    return { integridade, ativos: contar('ativos'), usuarios: contar('usuarios') };
  } finally {
    copia.close();
  }
}

export async function fazerBackup(db, destino) {
  if (existsSync(destino)) throw new Error(`O destino ${destino} já existe.`);
  mkdirSync(dirname(destino), { recursive: true });
  await db.backup(destino);
  // A cópia herda o WAL do original. Em WAL, o SQLite não abre o arquivo numa pasta só de
  // leitura (precisa criar o -shm ao lado), como na restauração: vira um arquivo único.
  // Ao abrir o banco restaurado, a API (abrirConexao) liga o WAL de novo.
  const copia = new Database(destino);
  try {
    copia.pragma('journal_mode = DELETE');
  } finally {
    copia.close();
  }
  const { integridade } = verificarBackup(destino);
  return { destino, integridade };
}
