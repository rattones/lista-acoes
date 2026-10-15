import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { criarTransporte, MailService, TRANSPORTE_EMAIL } from './mail.service';

// E-mail via Gmail SMTP (tarefa 013). Importe este módulo para injetar o MailService.
@Module({
  providers: [
    MailService,
    { provide: TRANSPORTE_EMAIL, inject: [ConfigService], useFactory: criarTransporte },
  ],
  exports: [MailService],
})
export class MailModule {}
