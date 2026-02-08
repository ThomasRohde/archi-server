import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../context/openapi.yaml',
  output: {
    path: 'src/client',
    format: 'prettier',
  },
  plugins: ['@hey-api/types'],
});
