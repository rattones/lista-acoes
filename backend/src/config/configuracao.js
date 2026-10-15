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
