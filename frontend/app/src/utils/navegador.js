// Navegação para fora do app (ex.: landing depois de excluir a conta, tarefa 022).
// Num módulo próprio para os testes poderem substituí-la (o jsdom não navega).
export function irPara(url) {
  window.location.assign(url);
}
