import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/decorators';
import { version } from '../../package.json';

@Publico()
@Controller('health')
export class HealthController {
  @Get()
  verificar() {
    return { status: 'ok', versao: version };
  }
}
