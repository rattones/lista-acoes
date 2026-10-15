import { SkipThrottle } from '@nestjs/throttler';

// Rate limits nomeados (tarefas 012, 014, 015 e 017). Por padrão o tracker é o IP do cliente.
export const LIMITES = [
  { name: 'login', ttl: 60_000, limit: 10 },
  { name: 'recuperacao_ip', ttl: 15 * 60_000, limit: 10 },
  {
    name: 'recuperacao_email',
    ttl: 60 * 60_000,
    limit: 3,
    getTracker: (req) =>
      String(req.body?.email ?? '')
        .trim()
        .toLowerCase() || `sem-email:${req.ip}`,
  },
  { name: 'convite_ip', ttl: 15 * 60_000, limit: 20 },
  // Rotas que conferem a senha atual de quem já está logado (tarefa 017).
  { name: 'senha_atual', ttl: 15 * 60_000, limit: 10 },
];

// O ThrottlerGuard aplica todos os limites a cada rota; este decorator deixa só os listados.
// Uso: @UseGuards(ThrottlerGuard) @limitar('login')
export const limitar = (...nomes) =>
  SkipThrottle(
    Object.fromEntries(
      LIMITES.filter(({ name }) => !nomes.includes(name)).map(({ name }) => [name, true]),
    ),
  );
