import { defineConfig, devices } from '@playwright/test';

/**
 * Testes E2E. O Playwright sobe a API (SQLite exclusivo de E2E, recriado a cada
 * execução e populado com `popular_carga`) e o Vite.
 *   npm run e2e
 */
const isWin = process.platform === 'win32';
const python = process.env.PYTHON ?? (isWin ? '..\\backend\\venv\\Scripts\\python.exe' : '../backend/venv/bin/python');
const apiEnv = {
  DATABASE_URL: 'sqlite:///e2e.sqlite3',
  DJANGO_DEBUG: 'true',
  LOG_LEVEL: 'WARNING',
  // A suíte faz muitos logins e reservas a partir do mesmo IP: limites folgados
  LIMITE_LOGIN: '1000/min',
  LIMITE_RESERVA_PUBLICA: '1000/hour',
  LIMITE_PUBLICO: '5000/min',
};
const manage = `${python} ../backend/manage.py`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `${manage} migrate -v0 && ${manage} popular_carga --empresas 1 --historico 40 && ${manage} runserver 8000 --noreload`,
      url: 'http://localhost:8000/api/v1/health/',
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
