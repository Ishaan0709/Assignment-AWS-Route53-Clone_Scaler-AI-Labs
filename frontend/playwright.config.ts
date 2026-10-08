import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 3000);
const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 8000);
const baseURL = `http://localhost:${frontendPort}`;

/**
 * Backend command. Locally this defaults to the venv interpreter on Windows or
 * `python` elsewhere; override with E2E_BACKEND_COMMAND when needed.
 */
const backendCommand =
  process.env.E2E_BACKEND_COMMAND ??
  (process.platform === "win32"
    ? `.venv\\Scripts\\python -m uvicorn app.main:app --port ${backendPort}`
    : `python -m uvicorn app.main:app --port ${backendPort}`);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: backendCommand,
      cwd: "../backend",
      url: `http://localhost:${backendPort}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: { DATABASE_URL: "sqlite:///./e2e.db", SEED_ON_STARTUP: "true" },
    },
    {
      command: isCI
        ? `npm run start -- --port ${frontendPort}`
        : `npm run dev -- --port ${frontendPort}`,
      url: baseURL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: { API_URL: `http://localhost:${backendPort}` },
    },
  ],
});
