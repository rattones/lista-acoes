import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { opcoesPinoHttp } from './comum/log';
import { validarConfig } from './config/configuracao';
import { AtivosModule } from './ativos/ativos.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ExecucoesModule } from './execucoes/execucoes.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { NoticiasModule } from './noticias/noticias.module';
import { PrecosModule } from './precos/precos.module';
import { SinaisModule } from './sinais/sinais.module';
import { UsuariosModule } from './usuarios/usuarios.module';

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
        pinoHttp: opcoesPinoHttp(config.get('LOG_LEVEL')),
      }),
    }),
    DatabaseModule,
    AuthModule,
    MailModule,
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
