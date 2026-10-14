import 'reflect-metadata';
import cookieParser from 'cookie-parser';
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
  // Lotes de até 1000 itens dos agentes passam do limite padrão de 100 KB.
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('v1');
  const config = app.get(ConfigService);
  // Atrás do Nginx (PROD), o IP do cliente vem do X-Forwarded-For (rate limit do login).
  app.set('trust proxy', config.get('CONFIAR_PROXY'));
  app.use(cookieParser());
  // credentials: o app (outra origem em PROD) envia o cookie do refresh token.
  app.enableCors({ origin: config.get('CORS_ORIGENS'), credentials: true });
  app.useGlobalFilters(new FiltroErros(logger));
  return app;
}
