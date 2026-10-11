// Uji performa PRD C1 (T65) dengan data sintetis 12 bulan, 25 toko, 500 produk (PRD C1 ▶ Keputusan 2026-10-11, T65).
// Jalankan: pnpm perf   (tidak termasuk pnpm verify)
//
// Butuh PostgreSQL dan MinIO yang sama dengan pengembangan lokal (`docker compose up -d`). DATABASE_URL dan S3_* dibaca
// dari .env lalu .env.ci (nilai yang sudah diset tidak ditimpa). Data sintetis ditulis ke database terpisah
// `mandalika_perf` di server yang sama (dibuat ulang setiap kali) dan bucket `mandalika-perf`; database lain tidak disentuh.
//
// Langkah: buat data (impor aktif 12 bulan lewat pembaca sheet + aktivasi, cache laporan, jadwal, periode sumber,
// ranking, draft gudang besar dan kecil) → `next build` + `next start` → masuk sebagai operator → ukur:
//   1. Ringkasan dengan filter 1–12 bulan (p95 per jumlah bulan dan gabungan; target < 1 s).
//   2. Membaca dan memvalidasi satu sheet setelah unggah selesai (handler worker `prosesImpor`; target < 60 s).
//   3. Halaman Pengiriman Gudang satu gudang (p95; target < 1,5 s): ringkasan draft per toko seperti saat halaman dibuka
//      (tanpa `?toko=`), dan sebagai pembanding halaman dengan satu toko dibuka (`?toko=<id>`, T73).
// Waktu halaman = permintaan HTTP sampai seluruh isi respons diterima, berurutan (satu pengguna), setelah pemanasan.
// Pengukuran lokal: database di mesin yang sama, bukan region Singapura (PRD C1); hasil di hosting bisa berbeda (OD-04).
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { config as muatEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { daftarProdukSintetis, namaSheetBulan, sheetPenjualanSintetis, workbookSatuSheet } from "./uji-performa/data-sintetis";
import { persentil } from "./uji-performa/statistik";

muatEnv({ path: ".env", quiet: true });
muatEnv({ path: ".env.ci", quiet: true });

const NAMA_DATABASE = "mandalika_perf";
const BUCKET = "mandalika-perf";
const PORT = 3200;
const URL_DASAR = `http://localhost:${PORT}`;

/** Bulan impor sintetis: 12 bulan berurutan. */
const BULAN_IMPOR = Array.from({ length: 12 }, (_, i) => ({ tahun: i < 3 ? 2025 : 2026, bulan: ((i + 9) % 12) + 1 }));
/** 50 keluarga × 10 varian = 500 produk. */
const JUMLAH_KELUARGA = 50;
/**
 * Gudang yang diukur dan banyaknya toko terhubung. Hubungan toko–gudang yang sebenarnya belum ada (OD-12), jadi diukur
 * gudang besar (20 toko) dan gudang kecil (5 toko); semua toko mengirim pada tanggal draft. Bersama-sama = 25 toko.
 */
const GUDANG_DIUKUR = [
  { nama: "Pusat", jumlahToko: 20 },
  { nama: "Gudang Bali", jumlahToko: 5 },
];
/** Tanggal draft (Senin, Rabu, Senin); draft terakhir dihitung = yang tampil saat halaman dibuka. */
const TANGGAL_DRAFT = ["2026-10-05", "2026-10-07", "2026-10-12"];

const PEMANASAN = 5;
const SAMPEL_RINGKASAN_PER_PERIODE = 20;
const SAMPEL_PENGIRIMAN_PER_GUDANG = 40;

const TARGET = { ringkasanMs: 1000, sheetMs: 60_000, pengirimanMs: 1500 };

const detik = (ms: number) => `${(ms / 1000).toFixed(2).replace(".", ",")} s`;

function catat(pesan: string) {
  console.log(`[perf] ${pesan}`);
}

async function ukur<T>(kerja: () => Promise<T>): Promise<{ hasil: T; ms: number }> {
  const mulai = performance.now();
  const hasil = await kerja();
  return { hasil, ms: performance.now() - mulai };
}

/** Membuat ulang database `mandalika_perf` di server DATABASE_URL lalu menjalankan semua migrasi. */
async function siapkanDatabase(): Promise<string> {
  const asal = process.env.DATABASE_URL;
  if (!asal) throw new Error("DATABASE_URL belum diset (lihat .env.example).");
  const urlAdmin = new URL(asal);
  urlAdmin.pathname = "/postgres";
  const sqlAdmin = postgres(urlAdmin.toString(), { max: 1, onnotice: () => {} });
  try {
    await sqlAdmin.unsafe(`drop database if exists ${NAMA_DATABASE} with (force)`);
    await sqlAdmin.unsafe(`create database ${NAMA_DATABASE}`);
  } finally {
    await sqlAdmin.end();
  }
  const url = new URL(asal);
  url.pathname = `/${NAMA_DATABASE}`;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
  return url.toString();
}

const urlDatabase = await siapkanDatabase();
process.env.DATABASE_URL = urlDatabase;
process.env.S3_BUCKET = BUCKET;
process.env.BETTER_AUTH_URL = URL_DASAR;

// Modul server dimuat setelah DATABASE_URL menunjuk database perf.
const { asc, eq, sql } = await import("drizzle-orm");
const { db } = await import("../src/server/db");
const schema = await import("../src/server/db/schema");
const { auth } = await import("../src/server/auth/auth");
const { seedMasterGudangToko } = await import("../src/server/gudang/seed-master");
const { daftarkanImpor, aktifkanImpor, kunciObjekBaru } = await import("../src/server/impor/impor");
const { buatUrlUnggah, pastikanBucket } = await import("../src/server/impor/penyimpanan");
const { prosesImpor } = await import("../src/server/impor/proses");
const { hitungUlangCacheLaporan } = await import("../src/server/laporan/cache");
const { bulanTersediaUntukPeriode, tetapkanPeriodeSumber } = await import("../src/server/gudang/periode-sumber");
const { gantiJadwalAktif, jadwalDariMasukan } = await import("../src/server/gudang/jadwal");
const { hubungkanTokoKeGudang } = await import("../src/server/gudang/hubungan");
const { hitungDraftRencana } = await import("../src/server/gudang/draft-rencana");
const { tugaskanOperator } = await import("../src/server/gudang/penugasan");
const { daftarHakTindakan } = await import("../src/server/gudang/hak-tindakan");
const { simpanStokToko } = await import("../src/server/gudang/stok-draft");
const { parseTanggalBisnis } = await import("../src/domain/kalender");

// --- Data sintetis ---

/** Operator dengan semua hak tindakan di gudang yang diukur (halaman terberat: isian stok dan form hitung tampil). */
async function buatOperator() {
  const email = "operator-perf@uji.mandalika.test";
  // Sandi acak sekali pakai; hanya hidup di proses ini.
  const sandi = randomBytes(18).toString("base64url");
  const hasil = await auth.api.createUser({ body: { email, password: sandi, name: "Operator Perf", role: "viewer" } });
  return { id: hasil.user.id, email, sandi };
}

/** Mengunggah workbook ke storage seperti browser (presigned PUT) dan mendaftarkannya sebagai impor `diunggah`. */
async function unggahImpor(isi: Buffer, namaSheet: string, tahun: number, bulan: number, idPengguna: string) {
  const kunci = kunciObjekBaru();
  const jawaban = await fetch(await buatUrlUnggah(kunci), { method: "PUT", body: new Uint8Array(isi) });
  if (!jawaban.ok) throw new Error(`Unggah gagal: ${jawaban.status}`);
  const hasil = await daftarkanImpor({ kunci, namaFile: `sintetis-${tahun}-${bulan}.xlsx`, namaSheet, tahunImpor: tahun, bulanImpor: bulan, idPengguna });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  return hasil.idImpor;
}

async function buatData() {
  await pastikanBucket();
  await seedMasterGudangToko();
  // Pengguna yang sama dipakai untuk menyiapkan data; fungsi server di bawah tidak memeriksa peran (pemanggilnya yang memeriksa).
  const pengguna = await buatOperator();
  const daftarToko = await db.select({ id: schema.toko.id, nama: schema.toko.nama }).from(schema.toko).orderBy(asc(schema.toko.id));
  const produk = daftarProdukSintetis(JUMLAH_KELUARGA);

  // Impor aktif 12 bulan; waktu baca + validasi setiap sheet diukur (target 2).
  const waktuSheet: { bulan: string; ms: number; sel: number; ukuranByte: number }[] = [];
  for (const [i, { tahun, bulan }] of BULAN_IMPOR.entries()) {
    const namaSheet = namaSheetBulan(bulan);
    const { baris, jumlahSel } = sheetPenjualanSintetis({ tahun, bulan, toko: daftarToko.map((t) => t.nama), produk, benih: 1000 + i });
    const isi = workbookSatuSheet(namaSheet, baris);
    const idImpor = await unggahImpor(isi, namaSheet, tahun, bulan, pengguna.id);
    const { ms } = await ukur(() => prosesImpor(idImpor));
    const [hasil] = await db.select({ status: schema.impor.status, masalah: schema.impor.masalah }).from(schema.impor).where(eq(schema.impor.id, idImpor));
    if (hasil.status !== "siap-ditinjau" || hasil.masalah.length > 0) {
      throw new Error(`Impor sintetis ${namaSheet} ${tahun}: status ${hasil.status}, ${hasil.masalah.length} masalah.`);
    }
    const aktivasi = await aktifkanImpor(idImpor, pengguna.id);
    if (aktivasi.keadaan !== "berhasil") throw new Error(aktivasi.pesan);
    const kode = `${tahun}-${String(bulan).padStart(2, "0")}`;
    waktuSheet.push({ bulan: kode, ms, sel: jumlahSel, ukuranByte: isi.byteLength });
    catat(`impor ${kode}: ${jumlahSel} sel, ${(isi.byteLength / 1024).toFixed(0)} KB, baca+validasi ${detik(ms)}`);
  }

  const cache = await ukur(() => hitungUlangCacheLaporan());
  catat(`cache laporan dihitung dalam ${detik(cache.ms)}`);

  // Keluarga aroma, pemetaan produk, dan ranking pusat berlaku (buffer draft).
  const keluarga = await db
    .insert(schema.keluargaAroma)
    .values([...new Map(produk.map((p) => [p.keluarga.segmen, p.keluarga])).values()].map((k) => ({ nama: k.nama })))
    .returning({ id: schema.keluargaAroma.id, nama: schema.keluargaAroma.nama });
  const idKeluarga = new Map(keluarga.map((k) => [k.nama, k.id]));
  await db.insert(schema.aliasKeluargaAroma).values(keluarga.map((k) => ({ keluargaId: k.id, alias: k.nama })));
  // Sebagian kecil produk dibiarkan belum dipetakan (menjadi masalah di draft), sisanya terpetakan.
  for (const [i, p] of produk.entries()) {
    if (i % 25 === 0) continue;
    await db
      .update(schema.produk)
      .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: idKeluarga.get(p.keluarga.nama) ?? null })
      .where(eq(schema.produk.kode, p.kode));
  }
  const [ranking] = await db
    .insert(schema.versiRanking)
    .values({
      bulanRanking: "2026-09",
      versi: 1,
      namaFile: "ranking-sintetis.xlsx",
      ukuranByte: 0,
      kunciObjek: `ranking/${randomUUID()}`,
      status: "dipublikasikan",
      diunggahOleh: pengguna.id,
      dipublikasikanOleh: pengguna.id,
      dipublikasikanPada: new Date(),
    })
    .returning({ id: schema.versiRanking.id });
  await db
    .insert(schema.barisRanking)
    .values(keluarga.map((k, i) => ({ versiId: ranking.id, rank: i + 1, variant: k.nama, qtySales: 1000 - i, keluargaAromaId: k.id })));

  // Gudang diukur: toko terhubung, jadwal 3× seminggu Senin/Rabu/Jumat (H−1), periode sumber = 12 bulan impor, operator
  // dengan semua hak tindakan.
  const jadwal = jadwalDariMasukan({
    pola: "3x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H-1" },
      { hari: "Rabu", persiapan: "H-1" },
      { hari: "Jumat", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  if (!("jadwal" in jadwal)) throw new Error(jadwal.pesan);
  await db.transaction(async (tx) => {
    for (const t of daftarToko) await gantiJadwalAktif(tx, { idToko: t.id, baru: jadwal.jadwal, idPengguna: pengguna.id });
  });
  const bulanImpor = new Set(BULAN_IMPOR.map(({ tahun, bulan }) => `${tahun}-${String(bulan).padStart(2, "0")}`));
  const bulanPeriode = (await bulanTersediaUntukPeriode()).filter((b) => bulanImpor.has(b));

  const gudangDiukur: { id: number; nama: string; jumlahToko: number; jumlahBaris: number; idTokoDibuka: number }[] = [];
  let tokoBerikutnya = 0;
  for (const { nama, jumlahToko } of GUDANG_DIUKUR) {
    const [gudang] = await db.select({ id: schema.gudang.id }).from(schema.gudang).where(eq(schema.gudang.nama, nama));
    const tokoGudang = daftarToko.slice(tokoBerikutnya, tokoBerikutnya + jumlahToko);
    tokoBerikutnya += jumlahToko;
    const hubungan = await hubungkanTokoKeGudang(gudang.id, tokoGudang.map((t) => t.id));
    if (hubungan.keadaan !== "berhasil") throw new Error(`Hubungan toko–gudang gagal: ${JSON.stringify(hubungan)}`);
    const penugasan = await tugaskanOperator({ idPengguna: pengguna.id, idGudang: gudang.id, hakTindakan: [...daftarHakTindakan] });
    if (penugasan.keadaan !== "berhasil") throw new Error(penugasan.pesan);
    const periode = await tetapkanPeriodeSumber({ idGudang: gudang.id, bulan: bulanPeriode, idPengguna: pengguna.id });
    if (periode.keadaan !== "berhasil") throw new Error(periode.pesan);

    // Draft gudang; stok akhir diisi untuk ±90% baris lewat jalur simpan stok yang sama dengan operator.
    let jumlahBaris = 0;
    for (const tanggal of TANGGAL_DRAFT) {
      const tanggalKirim = parseTanggalBisnis(tanggal);
      const draft = await ukur(() => hitungDraftRencana({ idGudang: gudang.id, tanggalKirim, idPengguna: pengguna.id }));
      if (draft.hasil.keadaan !== "berhasil") throw new Error(draft.hasil.pesan);
      const baris = await db
        .select({ tokoId: schema.tokoDraftRencana.tokoId, kodeProduk: schema.barisDraftRencana.kodeProduk })
        .from(schema.barisDraftRencana)
        .innerJoin(schema.tokoDraftRencana, eq(schema.tokoDraftRencana.id, schema.barisDraftRencana.tokoDraftId))
        .where(eq(schema.tokoDraftRencana.draftId, draft.hasil.idDraft));
      for (const t of tokoGudang) {
        const stok = baris
          .filter((b) => b.tokoId === t.id)
          .flatMap((b, i) => (i % 10 === 9 ? [] : [{ kodeProduk: b.kodeProduk, stokAkhir: i % 7 }]));
        if (stok.length === 0) continue;
        const simpan = await simpanStokToko({ idGudang: gudang.id, tanggalKirim, tokoId: t.id, stok });
        if (simpan.keadaan !== "berhasil") throw new Error(simpan.pesan);
      }
      jumlahBaris = baris.length;
      catat(`draft ${nama} ${tanggal}: ${baris.length} baris, dihitung dalam ${detik(draft.ms)}`);
    }
    gudangDiukur.push({ id: gudang.id, nama, jumlahToko, jumlahBaris, idTokoDibuka: tokoGudang[0].id });
  }

  const [{ jumlahSel }] = await db.select({ jumlahSel: sql<number>`count(*)::int` }).from(schema.selPenjualan);
  const [{ jumlahCache }] = await db
    .select({ jumlahCache: sql<number>`count(*)::int` })
    .from(schema.cacheRataRataBulanan);
  catat(`total: ${jumlahSel} sel penjualan aktif, ${jumlahCache} baris cache rata-rata bulanan, bulan laporan ${bulanPeriode.join(", ")}`);
  return { pengguna, gudangDiukur, bulanTersedia: bulanPeriode, waktuSheet };
}

// --- Server Next.js ---

function jalankan(perintah: string, argumen: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(perintah, argumen, { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
}

function hentikan(proses: ChildProcess) {
  if (proses.pid !== undefined && proses.exitCode === null) process.kill(-proses.pid, "SIGTERM");
}

function tungguSelesai(proses: ChildProcess, nama: string): Promise<void> {
  let keluaran = "";
  proses.stdout?.on("data", (d: Buffer) => (keluaran += d.toString()));
  proses.stderr?.on("data", (d: Buffer) => (keluaran += d.toString()));
  return new Promise((selesai, gagal) => {
    proses.on("exit", (kode) => (kode === 0 ? selesai() : gagal(new Error(`${nama} gagal (kode ${kode}):\n${keluaran}`))));
  });
}

async function tungguSiap(url: string, batasMs: number) {
  const mulai = performance.now();
  while (performance.now() - mulai < batasMs) {
    try {
      if ((await fetch(url, { redirect: "manual" })).ok) return;
    } catch {
      // Server belum menerima koneksi.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server tidak siap di ${url} dalam ${batasMs} ms.`);
}

async function masuk(email: string, sandi: string): Promise<string> {
  const jawaban = await fetch(`${URL_DASAR}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: URL_DASAR },
    body: JSON.stringify({ email, password: sandi }),
  });
  if (!jawaban.ok) throw new Error(`Masuk gagal: ${jawaban.status} ${await jawaban.text()}`);
  return jawaban.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Satu permintaan halaman sampai seluruh isi diterima; gagal bila bukan 200 atau penanda isi tidak ada. */
async function bukaHalaman(jalur: string, cookie: string, penanda: string): Promise<number> {
  const mulai = performance.now();
  const jawaban = await fetch(`${URL_DASAR}${jalur}`, { headers: { cookie }, redirect: "manual" });
  const isi = await jawaban.text();
  const ms = performance.now() - mulai;
  if (jawaban.status !== 200 || !isi.includes(penanda)) {
    throw new Error(`Halaman ${jalur} tidak terbuka dengan benar (status ${jawaban.status}, penanda "${penanda}").`);
  }
  return ms;
}

async function sampelHalaman(jalur: string, cookie: string, penanda: string, jumlah: number) {
  for (let i = 0; i < PEMANASAN; i++) await bukaHalaman(jalur, cookie, penanda);
  const sampel: number[] = [];
  for (let i = 0; i < jumlah; i++) sampel.push(await bukaHalaman(jalur, cookie, penanda));
  return sampel;
}

// --- Jalankan ---

const mulaiTotal = performance.now();
catat(`database ${NAMA_DATABASE}, bucket ${BUCKET}`);
const data = await buatData();
// Statistik planner dan visibility map diperbarui sekarang, agar autovacuum atas ratusan ribu baris baru tidak berjalan di
// tengah pengukuran (keadaan database produksi yang sudah stabil). Tanpa worker paralel: /dev/shm container PostgreSQL
// bawaan Docker hanya 64 MB.
await db.execute(sql`vacuum (analyze, parallel 0)`);
await db.$client.end();

// DATABASE_URL, S3_BUCKET, dan BETTER_AUTH_URL di process.env sudah menunjuk data perf (lihat atas).
const envServer = { ...process.env };
catat("next build …");
await tungguSelesai(jalankan("pnpm", ["build"], envServer), "next build");
const server = jalankan("pnpm", ["start", "--port", String(PORT)], envServer);
let kodeKeluar = 1;
try {
  await tungguSiap(`${URL_DASAR}/masuk`, 60_000);
  const cookie = await masuk(data.pengguna.email, data.pengguna.sandi);

  // 1. Ringkasan: filter 1–12 bulan terakhir, halaman pertama tabel.
  const ringkasanPerPeriode: { jumlahBulan: number; sampel: number[] }[] = [];
  for (let jumlahBulan = 1; jumlahBulan <= 12; jumlahBulan++) {
    const parameter = new URLSearchParams(data.bulanTersedia.slice(-jumlahBulan).map((b) => ["bulan", b]));
    const sampel = await sampelHalaman(`/ringkasan?${parameter}`, cookie, 'data-kategori="Senin–Kamis"', SAMPEL_RINGKASAN_PER_PERIODE);
    ringkasanPerPeriode.push({ jumlahBulan, sampel });
    catat(`Ringkasan ${jumlahBulan} bulan: p50 ${detik(persentil(sampel, 50))}, p95 ${detik(persentil(sampel, 95))}`);
  }

  // 3. Pengiriman Gudang satu gudang (draft terakhir dihitung tampil): ringkasan per toko seperti saat halaman dibuka, lalu
  // satu toko dibuka (`?toko=`, T73). Penanda: baris ringkasan toko pertama / baris draft produk pertama toko itu.
  const pengiriman: { nama: string; jumlahToko: number; jumlahBaris: number; tampilan: string; sampel: number[] }[] = [];
  for (const g of data.gudangDiukur) {
    const tampilan = [
      { nama: "ringkasan per toko", jalur: `/pengiriman-gudang/${g.id}`, penanda: `data-ringkasan-toko="${g.idTokoDibuka}"` },
      { nama: "satu toko dibuka", jalur: `/pengiriman-gudang/${g.id}?toko=${g.idTokoDibuka}`, penanda: 'data-kode-produk="15GL-A01"' },
    ];
    for (const t of tampilan) {
      const sampel = await sampelHalaman(t.jalur, cookie, t.penanda, SAMPEL_PENGIRIMAN_PER_GUDANG);
      pengiriman.push({ ...g, tampilan: t.nama, sampel });
      catat(`Pengiriman Gudang ${g.nama} (${g.jumlahToko} toko, ${g.jumlahBaris} baris draft), ${t.nama}: p50 ${detik(persentil(sampel, 50))}, p95 ${detik(persentil(sampel, 95))}`);
    }
  }

  const ringkasanGabungan = ringkasanPerPeriode.flatMap((r) => r.sampel);
  const p95Ringkasan = persentil(ringkasanGabungan, 95);
  const p95RingkasanTerburuk = Math.max(...ringkasanPerPeriode.map((r) => persentil(r.sampel, 95)));
  const sheetTerlama = Math.max(...data.waktuSheet.map((w) => w.ms));
  const hasil = [
    {
      kegiatan: "Membuka halaman laporan (Ringkasan), filter 1–12 bulan",
      terukur: `p95 ${detik(p95Ringkasan)} gabungan (${ringkasanGabungan.length} sampel); p95 terburuk per jumlah bulan ${detik(p95RingkasanTerburuk)}`,
      target: "p95 < 1 detik",
      tercapai: p95RingkasanTerburuk < TARGET.ringkasanMs,
    },
    {
      kegiatan: "Membaca dan memvalidasi satu sheet penjualan setelah unggah selesai",
      terukur: `terlama ${detik(sheetTerlama)} dari ${data.waktuSheet.length} sheet`,
      target: "< 60 detik",
      tercapai: sheetTerlama < TARGET.sheetMs,
    },
    ...pengiriman.map((g) => ({
      kegiatan: `Membuka halaman Pengiriman Gudang untuk satu gudang: ${g.nama}, ${g.jumlahToko} toko, ${g.jumlahBaris} baris draft — ${g.tampilan}`,
      terukur: `p95 ${detik(persentil(g.sampel, 95))} (${g.sampel.length} sampel)`,
      target: "p95 < 1,5 detik",
      tercapai: persentil(g.sampel, 95) < TARGET.pengirimanMs,
    })),
  ];

  console.log("\n## Hasil uji performa PRD C1 (pnpm perf)\n");
  console.log("| Kegiatan | Terukur | Target | Status |");
  console.log("|---|---|---|---|");
  for (const h of hasil) console.log(`| ${h.kegiatan} | ${h.terukur} | ${h.target} | ${h.tercapai ? "Tercapai" : "TIDAK tercapai"} |`);
  console.log(
    `\nData: ${BULAN_IMPOR.length} bulan impor aktif, 25 toko, ${JUMLAH_KELUARGA * 10} produk. Halaman dibuka sebagai operator dengan semua hak tindakan.`,
  );
  console.log("Catatan: diukur di mesin lokal (server web dan database di mesin yang sama), bukan region Singapura (PRD C1, OD-04).");
  console.log(`Durasi total ${detik(performance.now() - mulaiTotal)}.`);
  kodeKeluar = hasil.every((h) => h.tercapai) ? 0 : 1;
} finally {
  hentikan(server);
}
process.exit(kodeKeluar);
