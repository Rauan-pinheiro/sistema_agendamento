import { defineConfig } from 'vitest/config';

// Testes unitários ficam em src/; os E2E (Playwright) em e2e/ rodam com `npm run e2e`.
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
