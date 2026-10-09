import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * globalSetup vitest: membuat database test jika belum ada (lokal), lalu menjalankan semua migrasi Drizzle.
 * Test yang memakai database membuat datanya sendiri dengan email unik, jadi tidak perlu mengosongkan tabel.
 */
export default async function siapkanDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset untuk test (lihat .env.ci).");

  const target = new URL(url);
  const namaDatabase = target.pathname.slice(1);
  const urlAdmin = new URL(url);
  urlAdmin.pathname = "/postgres";
  const sqlAdmin = postgres(urlAdmin.toString(), { max: 1, onnotice: () => {} });
  try {
    const ada = await sqlAdmin`select 1 from pg_database where datname = ${namaDatabase}`;
    if (ada.length === 0) await sqlAdmin.unsafe(`create database "${namaDatabase.replaceAll('"', '""')}"`);
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
