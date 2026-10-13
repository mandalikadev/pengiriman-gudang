import { defineConfig, devices } from "@playwright/test";
import { config as muatEnv } from "dotenv";

// Test end-to-end memakai database dan storage test yang sama dengan Vitest (.env.ci; CI sudah memuatnya).
muatEnv({ path: ".env.ci", quiet: true });

const PORT = 3100;
const URL_DASAR = `http://localhost:${PORT}`;
// Better Auth memeriksa origin permintaan terhadap BETTER_AUTH_URL.
process.env.BETTER_AUTH_URL = URL_DASAR;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "list" : "line",
  use: { baseURL: URL_DASAR, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Playwright menyalakan webServer berurutan dan baru menjalankan globalSetup setelah semuanya siap. Database test
  // dibuat ulang di awal webServer pertama agar Next dan worker (webServer kedua) tersambung ke database yang sudah
  // final; membuat ulang setelahnya memutus koneksi worker dan menghapus skema pg-boss.
  webServer: [
    {
      command: `tsx tests/e2e/siapkan.ts && pnpm build && pnpm start --port ${PORT}`,
      url: `${URL_DASAR}/masuk`,
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: "pnpm worker",
      wait: { stdout: /Worker impor siap/ },
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
  ],
});
