import {
  Dependencies,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PAPEIS, PUBLICO } from './decorators';

const metadado = (reflector, chave, contexto) =>
  reflector.getAllAndOverride(chave, [contexto.getHandler(), contexto.getClass()]);

// Guard global: toda rota exige "Authorization: Bearer <token de acesso>", salvo @Publico().
@Injectable()
@Dependencies(Reflector, AuthService)
export class AutenticacaoGuard {
  constructor(reflector, auth) {
    this.reflector = reflector;
    this.auth = auth;
  }

  canActivate(contexto) {
    if (metadado(this.reflector, PUBLICO, contexto)) return true;
    const req = contexto.switchToHttp().getRequest();
    const [, token] = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '') ?? [];
    const usuario = token && this.auth.usuarioDoToken(token);
    if (!usuario) {
      throw new UnauthorizedException({
        erro: 'nao_autenticado',
        mensagem: 'Autenticação necessária: token ausente, inválido ou expirado',
      });
    }
    req.usuario = usuario;
    return true;
  }
}

// Guard global: @Papeis(...) na rota ou no controller restringe aos papéis listados.
@Injectable()
@Dependencies(Reflector)
export class PapeisGuard {
  constructor(reflector) {
    this.reflector = reflector;
  }

  canActivate(contexto) {
    const papeis = metadado(this.reflector, PAPEIS, contexto);
    if (!papeis?.length) return true;
    const { usuario } = contexto.switchToHttp().getRequest();
    if (!papeis.includes(usuario?.papel)) throw proibido();
    return true;
  }
}

export const proibido = () =>
  new ForbiddenException({
    erro: 'proibido',
    mensagem: 'Permissão insuficiente para esta operação',
  });
