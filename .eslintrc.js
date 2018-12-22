module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ['airbnb-base', 'plugin:node/recommended', 'plugin:prettier/recommended'],
  rules: {
    'prettier/prettier': [
      'error',
      {},
      {
        usePrettierrc: true,
      },
    ],
    'no-console': 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': 'off',
  },
};
