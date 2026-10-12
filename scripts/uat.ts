// Paket UAT lokal (T99). Satu perintah untuk pemilik: pnpm uat, lalu ikuti docs/UAT.md.
//
// Langkah: buat .env dari .env.example jika belum ada (berhenti jika .env masih memakai port lama, T74) →
// periksa Docker → docker compose up (PostgreSQL + MinIO) →
// migrasi → seed admin pertama + 5 gudang + 25 toko + hubungan dan jadwal awal Cibubur, Bali, Bandung (T84; PMS, PMJ, QUEEN,
// MKS, DPM tetap belum terhubung, OD-12) + data master produk, keluarga aroma, pemetaan, alias nama stok (T88) →
// seed UAT: periode sumber Juni–Agustus 2026 dan akun operator Cibubur, Bali, Bandung (T89) → next build →
// next start + worker. Berhenti dengan Ctrl+C. Data tersimpan di volume Docker dan tetap ada saat dijalankan lagi.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";

import { config as muatEnv, parse as parseEnv } from "dotenv";

import {
  isiEnvAwal,
  pesanAplikasiSiap,
  PESAN_DOCKER_MATI,
  PESAN_DOCKER_TIDAK_ADA,
  pesanPortBentrok,
  pesanPortLama,
  portBentrok,
  portLamaDiEnv,
} from "./uat/pesan";

function catat(pesan: string) {
  console.log(`\n[uat] ${pesan}`);
}

function gagal(pesan: string): never {
  console.error(`\n[uat] GAGAL\n${pesan}\n`);
  process.exit(1);
}

/** Menjalankan perintah sampai selesai dengan keluaran tampil di terminal. */
function jalankan(langkah: string, perintah: string, argumen: string[]) {
  catat(langkah);
  const hasil = spawnSync(perintah, argumen, { stdio: "inherit" });
  if (hasil.status !== 0) gagal(`Langkah "${langkah}" gagal (lihat pesan di atas).`);
}

function periksaDocker() {
  const hasil = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (hasil.error) gagal(PESAN_DOCKER_TIDAK_ADA);
  if (hasil.status !== 0) gagal(PESAN_DOCKER_MATI);
}

function siapkanEnv() {
  if (existsSync(".env")) {
    catat("Memakai .env yang sudah ada.");
  } else {
    writeFileSync(".env", isiEnvAwal(readFileSync(".env.example", "utf8"), randomBytes(32).toString("base64")));
    catat("Membuat .env dari .env.example (email dan kata sandi admin pertama ada di berkas itu).");
  }
  // .env dari sebelum T74 masih memakai port lama; pemilik mengubahnya sendiri, .env tidak diubah diam-diam.
  const temuan = portLamaDiEnv(parseEnv(readFileSync(".env", "utf8")));
  if (temuan.length > 0) gagal(pesanPortLama(temuan));
  muatEnv({ path: ".env", quiet: true });
}

function nyalakanLayanan() {
  catat("Menyalakan PostgreSQL dan MinIO (docker compose up)...");
  const hasil = spawnSync("docker", ["compose", "up", "-d", "--wait"], { encoding: "utf8" });
  process.stdout.write(hasil.stdout ?? "");
  process.stderr.write(hasil.stderr ?? "");
  if (hasil.status === 0) return;
  const port = portBentrok(`${hasil.stdout}\n${hasil.stderr}`);
  gagal(port === null ? "docker compose up gagal (lihat pesan di atas)." : pesanPortBentrok(port));
}

function portBebas(port: number): Promise<boolean> {
  return new Promise((selesai) => {
    const server = createServer();
    server.once("error", () => selesai(false));
    server.listen(port, () => server.close(() => selesai(true)));
  });
}

async function tunggu(url: string, nama: string, batasMs: number) {
  const mulai = Date.now();
  while (Date.now() - mulai < batasMs) {
    try {
      if ((await fetch(url, { redirect: "manual" })).ok) return;
    } catch {
      // Layanan belum menerima koneksi.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  gagal(`${nama} tidak siap di ${url} dalam ${batasMs / 1000} detik.`);
}

/** Menjalankan proses yang hidup terus; setiap baris keluarannya diberi awalan nama proses. */
function jalankanTerus(nama: string, argumen: string[]): ChildProcess {
  const proses = spawn("pnpm", argumen, { stdio: ["ignore", "pipe", "pipe"], detached: true });
  const teruskan = (data: Buffer) => {
    for (const baris of data.toString().split("\n")) if (baris.trim() !== "") console.log(`[${nama}] ${baris}`);
  };
  proses.stdout?.on("data", teruskan);
  proses.stderr?.on("data", teruskan);
  return proses;
}

siapkanEnv();
periksaDocker();
const urlAplikasi = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3100");
const portAplikasi = Number(urlAplikasi.port || 3100);
if (!(await portBebas(portAplikasi))) gagal(pesanPortBentrok(portAplikasi));

nyalakanLayanan();
await tunggu(`${process.env.S3_ENDPOINT ?? "http://localhost:59000"}/minio/health/live`, "MinIO", 60_000);
jalankan("Menjalankan migrasi database...", "pnpm", ["db:migrate"]);
jalankan("Membuat admin pertama...", "pnpm", ["db:seed-admin"]);
jalankan(
  "Mengisi 5 gudang, 25 toko, hubungan dan jadwal awal Cibubur, Bali, Bandung, serta data master produk, keluarga aroma, pemetaan, dan alias nama stok...",
  "pnpm",
  ["db:seed-master"],
);
jalankan(
  "Menyiapkan periode sumber Juni–Agustus 2026 dan akun operator Cibubur, Bali, Bandung untuk UAT...",
  "pnpm",
  ["db:seed-uat"],
);
jalankan("Menyiapkan aplikasi (next build, beberapa menit)...", "pnpm", ["build"]);

catat("Menyalakan aplikasi dan worker...");
const daftarProses = [
  jalankanTerus("aplikasi", ["start", "--port", String(portAplikasi)]),
  jalankanTerus("worker", ["worker"]),
];

let berhenti = false;
function hentikanSemua(kode: number) {
  berhenti = true;
  for (const proses of daftarProses) {
    if (proses.pid !== undefined && proses.exitCode === null) process.kill(-proses.pid, "SIGTERM");
  }
  process.exit(kode);
}
process.on("SIGINT", () => hentikanSemua(0));
process.on("SIGTERM", () => hentikanSemua(0));
for (const proses of daftarProses) {
  proses.on("exit", (kode) => {
    if (berhenti) return;
    console.error(`\n[uat] Salah satu proses berhenti (kode ${kode}). Lihat pesan di atas, lalu jalankan pnpm uat lagi.`);
    hentikanSemua(1);
  });
}

await tunggu(`${urlAplikasi.origin}/masuk`, "Aplikasi", 120_000);
console.log(pesanAplikasiSiap({ urlAplikasi: urlAplikasi.origin, emailAdmin: process.env.ADMIN_AWAL_EMAIL }));
