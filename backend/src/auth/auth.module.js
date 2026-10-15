import {
  Body,
  Controller,
  Dependencies,
  Get,
  HttpCode,
  Module,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';
import { ValidacaoPipe } from '../comum/validacao.pipe';
import { AuthService, REFRESH_SEGUNDOS } from './auth.service';
import { Publico } from './decorators';
import { AutenticacaoGuard, PapeisGuard } from './guards';

const COOKIE_REFRESH = 'refresh_token';

const esquemaLogin = Joi.object({
  email: Joi.string().trim().email().max(254).required(),
  senha: Joi.string().max(200).required(),
});

@Controller('auth')
@Dependencies(AuthService, ConfigService)
export class AuthController {
  constructor(auth, config) {
    this.auth = auth;
    this.config = config;
  }

  // Refresh token só em cookie httpOnly, enviado apenas às rotas /v1/auth.
  opcoesCookie() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SEGURO'),
      sameSite: 'strict',
      path: '/v1/auth',
    };
  }

  responder(res, { corpo, refresh }) {
    res.cookie(COOKIE_REFRESH, refresh, {
      ...this.opcoesCookie(),
      maxAge: REFRESH_SEGUNDOS * 1000,
    });
    return corpo;
  }

  @Publico()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() corpo, @Res({ passthrough: true }) res) {
    const { email, senha } = new ValidacaoPipe(esquemaLogin).transform(corpo ?? {});
    return this.responder(res, await this.auth.login(email, senha));
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req, @Res({ passthrough: true }) res) {
    return this.responder(res, this.auth.renovar(req.cookies?.[COOKIE_REFRESH]));
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Req() req, @Res({ passthrough: true }) res) {
    this.auth.sair(req.usuario.id);
    res.clearCookie(COOKIE_REFRESH, this.opcoesCookie());
  }

  @Get('eu')
  eu(@Req() req) {
    return req.usuario;
  }
}

// Autenticação (tarefa 012): JWT de acesso + refresh em cookie, guards globais de
// autenticação e papéis, e rate limit no login (10 por minuto por IP).
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config) => ({ secret: config.get('JWT_SEGREDO') }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'login', ttl: 60_000, limit: 10 }],
      errorMessage: 'Muitas tentativas de login. Aguarde um minuto.',
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PapeisGuard },
  ],
})
export class AuthModule {}
