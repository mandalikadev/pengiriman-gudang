import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * globalSetup vitest (dan skrip persiapan e2e `tests/e2e/siapkan.ts`): membuat ulang database test dari kosong, lalu menjalankan semua migrasi Drizzle.
 * Setiap putaran mulai dari keadaan yang sama dengan CI, jadi data putaran lokal sebelumnya (mis. impor aktif yang
 * menumpuk) tidak memperlambat test. Test membuat datanya sendiri, termasuk master gudang/toko.
 * Hanya database yang namanya berakhiran `_test` yang boleh dihapus.
 */
export default async function siapkanDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset untuk test (lihat .env.ci).");

  const target = new URL(url);
  const namaDatabase = decodeURIComponent(target.pathname.slice(1));
  if (!namaDatabase.endsWith("_test")) {
    throw new Error(
      `Database test harus bernama *_test agar aman dibuat ulang, tetapi DATABASE_URL menunjuk "${namaDatabase}".`,
    );
  }

  const urlAdmin = new URL(url);
  urlAdmin.pathname = "/postgres";
  const sqlAdmin = postgres(urlAdmin.toString(), { max: 1, onnotice: () => {} });
  try {
    const nama = `"${namaDatabase.replaceAll('"', '""')}"`;
    await sqlAdmin.unsafe(`drop database if exists ${nama} with (force)`);
    await sqlAdmin.unsafe(`create database ${nama}`);
  } finally {
    await sqlAdmin.end();
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
}
