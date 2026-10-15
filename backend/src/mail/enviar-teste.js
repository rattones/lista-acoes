// Envio real de teste (critério de aceite da tarefa 013):
//   npm run email:teste -w backend -- --para voce@exemplo.com
//   na imagem de PROD: node dist/mail/enviar-teste.js --para voce@exemplo.com
// Usa SMTP_*, MAIL_FROM e APP_URL do ambiente ou do backend/.env.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { criarTransporte, MailService } from './mail.service';

const PADROES = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', APP_URL: 'http://localhost:8080' };

async function principal() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values } = parseArgs({ options: { para: { type: 'string' } } });
  if (!values.para) throw new Error('Uso: npm run email:teste -w backend -- --para <e-mail>');

  const config = { get: (chave) => process.env[chave] || PADROES[chave] };
  const logger = { log: console.log, warn: console.warn, error: console.error };
  const mail = new MailService(config, logger, criarTransporte(config));
  const info = await mail.enviar({
    para: values.para,
    assunto: 'Teste de envio — Lista de Ações',
    template: 'recuperacao-senha',
    dados: { nome: 'teste', link: mail.montarLink('/teste-de-email', { t: 'exemplo' }) },
  });
  console.log(`Enviado: ${info.messageId}`);
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
