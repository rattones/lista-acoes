import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import babelParser from '@babel/eslint-parser';
import pluginVue from 'eslint-plugin-vue';

export default [
  {
    ignores: ['**/node_modules/', '**/dist/', '**/build/', '**/coverage/'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  // Backend: NestJS com decorators, transpilado pelo Babel.
  {
    files: ['backend/src/**/*.js', 'backend/test/**/*.js'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        babelOptions: { configFile: './backend/babel.config.js' },
      },
    },
    rules: {
      // A análise de escopo não enxerga identificadores usados só em decorators de
      // parâmetro (@Body(), @Query()...): os decorators de parâmetro do Nest são ignorados.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(Body|Query|Param|Headers|Req|Res|Ip|Inject|Optional|Session)$' },
      ],
    },
  },
  {
    files: ['backend/**/*.test.js', 'backend/test/**/*.js'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    files: ['backend/babel.config.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
  // Frontend: Vue 3 (app) e landing page, executados no navegador.
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['frontend/app/**/*.{js,vue}', 'frontend/landing/**/*.js', 'frontend/test/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  prettier,
];
