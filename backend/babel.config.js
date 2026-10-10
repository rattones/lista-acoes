// Nest em JavaScript: decorators legados (semântica do TypeScript) e decorators de parâmetro.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    'babel-plugin-parameter-decorator',
  ],
};
