// Temporário: verifica que a proteção da main bloqueia PR com teste falhando.
describe('CI', () => {
  it('bloqueia o merge quando um teste falha', () => {
    expect(1).toBe(2);
  });
});
