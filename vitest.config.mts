import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const apiSrcPath = fileURLToPath(new URL('./apps/api/src', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: `${apiSrcPath}/` }],
  },
});
