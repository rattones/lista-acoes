import { Dependencies, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { abrirConexao } from './conexao';

// Token de injeção da conexão better-sqlite3: @Dependencies(CONEXAO_DB) ou @Inject(CONEXAO_DB).
export const CONEXAO_DB = Symbol('CONEXAO_DB');

// Abre uma única conexão SQLite (síncrona) para toda a API e a fecha no encerramento.
// As migrations não rodam aqui: são aplicadas com npm run db:migrate.
@Global()
@Module({
  providers: [
    {
      provide: CONEXAO_DB,
      inject: [ConfigService],
      useFactory: (config) => abrirConexao(config.get('DB_ARQUIVO')),
    },
  ],
  exports: [CONEXAO_DB],
})
@Dependencies(CONEXAO_DB)
export class DatabaseModule {
  constructor(db) {
    this.db = db;
  }

  onApplicationShutdown() {
    this.db.close();
  }
}
