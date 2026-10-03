import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.{mjs,jsx}'], environment: 'node' } });
