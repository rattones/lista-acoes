// Mensagem para o usuário a partir do ErroApi (tarefa 019).
export function mensagemDeErro(erro) {
  if (erro?.codigo === 'bloqueado') {
    const segundos = erro.detalhes?.segundos_restantes;
    const minutos = Math.max(Math.ceil((segundos ?? 0) / 60), 1);
    return segundos
      ? `Conta bloqueada por excesso de tentativas. Tente de novo em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`
      : 'Conta bloqueada por excesso de tentativas. Tente de novo mais tarde.';
  }
  return erro?.message || 'Algo deu errado. Tente de novo.';
}
