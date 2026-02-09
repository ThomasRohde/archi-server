import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi.yaml',
  output: {
    path: 'src/client',
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript'],
});
