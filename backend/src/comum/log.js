import { randomUUID } from 'node:crypto';

const REQUEST_ID_VALIDO = /^[\w-]{1,100}$/;

// Usa o x-request-id recebido (ex.: do Nginx) ou gera um novo, e o devolve na resposta.
function gerarRequestId(req, res) {
  const recebido = req.headers['x-request-id'];
  const id = REQUEST_ID_VALIDO.test(recebido ?? '') ? recebido : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

// Opções do pino-http (tarefa 029). A linha de cada requisição tem só os campos descritos
// na POLICY: nenhum cabeçalho é gravado, então credenciais (Authorization, Cookie,
// X-Api-Key, Set-Cookie) nunca chegam aos logs. O redact cobre objetos que o próprio
// código registrar com esses nomes.
export function opcoesPinoHttp(nivel) {
  return {
    level: nivel,
    genReqId: gerarRequestId,
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
        userAgent: req.headers?.['user-agent'],
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        '*.senha',
        '*.senha_hash',
        '*.token',
      ],
      censor: '[oculto]',
    },
  };
}
