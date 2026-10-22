import { defineConfig } from 'vitest/config';

// Testes unitários ficam em src/; os E2E (Playwright) em e2e/ rodam com `npm run e2e`.
// Testes de componente (.tsx) declaram `// @vitest-environment jsdom` no topo.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
