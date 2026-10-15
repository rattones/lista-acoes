import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClienteHttp } from './cliente-http';
import { WrapperService } from './wrapper.service';

// Wrapper de dados de ativos (tarefa 018), usado pelas rotas de /ativos.
@Module({
  providers: [
    {
      provide: ClienteHttp,
      inject: [ConfigService],
      useFactory: (config) =>
        new ClienteHttp({
          userAgent: config.get('WRAPPER_USER_AGENT'),
          timeoutMs: config.get('WRAPPER_TIMEOUT_MS'),
          tentativas: config.get('WRAPPER_TENTATIVAS'),
          cacheSegundos: config.get('WRAPPER_CACHE_SEGUNDOS'),
        }),
    },
    WrapperService,
  ],
  exports: [WrapperService],
})
export class WrapperModule {}
