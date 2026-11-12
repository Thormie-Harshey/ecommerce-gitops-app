// Lint rules for all three services: ESLint's recommended checks,
// with Node.js and Jest built-in names allowed.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.jest } },
  },
];
