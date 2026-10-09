import { config as muatEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Variabel test dari .env.ci (CI sudah memuatnya; lokal dimuat di sini). Nilai yang sudah diset tidak ditimpa.
muatEnv({ path: fileURLToPath(new URL("./.env.ci", import.meta.url)), quiet: true });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    globalSetup: ["./tests/siapkan-database.ts"],
    // Berkas test berjalan berurutan: test "minimal satu admin aktif" menonaktifkan admin lain di database test,
    // dan itu tidak boleh mengenai pengguna uji milik berkas lain yang sedang berjalan.
    fileParallelism: false,
  },
});
