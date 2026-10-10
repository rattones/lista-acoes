import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { FiltroErros } from './comum/filtro-erros';

// Monta a aplicação com a configuração global (usada pelo main e pelos testes e2e).
export async function criarApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: app.get(ConfigService).get('CORS_ORIGENS') });
  app.useGlobalFilters(new FiltroErros(logger));
  return app;
}
