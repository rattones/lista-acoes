// Token de um link enviado por e-mail (tarefas 019 e 020). Vem no fragmento (#t=, #c=), que o
// navegador não envia ao servidor nem aos logs; na query (?t=, ?c=) também é aceito.
export function tokenDoLink(rota, chave) {
  const doFragmento = new URLSearchParams(rota.hash.replace(/^#/, '')).get(chave);
  const daQuery = rota.query[chave];
  return doFragmento ?? (typeof daQuery === 'string' ? daQuery : '');
}

// Tira o token do endereço depois de lido (histórico, compartilhamento de tela...).
export async function limparLink(rota, router) {
  if (rota.hash || Object.keys(rota.query).length) await router.replace({ name: rota.name });
}
