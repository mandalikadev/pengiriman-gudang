// Bagian murni `pnpm uat` (T99): isi .env awal dan pesan kegagalan yang bisa dipahami pemilik.

/**
 * Isi .env awal untuk UAT lokal dari .env.example: semua nilai contoh dipakai apa adanya (cocok dengan
 * docker-compose.yml), kecuali `BETTER_AUTH_SECRET` yang diganti rahasia acak.
 */
export function isiEnvAwal(contohEnv: string, rahasiaAcak: string): string {
  if (!/^BETTER_AUTH_SECRET=/m.test(contohEnv)) throw new Error(".env.example tidak memuat BETTER_AUTH_SECRET.");
  return contohEnv.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${rahasiaAcak}`);
}

/**
 * Port yang ditolak Docker karena sudah dipakai program lain, dibaca dari keluaran `docker compose up`.
 * Contoh pesan Docker: "Bind for 0.0.0.0:5432 failed: port is already allocated" dan
 * "failed to bind host port for 0.0.0.0:5432:172.18.0.2:5432/tcp: address already in use".
 * Mengembalikan `null` jika kegagalannya bukan bentrok port.
 */
export function portBentrok(keluaranCompose: string): number | null {
  const cocok =
    /Bind for [^\s]*:(\d+) failed: port is already allocated/.exec(keluaranCompose) ??
    /host port for [^\s]*?:(\d+):[^\s]*: address already in use/.exec(keluaranCompose) ??
    /listen tcp[^\s]* [^\s]*:(\d+): bind: address already in use/.exec(keluaranCompose);
  return cocok ? Number(cocok[1]) : null;
}

/** Pesan untuk pemilik saat sebuah port yang dibutuhkan sudah dipakai program lain. */
export function pesanPortBentrok(port: number): string {
  return [
    `Port ${port} sudah dipakai program lain di laptop ini, jadi pnpm uat tidak bisa memakainya.`,
    `Hentikan program yang memakai port ${port} (misalnya PostgreSQL atau aplikasi lain yang sedang berjalan),`,
    "lalu jalankan pnpm uat lagi. Lihat docs/UAT.md bagian \"Jika ada masalah saat menyalakan\".",
  ].join("\n");
}

export const PESAN_DOCKER_MATI = [
  "Docker belum menyala.",
  "Buka Docker Desktop, tunggu sampai statusnya \"running\", lalu jalankan pnpm uat lagi.",
].join("\n");

export const PESAN_DOCKER_TIDAK_ADA = [
  "Perintah docker tidak ditemukan.",
  "Pasang Docker Desktop terlebih dahulu (https://www.docker.com/products/docker-desktop/), lalu jalankan pnpm uat lagi.",
].join("\n");
