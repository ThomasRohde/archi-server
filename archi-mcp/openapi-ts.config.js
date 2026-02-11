import { defineConfig } from '@hey-api/openapi-ts';
export default defineConfig({
    input: './openapi.yaml',
    output: {
        path: 'src/client',
        postProcess: ['prettier'],
    },
    plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'],
});
//# sourceMappingURL=openapi-ts.config.js.map