import { BadRequestException } from '@nestjs/common';

// Em JavaScript o Nest não conhece o tipo dos parâmetros, então o esquema Joi é
// informado por parâmetro: @Body(new ValidacaoPipe(esquema)).
export class ValidacaoPipe {
  constructor(esquema) {
    this.esquema = esquema;
  }

  transform(valor) {
    const { error, value } = this.esquema.validate(valor, { abortEarly: false });
    if (error) {
      throw new BadRequestException({
        erro: 'requisicao_invalida',
        mensagem: 'Dados inválidos na requisição',
        detalhes: error.details.map((d) => ({ campo: d.path.join('.'), mensagem: d.message })),
      });
    }
    return value;
  }
}
