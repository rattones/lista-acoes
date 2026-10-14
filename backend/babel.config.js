// Decorators de parâmetro, no formato do __param do TypeScript. Substitui o
// babel-plugin-parameter-decorator, que gera dec(_class.prototype, ...) antes de _class existir.
// Converte cada @Dec() em parâmetro em um decorator legado equivalente:
//   - de método:    (alvo, chave) => Dec()(alvo, chave, índice)
//   - do construtor: decorator da classe (alvo) => Dec()(alvo, undefined, índice)
// Precisa vir antes do plugin de decorators, que transforma a classe inteira.
function decoratorsDeParametro({ types: t }) {
  const envolver = (decorador, indice, doConstrutor) => {
    const alvo = t.identifier('alvo');
    const chave = t.identifier('chave');
    const chamada = t.callExpression(decorador.expression, [
      alvo,
      doConstrutor ? t.identifier('undefined') : chave,
      t.numericLiteral(indice),
    ]);
    return t.decorator(t.arrowFunctionExpression(doConstrutor ? [alvo] : [alvo, chave], chamada));
  };

  return {
    visitor: {
      Class(path) {
        const classe = path.node;
        for (const membro of classe.body.body) {
          if (membro.type !== 'ClassMethod') continue;
          const doConstrutor = membro.kind === 'constructor';
          const novos = [];
          membro.params.forEach((param, indice) => {
            for (const decorador of param.decorators ?? []) {
              novos.push(envolver(decorador, indice, doConstrutor));
            }
            param.decorators = null;
          });
          if (novos.length === 0) continue;
          const dono = doConstrutor ? classe : membro;
          dono.decorators = [...(dono.decorators ?? []), ...novos];
        }
      },
    },
  };
}

// Nest em JavaScript: decorators legados (semântica do TypeScript) e decorators de parâmetro.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: [decoratorsDeParametro, ['@babel/plugin-proposal-decorators', { legacy: true }]],
};
