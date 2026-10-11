// Skema Drizzle. Tabel bisnis ditambahkan oleh tiket yang membutuhkannya.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  type AnyPgColumn,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { daftarKategoriDasar, type KategoriDasar } from "@/domain/kalender";
import { daftarJenisLibur, type JenisLibur } from "@/domain/libur";
import type { ErrorRanking } from "@/domain/ranking";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { daftarPolaJadwal, type HariKirim, type PolaJadwal } from "@/server/gudang/pilihan-jadwal";
import type { MasalahBarisDraft } from "@/server/gudang/masalah-draft";
import type { RincianBarisDraft, TanggalCakupanDraft } from "@/server/gudang/rincian-draft";
import type { Masalah, ProdukSheet } from "@/server/impor/sheet-penjualan";

// --- Autentikasi (Better Auth + plugin admin, T20) ---
// Nama tabel dan field mengikuti model bawaan Better Auth agar adapter Drizzle tidak perlu pemetaan.
// `role` berisi peran global: "admin" atau "viewer". Status operator bukan peran global (T22).
// `banned` = pengguna dinonaktifkan.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (tabel) => [index("session_user_id_idx").on(tabel.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("account_user_id_idx").on(tabel.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("verification_identifier_idx").on(tabel.identifier)],
);

// --- Gudang dan toko (T21) ---

/** Lima gudang (PRD A3, OD-02). Diisi oleh seed master; tidak ada UI untuk menambah atau mengubahnya. */
export const gudang = pgTable("gudang", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nama: text("nama").notNull().unique(),
});

/** Master toko: nama sesuai blok toko di sheet penjualan. */
export const toko = pgTable("toko", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nama: text("nama").notNull().unique(),
  aktif: boolean("aktif").notNull().default(true),
});

/**
 * Hubungan toko–gudang. ADR-0009 (OD-03): satu toko terhubung ke paling banyak satu gudang,
 * ditegakkan database lewat primary key `toko_id`. Toko yang belum terhubung tidak punya baris.
 */
export const hubunganTokoGudang = pgTable(
  "hubungan_toko_gudang",
  {
    tokoId: integer("toko_id")
      .primaryKey()
      .references(() => toko.id),
    gudangId: integer("gudang_id")
      .notNull()
      .references(() => gudang.id),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("hubungan_toko_gudang_gudang_id_idx").on(tabel.gudangId)],
);

// --- Penugasan operator (T22) ---

/**
 * Penugasan operator: satu baris per pengguna per gudang, berisi daftar hak tindakannya.
 * Pengguna menjadi operator gudang hanya lewat baris ini; peran global (admin/viewer) tidak memberi hak operator.
 */
export const penugasanOperator = pgTable(
  "penugasan_operator",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gudangId: integer("gudang_id")
      .notNull()
      .references(() => gudang.id),
    hakTindakan: text("hak_tindakan").array().$type<HakTindakan[]>().notNull().default(sql`'{}'::text[]`),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [
    primaryKey({ columns: [tabel.userId, tabel.gudangId] }),
    index("penugasan_operator_gudang_id_idx").on(tabel.gudangId),
    check(
      "penugasan_operator_hak_tindakan_dikenal",
      sql`${tabel.hakTindakan} <@ ARRAY[${sql.raw(daftarHakTindakan.map((h) => `'${h}'`).join(", "))}]::text[]`,
    ),
  ],
);

// --- Impor penjualan (T11) ---

/** diunggah → diproses → siap-ditinjau / gagal → aktif → diarsipkan (issue T11). */
export const daftarStatusImpor = ["diunggah", "diproses", "siap-ditinjau", "gagal", "aktif", "diarsipkan"] as const;
export type StatusImpor = (typeof daftarStatusImpor)[number];

const daftarSql = (nilai: readonly string[]) => sql.raw(nilai.map((n) => `'${n}'`).join(", "));

/**
 * Satu pembacaan satu sheet dari satu file (CONTEXT "Impor"). Hasil validasi (`masalah`) dan produk di sheet
 * disimpan sebagai JSONB; sel dan cakupan tanggal di tabel tersendiri dengan kunci `impor_id` (staging).
 * ADR-0002: hanya satu impor aktif per bulan impor, ditegakkan unique index parsial.
 */
export const impor = pgTable(
  "impor",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    namaFile: text("nama_file").notNull(),
    ukuranByte: bigint("ukuran_byte", { mode: "number" }).notNull(),
    kunciObjek: text("kunci_objek").notNull().unique(),
    /** SHA-256 isi file (hex), dihitung worker dari objek di storage. */
    sha256: text("sha256"),
    namaSheet: text("nama_sheet").notNull(),
    tahunImpor: integer("tahun_impor").notNull(),
    bulanImpor: integer("bulan_impor").notNull(),
    status: text("status").$type<StatusImpor>().notNull().default("diunggah"),
    masalah: jsonb("masalah").$type<Masalah[]>().notNull().default([]),
    produk: jsonb("produk").$type<ProdukSheet[]>().notNull().default([]),
    pesanGagal: text("pesan_gagal"),
    diunggahOleh: text("diunggah_oleh")
      .notNull()
      .references(() => user.id),
    diunggahPada: timestamp("diunggah_pada", { withTimezone: true }).notNull().defaultNow(),
    selesaiDiprosesPada: timestamp("selesai_diproses_pada", { withTimezone: true }),
    diaktifkanOleh: text("diaktifkan_oleh").references(() => user.id),
    diaktifkanPada: timestamp("diaktifkan_pada", { withTimezone: true }),
    diarsipkanPada: timestamp("diarsipkan_pada", { withTimezone: true }),
  },
  (tabel) => [
    uniqueIndex("impor_satu_aktif_per_bulan")
      .on(tabel.tahunImpor, tabel.bulanImpor)
      .where(sql`${tabel.status} = 'aktif'`),
    check("impor_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusImpor)})`),
    check("impor_bulan_valid", sql`${tabel.bulanImpor} between 1 and 12`),
  ],
);

/** Cakupan tanggal per toko (ADR-0002): satu baris per kolom tanggal valid di blok toko. */
export const cakupanTanggalImpor = pgTable(
  "cakupan_tanggal_impor",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    imporId: integer("impor_id")
      .notNull()
      .references(() => impor.id),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    tanggal: date("tanggal", { mode: "string" }).notNull(),
    /** Alamat sel header tanggal, mis. `F2`. */
    alamatKolom: text("alamat_kolom").notNull(),
  },
  (tabel) => [index("cakupan_tanggal_impor_impor_toko_idx").on(tabel.imporId, tabel.tokoId)],
);

/** Sel penjualan bernilai (ADR-0002): hanya sel berisi angka, termasuk nol yang diketik, beserta alamatnya. */
export const selPenjualan = pgTable(
  "sel_penjualan",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    imporId: integer("impor_id")
      .notNull()
      .references(() => impor.id),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    kodeProduk: text("kode_produk").notNull(),
    tanggal: date("tanggal", { mode: "string" }).notNull(),
    kuantitas: integer("kuantitas").notNull(),
    alamat: text("alamat").notNull(),
  },
  (tabel) => [index("sel_penjualan_impor_toko_idx").on(tabel.imporId, tabel.tokoId)],
);

export const daftarStatusKeluargaAroma = ["terpetakan", "tanpa-aroma", "belum-dipetakan"] as const;
export type StatusKeluargaAroma = (typeof daftarStatusKeluargaAroma)[number];

/**
 * Master produk (ADR-0006): kode produk = identitas varian; nama hanya label.
 * Kode baru didaftarkan saat impor diaktifkan, dengan status keluarga aroma `belum-dipetakan`.
 * Klasifikasi dari klasifikasiProduk (T06, ADR-0007).
 */
export const produk = pgTable(
  "produk",
  {
    kode: text("kode").primaryKey(),
    nama: text("nama").notNull(),
    ukuran: text("ukuran").notNull(),
    kategori: text("kategori").notNull(),
    klasifikasi: text("klasifikasi").$type<"manual" | "otomatis">().notNull(),
    alasanManual: text("alasan_manual").$type<"display-tester" | "kertas-tester">(),
    statusKeluargaAroma: text("status_keluarga_aroma")
      .$type<StatusKeluargaAroma>()
      .notNull()
      .default("belum-dipetakan"),
    /** Keluarga hasil konfirmasi admin (T45); terisi persis saat status `terpetakan`. */
    keluargaAromaId: integer("keluarga_aroma_id").references((): AnyPgColumn => keluargaAroma.id),
    didaftarkanOlehImporId: integer("didaftarkan_oleh_impor_id").references(() => impor.id),
    didaftarkanPada: timestamp("didaftarkan_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [
    check("produk_klasifikasi_dikenal", sql`${tabel.klasifikasi} in ('manual', 'otomatis')`),
    check(
      "produk_alasan_manual_sesuai",
      sql`(${tabel.klasifikasi} = 'manual' and ${tabel.alasanManual} in ('display-tester', 'kertas-tester')) or (${tabel.klasifikasi} = 'otomatis' and ${tabel.alasanManual} is null)`,
    ),
    check(
      "produk_status_keluarga_aroma_dikenal",
      sql`${tabel.statusKeluargaAroma} in (${daftarSql(daftarStatusKeluargaAroma)})`,
    ),
    check(
      "produk_keluarga_aroma_sesuai_status",
      sql`(${tabel.statusKeluargaAroma} = 'terpetakan') = (${tabel.keluargaAromaId} is not null)`,
    ),
    index("produk_keluarga_aroma_id_idx").on(tabel.keluargaAromaId),
  ],
);

// --- Cache hasil hitung laporan (T33, ADR-0002) ---

/**
 * Penanda revisi kalender: satu baris (id = 1) berisi angka yang naik setiap kali kategori efektif bisa berubah
 * (T42). Belum ada baris berarti revisi 0.
 */
export const revisiKalender = pgTable(
  "revisi_kalender",
  {
    id: integer("id").primaryKey(),
    revisi: integer("revisi").notNull(),
    diubahPada: timestamp("diubah_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [check("revisi_kalender_satu_baris", sql`${tabel.id} = 1`)],
);

export const daftarStatusVersiCache = ["sedang-dihitung", "selesai", "gagal"] as const;
export type StatusVersiCache = (typeof daftarStatusVersiCache)[number];

const daftarKategoriHari = daftarKategoriDasar;
const daftarKelengkapan = ["lengkap", "parsial"] as const;

/**
 * Satu kali hitung cache laporan. Kunci versi = set impor aktif (id urut naik) + revisi kalender (ADR-0002).
 * Cache yang dibaca adalah versi `selesai` terbaru; versi `sedang-dihitung` atau `gagal` tidak menggantikannya.
 */
export const versiCacheLaporan = pgTable(
  "versi_cache_laporan",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    imporAktif: integer("impor_aktif").array().notNull(),
    revisiKalender: integer("revisi_kalender").notNull(),
    status: text("status").$type<StatusVersiCache>().notNull(),
    pesanGagal: text("pesan_gagal"),
    mulaiPada: timestamp("mulai_pada", { withTimezone: true }).notNull().defaultNow(),
    selesaiPada: timestamp("selesai_pada", { withTimezone: true }),
  },
  (tabel) => [
    check("versi_cache_laporan_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusVersiCache)})`),
    index("versi_cache_laporan_status_idx").on(tabel.status, tabel.selesaiPada),
  ],
);

/** Tahap 1 (PRD A2): nilai mingguan per produk–toko–bulan laporan–minggu laporan–kategori. */
export const cacheNilaiMingguan = pgTable(
  "cache_nilai_mingguan",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    versiId: integer("versi_id")
      .notNull()
      .references(() => versiCacheLaporan.id, { onDelete: "cascade" }),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    kodeProduk: text("kode_produk").notNull(),
    /** `YYYY-MM`. */
    bulanLaporan: text("bulan_laporan").notNull(),
    mingguLaporan: integer("minggu_laporan").notNull(),
    kategori: text("kategori").$type<(typeof daftarKategoriHari)[number]>().notNull(),
    /** Tanggal teramati, urut naik; `selSumber` dan `imporId` sejajar dengan daftar ini. */
    tanggal: date("tanggal", { mode: "string" }).array().notNull(),
    selSumber: text("sel_sumber").array().notNull(),
    imporId: integer("impor_id").array().notNull(),
    tanggalTidakTeramati: date("tanggal_tidak_teramati", { mode: "string" }).array().notNull(),
    jumlahQty: integer("jumlah_qty").notNull(),
    /** Jumlah tanggal teramati untuk Senin–Kamis; null untuk Jumat/Sabtu/Minggu. */
    pembagiTanggal: integer("pembagi_tanggal"),
    nilaiMingguan: integer("nilai_mingguan").notNull(),
    kelengkapan: text("kelengkapan").$type<(typeof daftarKelengkapan)[number]>().notNull(),
  },
  (tabel) => [
    uniqueIndex("cache_nilai_mingguan_unik").on(
      tabel.versiId,
      tabel.tokoId,
      tabel.kodeProduk,
      tabel.bulanLaporan,
      tabel.mingguLaporan,
      tabel.kategori,
    ),
    check("cache_nilai_mingguan_kategori_dikenal", sql`${tabel.kategori} in (${daftarSql(daftarKategoriHari)})`),
    check("cache_nilai_mingguan_kelengkapan_dikenal", sql`${tabel.kelengkapan} in (${daftarSql(daftarKelengkapan)})`),
  ],
);

/** Tahap 2 (PRD A2): rata-rata bulanan per produk–toko–bulan laporan–kategori. */
export const cacheRataRataBulanan = pgTable(
  "cache_rata_rata_bulanan",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    versiId: integer("versi_id")
      .notNull()
      .references(() => versiCacheLaporan.id, { onDelete: "cascade" }),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    kodeProduk: text("kode_produk").notNull(),
    bulanLaporan: text("bulan_laporan").notNull(),
    kategori: text("kategori").$type<(typeof daftarKategoriHari)[number]>().notNull(),
    jumlahNilaiMingguan: integer("jumlah_nilai_mingguan").notNull(),
    pembagiMinggu: integer("pembagi_minggu").notNull(),
    rataRataBulanan: integer("rata_rata_bulanan").notNull(),
    kelengkapan: text("kelengkapan").$type<(typeof daftarKelengkapan)[number]>().notNull(),
  },
  (tabel) => [
    uniqueIndex("cache_rata_rata_bulanan_unik").on(
      tabel.versiId,
      tabel.tokoId,
      tabel.kodeProduk,
      tabel.bulanLaporan,
      tabel.kategori,
    ),
    check("cache_rata_rata_bulanan_kategori_dikenal", sql`${tabel.kategori} in (${daftarSql(daftarKategoriHari)})`),
    check(
      "cache_rata_rata_bulanan_kelengkapan_dikenal",
      sql`${tabel.kelengkapan} in (${daftarSql(daftarKelengkapan)})`,
    ),
  ],
);

/** Total penjualan mentah (CONTEXT) per produk–toko–bulan laporan: jumlah kuantitas teramati tanpa perataan. */
export const cacheTotalPenjualanMentah = pgTable(
  "cache_total_penjualan_mentah",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    versiId: integer("versi_id")
      .notNull()
      .references(() => versiCacheLaporan.id, { onDelete: "cascade" }),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    kodeProduk: text("kode_produk").notNull(),
    bulanLaporan: text("bulan_laporan").notNull(),
    totalPenjualanMentah: integer("total_penjualan_mentah").notNull(),
  },
  (tabel) => [
    uniqueIndex("cache_total_penjualan_mentah_unik").on(
      tabel.versiId,
      tabel.tokoId,
      tabel.kodeProduk,
      tabel.bulanLaporan,
    ),
  ],
);

// --- Snapshot libur (T40, PRD B2–B3, ADR-0004) ---

/** Snapshot hasil sinkronisasi menunggu persetujuan admin; aktivasi dan arsip diatur T41 (`server/libur/aktivasi.ts`). */
export const daftarStatusSnapshotLibur = ["menunggu-persetujuan", "aktif", "diarsipkan"] as const;
export type StatusSnapshotLibur = (typeof daftarStatusSnapshotLibur)[number];

/**
 * Daftar libur satu tahun hasil sinkronisasi API (CONTEXT "Snapshot libur"). Hanya satu snapshot aktif per tahun,
 * ditegakkan unique index parsial. Sinkronisasi tidak pernah mengubah snapshot yang sudah ada.
 */
export const snapshotLibur = pgTable(
  "snapshot_libur",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tahun: integer("tahun").notNull(),
    status: text("status").$type<StatusSnapshotLibur>().notNull().default("menunggu-persetujuan"),
    /** URL yang diambil, mis. `https://api-hari-libur.vercel.app/api?year=2026`. */
    sumber: text("sumber").notNull(),
    disinkronkanPada: timestamp("disinkronkan_pada", { withTimezone: true }).notNull().defaultNow(),
    disinkronkanOleh: text("disinkronkan_oleh")
      .notNull()
      .references(() => user.id),
  },
  (tabel) => [
    uniqueIndex("snapshot_libur_satu_aktif_per_tahun")
      .on(tabel.tahun)
      .where(sql`${tabel.status} = 'aktif'`),
    check("snapshot_libur_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusSnapshotLibur)})`),
  ],
);

/** Satu tanggal libur dalam snapshot. `jenisUsulan` = jenis masih usulan otomatis dari keterangan (PRD B2). */
export const entriLibur = pgTable(
  "entri_libur",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => snapshotLibur.id),
    tanggal: date("tanggal", { mode: "string" }).notNull(),
    keterangan: text("keterangan").notNull(),
    jenis: text("jenis").$type<JenisLibur>().notNull(),
    jenisUsulan: boolean("jenis_usulan").notNull().default(true),
  },
  (tabel) => [
    uniqueIndex("entri_libur_tanggal_unik").on(tabel.snapshotId, tabel.tanggal),
    check("entri_libur_jenis_dikenal", sql`${tabel.jenis} in (${daftarSql(daftarJenisLibur)})`),
  ],
);

/** `persetujuan` = aktivasi pertama snapshot menunggu persetujuan (siapa dan kapan disimpan sekali, PRD B3);
 * `aktivasi-ulang` = aktivasi berikutnya atas snapshot arsip (T41). */
export const daftarJenisKejadianLibur = [
  "sinkronisasi-berhasil",
  "sinkronisasi-gagal",
  "persetujuan",
  "aktivasi-ulang",
] as const;
export type JenisKejadianLibur = (typeof daftarJenisKejadianLibur)[number];

/** Riwayat kejadian libur (PRD B3). Sinkronisasi gagal tidak membuat snapshot; pesannya disimpan di sini. */
export const kejadianLibur = pgTable(
  "kejadian_libur",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    jenis: text("jenis").$type<JenisKejadianLibur>().notNull(),
    tahun: integer("tahun").notNull(),
    snapshotId: integer("snapshot_id").references(() => snapshotLibur.id),
    pesan: text("pesan"),
    pelaku: text("pelaku")
      .notNull()
      .references(() => user.id),
    terjadiPada: timestamp("terjadi_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [
    index("kejadian_libur_jenis_waktu_idx").on(tabel.jenis, tabel.terjadiPada),
    // Persetujuan pertama hanya sekali per snapshot; aktivasi berikutnya dicatat sebagai `aktivasi-ulang`.
    uniqueIndex("kejadian_libur_satu_persetujuan_per_snapshot")
      .on(tabel.snapshotId)
      .where(sql`${tabel.jenis} = 'persetujuan'`),
    check("kejadian_libur_jenis_dikenal", sql`${tabel.jenis} in (${daftarSql(daftarJenisKejadianLibur)})`),
  ],
);

// --- Keluarga aroma dan alias (T44) ---

/**
 * Keluarga aroma = kelompok ranking (ADR-0006, revisi 2026-10-09): satu baris file ranking pusat,
 * termasuk kelompok yang bukan aroma seperti GIFT SET BOX. Dikelola admin.
 */
export const keluargaAroma = pgTable("keluarga_aroma", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nama: text("nama").notNull(),
  aktif: boolean("aktif").notNull().default(true),
});

/**
 * Alias keluarga aroma untuk mencocokkan baris file ranking (PRD A6, OD-05). `alias` disimpan sudah dinormalisasi
 * (huruf besar, spasi dirapikan; `normalisasiAlias`) dan unik di seluruh keluarga, ditegakkan database.
 */
export const aliasKeluargaAroma = pgTable(
  "alias_keluarga_aroma",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    keluargaId: integer("keluarga_id")
      .notNull()
      .references(() => keluargaAroma.id),
    alias: text("alias").notNull().unique(),
  },
  (tabel) => [index("alias_keluarga_aroma_keluarga_id_idx").on(tabel.keluargaId)],
);

/**
 * Segmen kode yang dicatat admin untuk keluarga (T45), mis. `GOR`. Produk yang salah satu segmen kodenya sama
 * persis mendapat usulan keluarga ini (`usulkanKeluargaAroma`). Disimpan huruf besar; unik di seluruh keluarga.
 */
export const segmenKodeKeluargaAroma = pgTable(
  "segmen_kode_keluarga_aroma",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    keluargaId: integer("keluarga_id")
      .notNull()
      .references(() => keluargaAroma.id),
    segmen: text("segmen").notNull().unique(),
  },
  (tabel) => [index("segmen_kode_keluarga_aroma_keluarga_id_idx").on(tabel.keluargaId)],
);

// --- Pemetaan produk ke keluarga aroma (T45) ---

/** Riwayat konfirmasi pemetaan produk: siapa, kapan, dari → ke. Keluarga terisi persis saat status `terpetakan`. */
export const riwayatPemetaanProduk = pgTable(
  "riwayat_pemetaan_produk",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    kodeProduk: text("kode_produk")
      .notNull()
      .references(() => produk.kode),
    dariStatus: text("dari_status").$type<StatusKeluargaAroma>().notNull(),
    dariKeluargaId: integer("dari_keluarga_id").references(() => keluargaAroma.id),
    keStatus: text("ke_status").$type<StatusKeluargaAroma>().notNull(),
    keKeluargaId: integer("ke_keluarga_id").references(() => keluargaAroma.id),
    pelaku: text("pelaku")
      .notNull()
      .references(() => user.id),
    terjadiPada: timestamp("terjadi_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [
    index("riwayat_pemetaan_produk_waktu_idx").on(tabel.terjadiPada),
    index("riwayat_pemetaan_produk_kode_idx").on(tabel.kodeProduk),
    check(
      "riwayat_pemetaan_produk_status_dikenal",
      sql`${tabel.dariStatus} in (${daftarSql(daftarStatusKeluargaAroma)}) and ${tabel.keStatus} in (${daftarSql(daftarStatusKeluargaAroma)})`,
    ),
    check(
      "riwayat_pemetaan_produk_keluarga_sesuai_status",
      sql`(${tabel.dariStatus} = 'terpetakan') = (${tabel.dariKeluargaId} is not null) and (${tabel.keStatus} = 'terpetakan') = (${tabel.keKeluargaId} is not null)`,
    ),
  ],
);

// --- Periode sumber gudang (T51, PRD A4, ADR-0003) ---

/**
 * Periode sumber per gudang, ditetapkan admin: 1–12 bulan laporan `YYYY-MM` (urut naik, boleh tidak berurutan).
 * Tabel hanya ditambah, tidak pernah diubah: periode yang berlaku adalah baris terbaru (id terbesar) gudang itu,
 * baris lainnya riwayat perubahan. Id baris yang berlaku menjadi versi periode sumber gudang.
 */
export const periodeSumberGudang = pgTable(
  "periode_sumber_gudang",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    gudangId: integer("gudang_id")
      .notNull()
      .references(() => gudang.id),
    bulan: text("bulan").array().notNull(),
    ditetapkanOleh: text("ditetapkan_oleh")
      .notNull()
      .references(() => user.id),
    ditetapkanPada: timestamp("ditetapkan_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [
    index("periode_sumber_gudang_gudang_id_idx").on(tabel.gudangId, tabel.id),
    check("periode_sumber_gudang_jumlah_bulan", sql`cardinality(${tabel.bulan}) between 1 and 12`),
  ],
);

// --- Perubahan kategori manual (T42, PRD B4) ---

export const daftarStatusPerubahanKategori = ["aktif", "dibatalkan"] as const;
export type StatusPerubahanKategori = (typeof daftarStatusPerubahanKategori)[number];

/**
 * Perubahan kategori satu tanggal oleh admin (CONTEXT "Perubahan kategori"). `tokoId` kosong = seluruh toko.
 * Revisi = baris baru dengan nomor revisi +1 pada tanggal + cakupan yang sama; revisi lama tetap tersimpan.
 * Pembatalan mengubah status semua baris aktif tanggal + cakupan itu menjadi `dibatalkan` dan mencatat siapa, kapan,
 * dan alasannya pada baris itu (jejak tidak dihapus). Kategori efektif dihitung dengan `kategoriEfektif` (domain).
 */
export const perubahanKategori = pgTable(
  "perubahan_kategori",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tanggal: date("tanggal", { mode: "string" }).notNull(),
    tokoId: integer("toko_id").references(() => toko.id),
    kategoriSebelum: text("kategori_sebelum").$type<KategoriDasar>().notNull(),
    kategoriSesudah: text("kategori_sesudah").$type<KategoriDasar>().notNull(),
    alasan: text("alasan").notNull(),
    revisi: integer("revisi").notNull(),
    status: text("status").$type<StatusPerubahanKategori>().notNull().default("aktif"),
    dibuatOleh: text("dibuat_oleh")
      .notNull()
      .references(() => user.id),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    dibatalkanOleh: text("dibatalkan_oleh").references(() => user.id),
    dibatalkanPada: timestamp("dibatalkan_pada", { withTimezone: true }),
    alasanPembatalan: text("alasan_pembatalan"),
  },
  (tabel) => [
    unique("perubahan_kategori_revisi_unik").on(tabel.tanggal, tabel.tokoId, tabel.revisi).nullsNotDistinct(),
    index("perubahan_kategori_status_tanggal_idx").on(tabel.status, tabel.tanggal),
    check(
      "perubahan_kategori_kategori_dikenal",
      sql`${tabel.kategoriSebelum} in (${daftarSql(daftarKategoriHari)}) and ${tabel.kategoriSesudah} in (${daftarSql(daftarKategoriHari)})`,
    ),
    check("perubahan_kategori_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusPerubahanKategori)})`),
    check(
      "perubahan_kategori_jejak_pembatalan",
      sql`(${tabel.status} = 'dibatalkan') = (${tabel.dibatalkanOleh} is not null and ${tabel.dibatalkanPada} is not null and ${tabel.alasanPembatalan} is not null)`,
    ),
  ],
);

// --- Ranking pusat (T53, PRD A6 ▶ OD-05, ADR-0006) ---

/** draft → dipublikasikan → diarsipkan (issue T53). Hanya satu versi berstatus `dipublikasikan` (= ranking berlaku). */
export const daftarStatusVersiRanking = ["draft", "dipublikasikan", "diarsipkan"] as const;
export type StatusVersiRanking = (typeof daftarStatusVersiRanking)[number];

/**
 * Satu unggahan file ranking pusat (CONTEXT "Ranking pusat"). `bulanRanking` = `YYYY-MM` dipilih admin saat
 * mengunggah; `versi` = nomor urut unggahan untuk bulan ranking itu (1, 2, …). `errorValidasi` = hasil `bacaRanking`
 * (T52); versi dengan error tidak punya baris dan tidak bisa dipublikasikan. Ranking berlaku untuk semua gudang =
 * versi berstatus `dipublikasikan`, ditegakkan unique index parsial; versi berlaku sebelumnya diarsipkan.
 */
export const versiRanking = pgTable(
  "versi_ranking",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    bulanRanking: text("bulan_ranking").notNull(),
    versi: integer("versi").notNull(),
    namaFile: text("nama_file").notNull(),
    ukuranByte: bigint("ukuran_byte", { mode: "number" }).notNull(),
    kunciObjek: text("kunci_objek").notNull().unique(),
    status: text("status").$type<StatusVersiRanking>().notNull().default("draft"),
    errorValidasi: jsonb("error_validasi").$type<ErrorRanking[]>().notNull().default([]),
    diunggahOleh: text("diunggah_oleh")
      .notNull()
      .references(() => user.id),
    diunggahPada: timestamp("diunggah_pada", { withTimezone: true }).notNull().defaultNow(),
    dipublikasikanOleh: text("dipublikasikan_oleh").references(() => user.id),
    dipublikasikanPada: timestamp("dipublikasikan_pada", { withTimezone: true }),
    diarsipkanPada: timestamp("diarsipkan_pada", { withTimezone: true }),
  },
  (tabel) => [
    uniqueIndex("versi_ranking_bulan_versi_unik").on(tabel.bulanRanking, tabel.versi),
    uniqueIndex("versi_ranking_satu_dipublikasikan")
      .on(tabel.status)
      .where(sql`${tabel.status} = 'dipublikasikan'`),
    check("versi_ranking_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusVersiRanking)})`),
    check("versi_ranking_bulan_valid", sql`${tabel.bulanRanking} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

/**
 * Satu baris file ranking = satu kelompok ranking (keluarga aroma). `keluargaAromaId` = hasil pencocokan `variant`
 * lewat alias (persis setelah normalisasi, ADR-0006); `null` = tidak cocok dengan alias mana pun (menahan publikasi).
 */
export const barisRanking = pgTable(
  "baris_ranking",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    versiId: integer("versi_id")
      .notNull()
      .references(() => versiRanking.id),
    rank: integer("rank").notNull(),
    variant: text("variant").notNull(),
    qtySales: integer("qty_sales").notNull(),
    keluargaAromaId: integer("keluarga_aroma_id").references(() => keluargaAroma.id),
  },
  (tabel) => [
    uniqueIndex("baris_ranking_versi_rank_unik").on(tabel.versiId, tabel.rank),
    index("baris_ranking_keluarga_aroma_id_idx").on(tabel.keluargaAromaId),
  ],
);

// --- Jadwal toko (T55, PRD A5 ▶ OD-06) ---

export const daftarStatusJadwal = ["aktif", "nonaktif"] as const;
export type StatusJadwal = (typeof daftarStatusJadwal)[number];

/**
 * Jadwal satu toko (CONTEXT "Jadwal"): pola, hari kirim beserta persiapan per hari (hasil `periksaJadwal`, T54), dan
 * tanggal jangkar (hanya dua mingguan). Paling banyak satu baris `aktif` per toko, ditegakkan unique index parsial.
 * Mengubah = baris baru; baris aktif sebelumnya menjadi `nonaktif` (riwayat tidak dihapus). Menonaktifkan mencatat siapa
 * dan kapan. Id baris aktif menjadi versi jadwal toko itu (sinyal perubahan jadwal).
 */
export const jadwalToko = pgTable(
  "jadwal_toko",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    pola: text("pola").$type<PolaJadwal>().notNull(),
    hariKirim: jsonb("hari_kirim").$type<{ hari: HariKirim; persiapanHari: 0 | 1 | 2 }[]>().notNull(),
    tanggalJangkar: date("tanggal_jangkar", { mode: "string" }),
    status: text("status").$type<StatusJadwal>().notNull().default("aktif"),
    dibuatOleh: text("dibuat_oleh")
      .notNull()
      .references(() => user.id),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
    dinonaktifkanOleh: text("dinonaktifkan_oleh").references(() => user.id),
    dinonaktifkanPada: timestamp("dinonaktifkan_pada", { withTimezone: true }),
  },
  (tabel) => [
    uniqueIndex("jadwal_toko_satu_aktif")
      .on(tabel.tokoId)
      .where(sql`${tabel.status} = 'aktif'`),
    index("jadwal_toko_toko_id_idx").on(tabel.tokoId, tabel.id),
    check("jadwal_toko_pola_dikenal", sql`${tabel.pola} in (${daftarSql(daftarPolaJadwal)})`),
    check("jadwal_toko_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusJadwal)})`),
    check("jadwal_toko_hari_kirim_array", sql`jsonb_typeof(${tabel.hariKirim}) = 'array'`),
    check(
      "jadwal_toko_jangkar_dua_mingguan",
      sql`(${tabel.pola} = 'dua-mingguan') = (${tabel.tanggalJangkar} is not null)`,
    ),
    check(
      "jadwal_toko_jejak_nonaktif",
      sql`(${tabel.status} = 'nonaktif') = (${tabel.dinonaktifkanOleh} is not null and ${tabel.dinonaktifkanPada} is not null)`,
    ),
  ],
);

// --- Usulan jadwal (T56, PRD A5 ▶ OD-06 dan ▶ Keputusan perencanaan M2–M3) ---

export const daftarJenisUsulanJadwal = ["buat", "ubah", "nonaktifkan"] as const;
export type JenisUsulanJadwal = (typeof daftarJenisUsulanJadwal)[number];

export const daftarStatusUsulanJadwal = ["menunggu", "disetujui", "ditolak"] as const;
export type StatusUsulanJadwal = (typeof daftarStatusUsulanJadwal)[number];

/**
 * Usulan jadwal satu toko gudang selain Pusat (CONTEXT "Usulan jadwal"), dibuat operator dengan hak
 * `kelola-usulan-jadwal` dan diputuskan admin. Isi jadwal (pola, hari kirim, tanggal jangkar; hasil `periksaJadwal`, T54)
 * kosong untuk usulan `nonaktifkan`. Paling banyak satu usulan `menunggu` per toko, ditegakkan unique index parsial.
 * Usulan tidak mengubah `jadwal_toko` sampai disetujui. `diputuskanOleh`/`diputuskanPada` = penyetuju (admin yang
 * menyetujui atau menolak) dan waktunya; penolakan wajib beralasan.
 */
export const usulanJadwal = pgTable(
  "usulan_jadwal",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    jenis: text("jenis").$type<JenisUsulanJadwal>().notNull(),
    pola: text("pola").$type<PolaJadwal>(),
    hariKirim: jsonb("hari_kirim").$type<{ hari: HariKirim; persiapanHari: 0 | 1 | 2 }[]>(),
    tanggalJangkar: date("tanggal_jangkar", { mode: "string" }),
    status: text("status").$type<StatusUsulanJadwal>().notNull().default("menunggu"),
    diusulkanOleh: text("diusulkan_oleh")
      .notNull()
      .references(() => user.id),
    diusulkanPada: timestamp("diusulkan_pada", { withTimezone: true }).notNull().defaultNow(),
    diputuskanOleh: text("diputuskan_oleh").references(() => user.id),
    diputuskanPada: timestamp("diputuskan_pada", { withTimezone: true }),
    alasanPenolakan: text("alasan_penolakan"),
  },
  (tabel) => [
    uniqueIndex("usulan_jadwal_satu_menunggu")
      .on(tabel.tokoId)
      .where(sql`${tabel.status} = 'menunggu'`),
    index("usulan_jadwal_toko_id_idx").on(tabel.tokoId, tabel.id),
    check("usulan_jadwal_jenis_dikenal", sql`${tabel.jenis} in (${daftarSql(daftarJenisUsulanJadwal)})`),
    check("usulan_jadwal_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusUsulanJadwal)})`),
    check("usulan_jadwal_pola_dikenal", sql`${tabel.pola} in (${daftarSql(daftarPolaJadwal)})`),
    check(
      "usulan_jadwal_isi_sesuai_jenis",
      sql`(${tabel.jenis} = 'nonaktifkan') = (${tabel.pola} is null and ${tabel.hariKirim} is null)`,
    ),
    check(
      "usulan_jadwal_hari_kirim_array",
      sql`${tabel.hariKirim} is null or jsonb_typeof(${tabel.hariKirim}) = 'array'`,
    ),
    check(
      "usulan_jadwal_jangkar_dua_mingguan",
      sql`(coalesce(${tabel.pola}, '') = 'dua-mingguan') = (${tabel.tanggalJangkar} is not null)`,
    ),
    check(
      "usulan_jadwal_jejak_keputusan",
      sql`(${tabel.status} <> 'menunggu') = (${tabel.diputuskanOleh} is not null and ${tabel.diputuskanPada} is not null)`,
    ),
    check(
      "usulan_jadwal_alasan_penolakan",
      sql`(${tabel.status} = 'ditolak') = (${tabel.alasanPenolakan} is not null)`,
    ),
  ],
);

// --- Draft rencana (T58, PRD A6 ▶ Keputusan perencanaan M2–M3: draft rencana dan dasar perhitungannya) ---

/**
 * Draft rencana satu gudang untuk satu tanggal kirim (CONTEXT "Draft rencana"), dibuat operator dengan hak
 * `hitung-kebutuhan`. Satu draft per gudang + tanggal kirim; menghitung lagi mengganti isi draft itu. Dasar yang dipakai
 * disimpan sebagai sinyal perubahan (T61): versi periode sumber (id penetapan yang berlaku, T51) dan revisi kalender
 * (T42). Toko beserta p, L, dan versi jadwal disimpan di `toko_draft_rencana`. `versiRankingId` = versi ranking pusat
 * berlaku yang dipakai untuk buffer (bulan ranking dan versinya, T66). `versiCacheId` dan `imporAktif` = versi cache
 * laporan yang dipakai beserta set impor aktifnya (T61; tanpa FK karena versi cache lama dihapus). Kosong = draft
 * dihitung sebelum T61. `tokoDikeluarkan` = toko yang dikeluarkan dari draft pada hitungan terakhir karena tidak lagi
 * mengirim pada tanggal itu (T61). `stokTidakDipakai` = stok akhir yang sudah diisi untuk toko–varian yang tidak ada lagi
 * di draft setelah dihitung ulang; disimpan dan dipakai kembali bila toko–varian itu muncul lagi (PRD A7 ▶ Keputusan
 * 2026-10-10, T61).
 */
export const draftRencana = pgTable(
  "draft_rencana",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    gudangId: integer("gudang_id")
      .notNull()
      .references(() => gudang.id),
    tanggalKirim: date("tanggal_kirim", { mode: "string" }).notNull(),
    dihitungOleh: text("dihitung_oleh")
      .notNull()
      .references(() => user.id),
    dihitungPada: timestamp("dihitung_pada", { withTimezone: true }).notNull().defaultNow(),
    versiPeriodeSumber: integer("versi_periode_sumber")
      .notNull()
      .references(() => periodeSumberGudang.id),
    revisiKalender: integer("revisi_kalender").notNull(),
    versiRankingId: integer("versi_ranking_id")
      .notNull()
      .references(() => versiRanking.id),
    /** Bulan periode sumber yang dipakai (`YYYY-MM`, urut naik; T60). Kosong = draft dihitung sebelum T60. */
    bulanSumber: jsonb("bulan_sumber").$type<string[]>(),
    versiCacheId: integer("versi_cache_id"),
    /** Id impor aktif (urut naik) pembentuk versi cache laporan yang dipakai. */
    imporAktif: integer("impor_aktif").array(),
    tokoDikeluarkan: integer("toko_dikeluarkan").array().notNull().default(sql`'{}'::integer[]`),
    stokTidakDipakai: jsonb("stok_tidak_dipakai").$type<{ tokoId: number; kodeProduk: string; stokAkhir: number }[]>().notNull().default([]),
  },
  (tabel) => [uniqueIndex("draft_rencana_gudang_tanggal_unik").on(tabel.gudangId, tabel.tanggalKirim)],
);

/**
 * Toko di draft: setiap toko gudang yang menurut jadwal aktifnya mengirim pada tanggal draft (T54), beserta p, L, dan versi
 * jadwal (id jadwal aktif, T55). Toko tetap tercatat walau tidak punya varian di periode sumber.
 */
export const tokoDraftRencana = pgTable(
  "toko_draft_rencana",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    draftId: integer("draft_id")
      .notNull()
      .references(() => draftRencana.id, { onDelete: "cascade" }),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    versiJadwal: integer("versi_jadwal")
      .notNull()
      .references(() => jadwalToko.id),
    persiapanHari: integer("persiapan_hari").$type<0 | 1 | 2>().notNull(),
    panjangCakupan: integer("panjang_cakupan").$type<7 | 14>().notNull(),
    /** Tanggal cakupan beserta kategori efektif dan sumbernya (T60). Kosong = draft dihitung sebelum T60. */
    cakupan: jsonb("cakupan").$type<TanggalCakupanDraft[]>(),
    /**
     * Id perubahan kategori aktif (urut naik) yang tanggalnya masuk cakupan toko ini dan mengenai toko ini (seluruh toko
     * atau toko ini) saat dihitung; sinyal perubahan kalender (PRD B9 ▶ Keputusan 2026-10-10, T61). Kosong = draft
     * dihitung sebelum T61.
     */
    perubahanKategori: integer("perubahan_kategori").array(),
  },
  (tabel) => [
    uniqueIndex("toko_draft_rencana_unik").on(tabel.draftId, tabel.tokoId),
    check("toko_draft_rencana_persiapan", sql`${tabel.persiapanHari} in (0, 1, 2)`),
    check("toko_draft_rencana_panjang_cakupan", sql`${tabel.panjangCakupan} in (7, 14)`),
  ],
);

/**
 * Satu baris draft = satu toko–varian. Klasifikasi dan kebutuhan dari `hitungKebutuhanKirim` (T05). Kebutuhan tidak
 * tersedia = `kebutuhan` kosong dan `tanpaRataRata` berisi tanggal cakupan beserta kategori efektif yang tidak punya
 * rata-rata. Buffer, daftar masalah (urutan tampilan), dan jumlah kirim dari `nilaiBarisDraft` (T66): `persenBuffer`
 * kosong untuk produk manual dan produk otomatis yang belum dipetakan; `jumlahKirim` kosong selama ada masalah.
 * `stokAkhir` diisi operator (T59): kosong = belum diketahui, bukan nol; boleh negatif (menjadi masalah produk otomatis).
 * Setelah stok disimpan, `masalah` dan `jumlahKirim` diperbarui (PRD A7). `rincian` menyimpan dasar kebutuhan untuk
 * rincian perhitungan (T60). `statusKeluargaAroma` dan `keluargaAromaId` = pemetaan produk yang dipakai saat dihitung,
 * sebagai sinyal perubahan pemetaan (T61). Kosong = draft dihitung sebelum T61.
 */
export const barisDraftRencana = pgTable(
  "baris_draft_rencana",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tokoDraftId: integer("toko_draft_id")
      .notNull()
      .references(() => tokoDraftRencana.id, { onDelete: "cascade" }),
    kodeProduk: text("kode_produk").notNull(),
    klasifikasi: text("klasifikasi").$type<"manual" | "otomatis">().notNull(),
    kebutuhan: integer("kebutuhan"),
    tanpaRataRata: jsonb("tanpa_rata_rata").$type<{ tanggal: string; kategoriEfektif: KategoriDasar }[]>(),
    persenBuffer: integer("persen_buffer"),
    masalah: jsonb("masalah").$type<MasalahBarisDraft[]>().notNull().default([]),
    jumlahKirim: integer("jumlah_kirim"),
    stokAkhir: integer("stok_akhir"),
    /** Rata-rata per kategori dan kebutuhan per kategori efektif (T60). Kosong = draft dihitung sebelum T60. */
    rincian: jsonb("rincian").$type<RincianBarisDraft>(),
    statusKeluargaAroma: text("status_keluarga_aroma").$type<StatusKeluargaAroma>(),
    keluargaAromaId: integer("keluarga_aroma_id"),
  },
  (tabel) => [
    uniqueIndex("baris_draft_rencana_unik").on(tabel.tokoDraftId, tabel.kodeProduk),
    check("baris_draft_rencana_klasifikasi_dikenal", sql`${tabel.klasifikasi} in ('manual', 'otomatis')`),
    check(
      "baris_draft_rencana_kebutuhan_atau_tanpa_rata_rata",
      sql`(${tabel.kebutuhan} is null) = (${tabel.tanpaRataRata} is not null)`,
    ),
    check("baris_draft_rencana_persen_buffer_dikenal", sql`${tabel.persenBuffer} is null or ${tabel.persenBuffer} in (10, 20)`),
    check("baris_draft_rencana_jumlah_kirim", sql`${tabel.jumlahKirim} is null or ${tabel.jumlahKirim} >= 0`),
  ],
);

// --- Rencana final (T62, PRD A7 ▶ Keputusan perencanaan M2–M3: finalisasi per toko per tanggal kirim) ---

/** Satu impor yang menjadi sumber penjualan rencana final, beserta identitas filenya (PRD A7). */
export type ImporRencanaFinal = {
  id: number;
  namaFile: string;
  ukuranByte: number;
  sha256: string | null;
  namaSheet: string;
  tahunImpor: number;
  bulanImpor: number;
};

/** Isi jadwal aktif toko saat difinalisasi (PRD A7). */
export type JadwalRencanaFinal = {
  pola: PolaJadwal;
  hariKirim: { hari: HariKirim; persiapanHari: 0 | 1 | 2 }[];
  tanggalJangkar: string | null;
};

/**
 * Rencana final satu toko untuk satu tanggal kirim (CONTEXT "Rencana final"), dibuat operator dengan hak `finalisasi`
 * dari draft rencana gudang itu. Setiap finalisasi gudang + toko + tanggal kirim membuat versi baru (1, 2, …); versi
 * lama tidak pernah diubah (PRD A7 ▶ Keputusan 2026-10-11, T62). Versi 2 dan seterusnya menggantikan versi sebelumnya
 * dan wajib punya alasan finalisasi ulang; versi 1 tanpa alasan. Semua
 * masukannya disimpan sebagai snapshot sehingga tidak bergantung pada data yang bisa berubah atau dihapus kemudian
 * (draft, periode sumber, jadwal, cache laporan, master produk; PRD A7, B9): bulan periode sumber dan versi periodenya,
 * impor beserta identitas file + SHA-256, bulan dan versi ranking pusat, versi dan isi jadwal beserta p dan L, revisi
 * kalender, id perubahan kategori yang mengenai cakupan, serta tanggal cakupan beserta kategori efektif dan sumbernya.
 * Nama toko dan nama pemfinalisasi juga disalin agar tampilan rencana final tidak ikut berubah bila master diubah.
 */
export const rencanaFinal = pgTable(
  "rencana_final",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    gudangId: integer("gudang_id")
      .notNull()
      .references(() => gudang.id),
    /** Nama gudang saat difinalisasi (snapshot). */
    namaGudang: text("nama_gudang").notNull(),
    tokoId: integer("toko_id")
      .notNull()
      .references(() => toko.id),
    /** Nama toko saat difinalisasi (snapshot). */
    namaToko: text("nama_toko").notNull(),
    tanggalKirim: date("tanggal_kirim", { mode: "string" }).notNull(),
    /** Nomor versi per gudang + toko + tanggal kirim, mulai 1. */
    versi: integer("versi").notNull(),
    /** Alasan finalisasi ulang (versi ≥ 2); `null` untuk versi 1. */
    alasanFinalisasiUlang: text("alasan_finalisasi_ulang"),
    difinalisasiOleh: text("difinalisasi_oleh")
      .notNull()
      .references(() => user.id),
    /** Nama pengguna yang memfinalisasi saat difinalisasi (snapshot). */
    namaPemfinalisasi: text("nama_pemfinalisasi").notNull(),
    difinalisasiPada: timestamp("difinalisasi_pada", { withTimezone: true }).notNull().defaultNow(),
    /** Bulan periode sumber yang dipakai (`YYYY-MM`, urut naik). */
    bulanSumber: jsonb("bulan_sumber").$type<string[]>().notNull(),
    /** Id penetapan periode sumber yang dipakai (T51); tanpa FK karena snapshot. */
    versiPeriodeSumber: integer("versi_periode_sumber").notNull(),
    impor: jsonb("impor").$type<ImporRencanaFinal[]>().notNull(),
    versiRankingId: integer("versi_ranking_id")
      .notNull()
      .references(() => versiRanking.id),
    bulanRanking: text("bulan_ranking").notNull(),
    versiRanking: integer("versi_ranking").notNull(),
    /** Id jadwal aktif toko yang dipakai (T55); tanpa FK karena snapshot. */
    versiJadwal: integer("versi_jadwal").notNull(),
    jadwal: jsonb("jadwal").$type<JadwalRencanaFinal>().notNull(),
    persiapanHari: integer("persiapan_hari").$type<0 | 1 | 2>().notNull(),
    panjangCakupan: integer("panjang_cakupan").$type<7 | 14>().notNull(),
    revisiKalender: integer("revisi_kalender").notNull(),
    perubahanKategori: integer("perubahan_kategori").array().notNull(),
    cakupan: jsonb("cakupan").$type<TanggalCakupanDraft[]>().notNull(),
  },
  (tabel) => [
    uniqueIndex("rencana_final_gudang_toko_tanggal_versi_unik").on(tabel.gudangId, tabel.tokoId, tabel.tanggalKirim, tabel.versi),
    check("rencana_final_versi", sql`${tabel.versi} >= 1`),
    check(
      "rencana_final_alasan_finalisasi_ulang",
      sql`(${tabel.versi} = 1) = (${tabel.alasanFinalisasiUlang} is null) and coalesce(btrim(${tabel.alasanFinalisasiUlang}), 'x') <> ''`,
    ),
    check("rencana_final_persiapan", sql`${tabel.persiapanHari} in (0, 1, 2)`),
    check("rencana_final_panjang_cakupan", sql`${tabel.panjangCakupan} in (7, 14)`),
  ],
);

export const daftarStatusBarisRencanaFinal = ["siap", "manual"] as const;
export type StatusBarisRencanaFinal = (typeof daftarStatusBarisRencanaFinal)[number];

/**
 * Satu baris rencana final = satu varian toko itu, disalin dari baris draft saat difinalisasi. `status` `siap` = produk
 * otomatis tanpa masalah dengan jumlah kirim; `manual` = produk manual, tanpa buffer dan jumlah kirim. Nama dan kategori
 * produk disalin dari master produk (master bisa berubah oleh impor berikutnya). `rincian` = rata-rata per kategori yang
 * dipakai dan kebutuhan per kategori efektif. `tanpaRataRata` hanya untuk produk manual yang kebutuhannya tidak tersedia.
 */
export const barisRencanaFinal = pgTable(
  "baris_rencana_final",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    rencanaFinalId: integer("rencana_final_id")
      .notNull()
      .references(() => rencanaFinal.id, { onDelete: "cascade" }),
    kodeProduk: text("kode_produk").notNull(),
    namaProduk: text("nama_produk"),
    kategoriProduk: text("kategori_produk"),
    status: text("status").$type<StatusBarisRencanaFinal>().notNull(),
    kebutuhan: integer("kebutuhan"),
    tanpaRataRata: jsonb("tanpa_rata_rata").$type<{ tanggal: string; kategoriEfektif: KategoriDasar }[]>(),
    stokAkhir: integer("stok_akhir"),
    persenBuffer: integer("persen_buffer"),
    jumlahKirim: integer("jumlah_kirim"),
    rincian: jsonb("rincian").$type<RincianBarisDraft>().notNull(),
  },
  (tabel) => [
    uniqueIndex("baris_rencana_final_unik").on(tabel.rencanaFinalId, tabel.kodeProduk),
    check("baris_rencana_final_status_dikenal", sql`${tabel.status} in (${daftarSql(daftarStatusBarisRencanaFinal)})`),
    check(
      "baris_rencana_final_siap_lengkap",
      sql`${tabel.status} <> 'siap' or (${tabel.kebutuhan} is not null and ${tabel.stokAkhir} is not null and ${tabel.persenBuffer} in (10, 20) and ${tabel.jumlahKirim} >= 0)`,
    ),
    check(
      "baris_rencana_final_manual_tanpa_kirim",
      sql`${tabel.status} <> 'manual' or (${tabel.persenBuffer} is null and ${tabel.jumlahKirim} is null)`,
    ),
    check(
      "baris_rencana_final_kebutuhan_atau_tanpa_rata_rata",
      sql`(${tabel.kebutuhan} is null) = (${tabel.tanpaRataRata} is not null)`,
    ),
  ],
);

// --- Alias nama stok (T82, PRD A6 ▶ Keputusan 2026-10-12 UAT: unggah file stok dan alias nama stok) ---

/**
 * Nama produk di file stok kasir yang dipetakan admin ke tepat satu kode produk (CONTEXT "Alias nama stok").
 * `alias` disimpan setelah normalisasi (`normalisasiNamaStok`) dan unik: satu alias hanya untuk satu produk; satu
 * produk boleh punya beberapa alias. Nama master produk tidak disimpan di sini (berlaku sebagai alias bawaan).
 */
export const aliasNamaStok = pgTable(
  "alias_nama_stok",
  {
    alias: text("alias").primaryKey(),
    kodeProduk: text("kode_produk")
      .notNull()
      .references(() => produk.kode),
    dibuatOleh: text("dibuat_oleh")
      .notNull()
      .references(() => user.id),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabel) => [index("alias_nama_stok_kode_produk_idx").on(tabel.kodeProduk)],
);
