// Decorators de parâmetro (tarefa 011): o Babel converte @Dec() em parâmetro no equivalente
// ao __param do TypeScript, chamando dec(alvo, chave, índice) depois que a classe existe.
const chamadas = [];
// Usado só em decorators de parâmetro, que a análise de escopo do ESLint não enxerga.
// eslint-disable-next-line no-unused-vars
const registrar = (nome) => (alvo, chave, indice) => {
  chamadas.push({ nome, alvo, chave, indice });
};
const daClasse = (nome) => (alvo) => {
  chamadas.push({ nome, alvo });
};

@daClasse('classe')
class ComDecorators {
  constructor(@registrar('construtor') dependencia) {
    this.dependencia = dependencia;
  }

  @daClasse('metodo')
  metodo(@registrar('m0') a, b, @registrar('m2') c) {
    return [a, b, c];
  }
}

class SemDecoratorDeClasse {
  outro(@registrar('outro') valor) {
    return valor;
  }
}

describe('decorators de parâmetro', () => {
  const chamada = (nome) => chamadas.find((c) => c.nome === nome);

  it('em método recebem o protótipo, o nome do método e o índice', () => {
    expect(chamada('m0')).toEqual({
      nome: 'm0',
      alvo: ComDecorators.prototype,
      chave: 'metodo',
      indice: 0,
    });
    expect(chamada('m2')).toMatchObject({
      alvo: ComDecorators.prototype,
      chave: 'metodo',
      indice: 2,
    });
    expect(chamada('outro')).toMatchObject({
      alvo: SemDecoratorDeClasse.prototype,
      chave: 'outro',
      indice: 0,
    });
  });

  it('no construtor recebem a classe, chave undefined e o índice', () => {
    expect(chamada('construtor')).toEqual({
      nome: 'construtor',
      alvo: ComDecorators,
      chave: undefined,
      indice: 0,
    });
  });

  it('não alteram o comportamento da classe nem os outros decorators', () => {
    expect(new ComDecorators('x').dependencia).toBe('x');
    expect(new ComDecorators().metodo(1, 2, 3)).toEqual([1, 2, 3]);
    expect(chamada('classe').alvo).toBe(ComDecorators);
    expect(new SemDecoratorDeClasse().outro(5)).toBe(5);
  });
});
