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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { daftarJenisLibur, type JenisLibur } from "@/domain/libur";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
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

const daftarKategoriHari = ["Senin–Kamis", "Jumat", "Sabtu", "Minggu"] as const;
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
