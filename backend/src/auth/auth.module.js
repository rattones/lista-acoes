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
import { MailModule } from '../mail/mail.module';
import { AgentesTokensService } from './agentes-tokens.service';
import { AuthService, REFRESH_SEGUNDOS } from './auth.service';
import { ConvitesService } from './convites.service';
import { Papeis, Publico } from './decorators';
import { ApiKeyGuard, AutenticacaoGuard, PapeisGuard } from './guards';
import { LIMITES, limitar } from './limites';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';

const COOKIE_REFRESH = 'refresh_token';

const email = () => Joi.string().trim().email().max(254).required();
const token = () => Joi.string().max(2000).required();

const esquemaRecuperar = Joi.object({ email: email() });
const esquemaValidar = Joi.object({ token: token() });
const esquemaRedefinir = Joi.object({ token: token(), senha: Joi.string().max(200).required() });

const esquemaConvidar = Joi.object({
  email: Joi.string().trim().lowercase().email().max(254).required(),
  papel: Joi.string().valid('admin', 'leitor').required(),
});
const esquemaAceitar = Joi.object({
  token: token(),
  nome: Joi.string().trim().min(1).max(100).required(),
  senha: Joi.string().max(200).required(),
  email_confirmado: Joi.string().trim().email().max(254).required(),
});

const MENSAGEM_RECUPERACAO =
  'Se o e-mail estiver cadastrado, você receberá em instantes um link para redefinir a senha.';

const esquemaLogin = Joi.object({
  email: Joi.string().trim().email().max(254).required(),
  senha: Joi.string().max(200).required(),
});

@Controller('auth')
@Dependencies(AuthService, ConfigService, RecuperacaoSenhaService)
export class AuthController {
  constructor(auth, config, recuperacao) {
    this.auth = auth;
    this.config = config;
    this.recuperacao = recuperacao;
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
  @limitar('login')
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

  // Recuperação de senha (tarefa 014). O token vai sempre no corpo, nunca na URL (logs).
  @Publico()
  @UseGuards(ThrottlerGuard)
  @limitar('recuperacao_ip', 'recuperacao_email')
  @Post('recuperar-senha')
  @HttpCode(202)
  recuperar(@Body() corpo) {
    const { email } = new ValidacaoPipe(esquemaRecuperar).transform(corpo ?? {});
    this.recuperacao.solicitar(email);
    return { mensagem: MENSAGEM_RECUPERACAO };
  }

  @Publico()
  @UseGuards(ThrottlerGuard)
  @limitar('recuperacao_ip')
  @Post('redefinir-senha/validar')
  @HttpCode(200)
  validarRedefinicao(@Body() corpo) {
    const { token } = new ValidacaoPipe(esquemaValidar).transform(corpo ?? {});
    return { email: this.recuperacao.validar(token).email };
  }

  @Publico()
  @UseGuards(ThrottlerGuard)
  @limitar('recuperacao_ip')
  @Post('redefinir-senha')
  @HttpCode(200)
  async redefinir(@Body() corpo) {
    const { token, senha } = new ValidacaoPipe(esquemaRedefinir).transform(corpo ?? {});
    await this.recuperacao.redefinir(token, senha);
    return { mensagem: 'Senha redefinida. Entre com a nova senha.' };
  }
}

// Convites (tarefa 015): só admin convida; validar e aceitar são públicos, com o token
// sempre no corpo (nunca na URL, que vai para os logs).
@Controller('convites')
@Dependencies(ConvitesService)
export class ConvitesController {
  constructor(convites) {
    this.convites = convites;
  }

  @Papeis('admin')
  @Post()
  convidar(@Body() corpo, @Req() req) {
    return this.convites.convidar(
      req.usuario,
      new ValidacaoPipe(esquemaConvidar).transform(corpo ?? {}),
    );
  }

  @Publico()
  @UseGuards(ThrottlerGuard)
  @limitar('convite_ip')
  @Post('validar')
  @HttpCode(200)
  validar(@Body() corpo) {
    return this.convites.validar(new ValidacaoPipe(esquemaValidar).transform(corpo ?? {}).token);
  }

  @Publico()
  @UseGuards(ThrottlerGuard)
  @limitar('convite_ip')
  @Post('aceitar')
  aceitar(@Body() corpo) {
    return this.convites.aceitar(new ValidacaoPipe(esquemaAceitar).transform(corpo ?? {}));
  }
}

// Autenticação (tarefa 012): JWT de acesso + refresh em cookie, guards globais de
// autenticação e papéis, rate limits, recuperação de senha (014), convites (015) e API keys
// dos agentes (016). A ordem dos guards importa: a API key é conferida antes do JWT.
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config) => ({ secret: config.get('JWT_SEGREDO') }),
    }),
    ThrottlerModule.forRoot({
      throttlers: LIMITES,
      errorMessage: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    }),
    MailModule,
  ],
  controllers: [AuthController, ConvitesController],
  providers: [
    AuthService,
    RecuperacaoSenhaService,
    ConvitesService,
    AgentesTokensService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PapeisGuard },
  ],
  exports: [AgentesTokensService],
})
export class AuthModule {}
