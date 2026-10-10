import { Catch, HttpException } from '@nestjs/common';

const CODIGOS = {
  400: 'requisicao_invalida',
  401: 'nao_autenticado',
  403: 'proibido',
  404: 'nao_encontrado',
  405: 'metodo_nao_permitido',
  409: 'conflito',
  413: 'payload_muito_grande',
  422: 'entidade_invalida',
  423: 'bloqueado',
  429: 'muitas_requisicoes',
};

// Toda resposta de erro segue o formato { erro, mensagem, detalhes }.
@Catch()
export class FiltroErros {
  constructor(logger) {
    this.logger = logger;
  }

  catch(excecao, host) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    if (!(excecao instanceof HttpException)) {
      this.logger.error({ err: excecao, reqId: req.id }, 'Erro não tratado');
      res
        .status(500)
        .json({ erro: 'erro_interno', mensagem: 'Erro interno do servidor', detalhes: null });
      return;
    }

    const status = excecao.getStatus();
    const resposta = excecao.getResponse();
    const corpo = typeof resposta === 'object' ? resposta : { message: resposta };
    // Exceções do próprio Nest (ex.: rota inexistente) vêm com `message` em inglês.
    const mensagem =
      corpo.mensagem ??
      (status === 404 && !corpo.erro
        ? `Rota não encontrada: ${req.method} ${req.originalUrl ?? req.url}`
        : [corpo.message].flat().join('; '));

    res.status(status).json({
      erro: corpo.erro ?? CODIGOS[status] ?? 'erro_http',
      mensagem,
      detalhes: corpo.detalhes ?? null,
    });
  }
}
