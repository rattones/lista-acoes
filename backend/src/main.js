import { ConfigService } from '@nestjs/config';
import { criarApp } from './criar-app';

async function iniciar() {
  const app = await criarApp();
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).get('PORT'));
}

iniciar();
