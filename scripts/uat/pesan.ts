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

/** Variabel .env yang masih memakai port lokal lama (sebelum T74), beserta port baru penggantinya. */
interface PortLama {
  variabel: string;
  portLama: number;
  portBaru: number;
}

/**
 * Port lokal lama per variabel .env dan port baru khusus proyek (T74). `portBawaan` dipakai jika URL tidak menulis
 * port; PostgreSQL tanpa port berarti 5432.
 */
const ATURAN_PORT = [
  { variabel: "DATABASE_URL", lama: [5432], baru: 55432, portBawaan: 5432 },
  { variabel: "S3_ENDPOINT", lama: [9000, 9001], baru: 59000, portBawaan: null },
  { variabel: "BETTER_AUTH_URL", lama: [3000], baru: 3100, portBawaan: null },
] as const;

/** Mencari variabel .env yang masih memakai port lama (5432, 9000, 9001, 3000). Nilai yang bukan URL dilewati. */
export function portLamaDiEnv(env: Record<string, string | undefined>): PortLama[] {
  const temuan: PortLama[] = [];
  for (const aturan of ATURAN_PORT) {
    const nilai = env[aturan.variabel];
    if (nilai === undefined || !URL.canParse(nilai)) continue;
    const tertulis = new URL(nilai).port;
    const port = tertulis === "" ? aturan.portBawaan : Number(tertulis);
    if (port !== null && (aturan.lama as readonly number[]).includes(port)) {
      temuan.push({ variabel: aturan.variabel, portLama: port, portBaru: aturan.baru });
    }
  }
  return temuan;
}

/** Pesan untuk pemilik saat .env masih memakai port lama: port mana yang lama dan apa yang harus diubah. */
export function pesanPortLama(temuan: PortLama[]): string {
  return [
    "Berkas .env masih memakai port lama. Proyek ini sekarang memakai port sendiri supaya tidak bentrok dengan",
    "proyek lain: PostgreSQL 55432, MinIO 59000 (konsol 59001), aplikasi 3100.",
    "",
    "Ubah baris berikut di berkas .env:",
    ...temuan.map((t) => `- ${t.variabel} memakai port lama ${t.portLama}, ganti menjadi ${t.portBaru}.`),
    "",
    "Contoh nilai yang benar ada di .env.example. pnpm uat tidak mengubah .env sendiri.",
    "Setelah .env diubah, jalankan pnpm uat lagi.",
  ].join("\n");
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
