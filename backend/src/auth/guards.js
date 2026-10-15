import {
  Dependencies,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentesTokensService } from './agentes-tokens.service';
import { AuthService } from './auth.service';
import { ESCOPOS, ESCOPOS_CRUD, PAPEIS, PUBLICO } from './decorators';

const metadado = (reflector, chave, contexto) =>
  reflector.getAllAndOverride(chave, [contexto.getHandler(), contexto.getClass()]);

const PREFIXO_API_KEY = 'la_';
const bearer = (req) => /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];

// Escopos da rota: @Escopos no método ou, nas rotas herdadas do CRUD, @EscoposCrud no controller.
const escoposDaRota = (reflector, contexto) =>
  reflector.get(ESCOPOS, contexto.getHandler()) ??
  reflector.get(ESCOPOS_CRUD, contexto.getClass())?.[contexto.getHandler().name] ??
  [];

// Guard global, antes do de autenticação (tarefa 016): "Authorization: Bearer la_..." é uma
// API key de agente. Chave inválida, revogada ou excluída → 401; rota sem um escopo da
// chave → 403. A chave nunca vale em rota sem @Escopos (usuários, chaves, /auth...).
@Injectable()
@Dependencies(Reflector, AgentesTokensService)
export class ApiKeyGuard {
  constructor(reflector, agentesTokens) {
    this.reflector = reflector;
    this.agentesTokens = agentesTokens;
  }

  canActivate(contexto) {
    if (metadado(this.reflector, PUBLICO, contexto)) return true;
    const req = contexto.switchToHttp().getRequest();
    const chave = bearer(req);
    if (!chave?.startsWith(PREFIXO_API_KEY)) return true;

    const agente = this.agentesTokens.autenticar(chave);
    if (!agente) {
      throw new UnauthorizedException({
        erro: 'nao_autenticado',
        mensagem: 'API key inválida, revogada ou excluída',
      });
    }
    const escopos = escoposDaRota(this.reflector, contexto);
    if (!escopos.some((escopo) => agente.escopos.includes(escopo))) throw proibido();
    req.agente = agente;
    return true;
  }
}

// Guard global: toda rota exige "Authorization: Bearer <token de acesso>", salvo @Publico()
// ou quando o ApiKeyGuard já autenticou um agente.
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
    if (req.agente) return true;
    const token = bearer(req);
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
// Para um agente, valem os escopos, já conferidos pelo ApiKeyGuard.
@Injectable()
@Dependencies(Reflector)
export class PapeisGuard {
  constructor(reflector) {
    this.reflector = reflector;
  }

  canActivate(contexto) {
    const papeis = metadado(this.reflector, PAPEIS, contexto);
    const { usuario, agente } = contexto.switchToHttp().getRequest();
    if (!papeis?.length || agente) return true;
    if (!papeis.includes(usuario?.papel)) throw proibido();
    return true;
  }
}

export const proibido = () =>
  new ForbiddenException({
    erro: 'proibido',
    mensagem: 'Permissão insuficiente para esta operação',
  });
