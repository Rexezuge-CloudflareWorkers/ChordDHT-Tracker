import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const apiSrcPath = resolve('apps/api/src');

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
