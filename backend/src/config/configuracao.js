import Joi from 'joi';

// Arquivo do banco, relativo à pasta backend/ (usado também pelo CLI do banco).
export const DB_ARQUIVO_PADRAO = 'data/monitor.db';

const esquema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  CORS_ORIGENS: Joi.string().required(),
  DB_ARQUIVO: Joi.string().default(DB_ARQUIVO_PADRAO),
  JWT_SEGREDO: Joi.string().min(32).required(),
  COOKIE_SEGURO: Joi.boolean(),
  CONFIAR_PROXY: Joi.number().integer().min(0).default(0),
  // E-mail (tarefa 013): credenciais obrigatórias só em produção; sem elas o envio fica desligado.
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().port().default(465),
  SMTP_USER: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required() }),
  SMTP_PASS: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required() }),
  MAIL_FROM: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required() }),
  APP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:8080'),
    }),
  // Wrapper de dados de ativos (tarefa 018): chamadas ao Yahoo, à Binance e ao CoinGecko.
  WRAPPER_USER_AGENT: Joi.string().default(
    'Mozilla/5.0 (compatible; lista-acoes/1.0; +https://www.listadecompras.net)',
  ),
  WRAPPER_TIMEOUT_MS: Joi.number().integer().min(100).default(8000),
  WRAPPER_TENTATIVAS: Joi.number().integer().min(1).max(5).default(3),
  WRAPPER_CACHE_SEGUNDOS: Joi.number().integer().min(0).default(60),
}).unknown(true);

// Valida as variáveis de ambiente na inicialização; a API não sobe com configuração inválida.
export function validarConfig(env) {
  const { error, value } = esquema.validate(env, { abortEarly: false });
  if (error) {
    throw new Error(`Configuração inválida: ${error.message}`);
  }
  return {
    ...value,
    // O cookie Secure só trafega em HTTPS: ligado por padrão só em produção.
    COOKIE_SEGURO: value.COOKIE_SEGURO ?? value.NODE_ENV === 'production',
    CORS_ORIGENS: value.CORS_ORIGENS.split(',')
      .map((origem) => origem.trim())
      .filter(Boolean),
  };
}
