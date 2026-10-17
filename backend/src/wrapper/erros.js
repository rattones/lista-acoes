import { HttpException } from '@nestjs/common';

// Fonte externa fora do ar (tarefa 018): 502 no formato de erro da API. O ClienteHttp do comum/
// recebe esta função como erroIndisponivel.
export const fonteIndisponivel = (fonte) =>
  new HttpException(
    {
      erro: 'fonte_indisponivel',
      mensagem: `${fonte} não respondeu ou está fora do ar. Tente de novo em alguns minutos.`,
    },
    502,
  );
