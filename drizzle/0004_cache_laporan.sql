CREATE TABLE "cache_nilai_mingguan" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cache_nilai_mingguan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"versi_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"kode_produk" text NOT NULL,
	"bulan_laporan" text NOT NULL,
	"minggu_laporan" integer NOT NULL,
	"kategori" text NOT NULL,
	"tanggal" date[] NOT NULL,
	"sel_sumber" text[] NOT NULL,
	"impor_id" integer[] NOT NULL,
	"tanggal_tidak_teramati" date[] NOT NULL,
	"jumlah_qty" integer NOT NULL,
	"pembagi_tanggal" integer,
	"nilai_mingguan" integer NOT NULL,
	"kelengkapan" text NOT NULL,
	CONSTRAINT "cache_nilai_mingguan_kategori_dikenal" CHECK ("cache_nilai_mingguan"."kategori" in ('Senin–Kamis', 'Jumat', 'Sabtu', 'Minggu')),
	CONSTRAINT "cache_nilai_mingguan_kelengkapan_dikenal" CHECK ("cache_nilai_mingguan"."kelengkapan" in ('lengkap', 'parsial'))
);
--> statement-breakpoint
CREATE TABLE "cache_rata_rata_bulanan" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cache_rata_rata_bulanan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"versi_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"kode_produk" text NOT NULL,
	"bulan_laporan" text NOT NULL,
	"kategori" text NOT NULL,
	"jumlah_nilai_mingguan" integer NOT NULL,
	"pembagi_minggu" integer NOT NULL,
	"rata_rata_bulanan" integer NOT NULL,
	"kelengkapan" text NOT NULL,
	CONSTRAINT "cache_rata_rata_bulanan_kategori_dikenal" CHECK ("cache_rata_rata_bulanan"."kategori" in ('Senin–Kamis', 'Jumat', 'Sabtu', 'Minggu')),
	CONSTRAINT "cache_rata_rata_bulanan_kelengkapan_dikenal" CHECK ("cache_rata_rata_bulanan"."kelengkapan" in ('lengkap', 'parsial'))
);
--> statement-breakpoint
CREATE TABLE "cache_total_penjualan_mentah" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cache_total_penjualan_mentah_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"versi_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"kode_produk" text NOT NULL,
	"bulan_laporan" text NOT NULL,
	"total_penjualan_mentah" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisi_kalender" (
	"id" integer PRIMARY KEY NOT NULL,
	"revisi" integer NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisi_kalender_satu_baris" CHECK ("revisi_kalender"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "versi_cache_laporan" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "versi_cache_laporan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"impor_aktif" integer[] NOT NULL,
	"revisi_kalender" integer NOT NULL,
	"status" text NOT NULL,
	"pesan_gagal" text,
	"mulai_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai_pada" timestamp with time zone,
	CONSTRAINT "versi_cache_laporan_status_dikenal" CHECK ("versi_cache_laporan"."status" in ('sedang-dihitung', 'selesai', 'gagal'))
);
--> statement-breakpoint
ALTER TABLE "cache_nilai_mingguan" ADD CONSTRAINT "cache_nilai_mingguan_versi_id_versi_cache_laporan_id_fk" FOREIGN KEY ("versi_id") REFERENCES "public"."versi_cache_laporan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_nilai_mingguan" ADD CONSTRAINT "cache_nilai_mingguan_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_rata_rata_bulanan" ADD CONSTRAINT "cache_rata_rata_bulanan_versi_id_versi_cache_laporan_id_fk" FOREIGN KEY ("versi_id") REFERENCES "public"."versi_cache_laporan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_rata_rata_bulanan" ADD CONSTRAINT "cache_rata_rata_bulanan_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_total_penjualan_mentah" ADD CONSTRAINT "cache_total_penjualan_mentah_versi_id_versi_cache_laporan_id_fk" FOREIGN KEY ("versi_id") REFERENCES "public"."versi_cache_laporan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cache_total_penjualan_mentah" ADD CONSTRAINT "cache_total_penjualan_mentah_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cache_nilai_mingguan_unik" ON "cache_nilai_mingguan" USING btree ("versi_id","toko_id","kode_produk","bulan_laporan","minggu_laporan","kategori");--> statement-breakpoint
CREATE UNIQUE INDEX "cache_rata_rata_bulanan_unik" ON "cache_rata_rata_bulanan" USING btree ("versi_id","toko_id","kode_produk","bulan_laporan","kategori");--> statement-breakpoint
CREATE UNIQUE INDEX "cache_total_penjualan_mentah_unik" ON "cache_total_penjualan_mentah" USING btree ("versi_id","toko_id","kode_produk","bulan_laporan");--> statement-breakpoint
CREATE INDEX "versi_cache_laporan_status_idx" ON "versi_cache_laporan" USING btree ("status","selesai_pada");