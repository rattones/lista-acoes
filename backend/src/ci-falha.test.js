// Teste propositalmente falhando: confirma que o CI reprova o PR (tarefa 007).
// Será removido no próximo commit.
describe('CI', () => {
  it('reprova o PR quando um teste falha', () => {
    expect(1).toBe(2);
  });
});
