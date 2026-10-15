import { MailService } from '../src/mail/mail.service';
import { criarAppTeste } from './utils/app-teste';

describe('MailModule (e2e)', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await criarAppTeste();
  });
  afterEach(() => ctx.app.close());

  it('o MailService está disponível para injeção e monta links com APP_URL', () => {
    const mail = ctx.app.get(MailService);
    expect(mail.montarLink('/x', { t: '1' })).toBe('http://app.teste/x#t=1');
  });
});
