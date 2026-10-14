import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validarConfig } from './config/configuracao';
import { AtivosModule } from './ativos/ativos.module';
import { DatabaseModule } from './database/database.module';
import { ExecucoesModule } from './execucoes/execucoes.module';
import { HealthController } from './health/health.controller';
import { NoticiasModule } from './noticias/noticias.module';
import { PrecosModule } from './precos/precos.module';
import { SinaisModule } from './sinais/sinais.module';
import { UsuariosModule } from './usuarios/usuarios.module';

const REQUEST_ID_VALIDO = /^[\w-]{1,100}$/;

// Usa o x-request-id recebido (ex.: do Nginx) ou gera um novo, e o devolve na resposta.
function gerarRequestId(req, res) {
  const recebido = req.headers['x-request-id'];
  const id = REQUEST_ID_VALIDO.test(recebido ?? '') ? recebido : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarConfig,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config) => ({
        pinoHttp: { level: config.get('LOG_LEVEL'), genReqId: gerarRequestId },
      }),
    }),
    DatabaseModule,
    AtivosModule,
    ExecucoesModule,
    SinaisModule,
    PrecosModule,
    NoticiasModule,
    UsuariosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
