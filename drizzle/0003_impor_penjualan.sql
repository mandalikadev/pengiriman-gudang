CREATE TABLE "cakupan_tanggal_impor" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cakupan_tanggal_impor_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"impor_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"tanggal" date NOT NULL,
	"alamat_kolom" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impor" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "impor_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nama_file" text NOT NULL,
	"ukuran_byte" bigint NOT NULL,
	"kunci_objek" text NOT NULL,
	"sha256" text,
	"nama_sheet" text NOT NULL,
	"tahun_impor" integer NOT NULL,
	"bulan_impor" integer NOT NULL,
	"status" text DEFAULT 'diunggah' NOT NULL,
	"masalah" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"produk" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pesan_gagal" text,
	"diunggah_oleh" text NOT NULL,
	"diunggah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai_diproses_pada" timestamp with time zone,
	"diaktifkan_oleh" text,
	"diaktifkan_pada" timestamp with time zone,
	"diarsipkan_pada" timestamp with time zone,
	CONSTRAINT "impor_kunci_objek_unique" UNIQUE("kunci_objek"),
	CONSTRAINT "impor_status_dikenal" CHECK ("impor"."status" in ('diunggah', 'diproses', 'siap-ditinjau', 'gagal', 'aktif', 'diarsipkan')),
	CONSTRAINT "impor_bulan_valid" CHECK ("impor"."bulan_impor" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "produk" (
	"kode" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"ukuran" text NOT NULL,
	"kategori" text NOT NULL,
	"klasifikasi" text NOT NULL,
	"alasan_manual" text,
	"status_keluarga_aroma" text DEFAULT 'belum-dipetakan' NOT NULL,
	"didaftarkan_oleh_impor_id" integer,
	"didaftarkan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produk_klasifikasi_dikenal" CHECK ("produk"."klasifikasi" in ('manual', 'otomatis')),
	CONSTRAINT "produk_alasan_manual_sesuai" CHECK (("produk"."klasifikasi" = 'manual' and "produk"."alasan_manual" in ('display-tester', 'kertas-tester')) or ("produk"."klasifikasi" = 'otomatis' and "produk"."alasan_manual" is null)),
	CONSTRAINT "produk_status_keluarga_aroma_dikenal" CHECK ("produk"."status_keluarga_aroma" in ('terpetakan', 'tanpa-aroma', 'belum-dipetakan'))
);
--> statement-breakpoint
CREATE TABLE "sel_penjualan" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sel_penjualan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"impor_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"kode_produk" text NOT NULL,
	"tanggal" date NOT NULL,
	"kuantitas" integer NOT NULL,
	"alamat" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cakupan_tanggal_impor" ADD CONSTRAINT "cakupan_tanggal_impor_impor_id_impor_id_fk" FOREIGN KEY ("impor_id") REFERENCES "public"."impor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cakupan_tanggal_impor" ADD CONSTRAINT "cakupan_tanggal_impor_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impor" ADD CONSTRAINT "impor_diunggah_oleh_user_id_fk" FOREIGN KEY ("diunggah_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impor" ADD CONSTRAINT "impor_diaktifkan_oleh_user_id_fk" FOREIGN KEY ("diaktifkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produk" ADD CONSTRAINT "produk_didaftarkan_oleh_impor_id_impor_id_fk" FOREIGN KEY ("didaftarkan_oleh_impor_id") REFERENCES "public"."impor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sel_penjualan" ADD CONSTRAINT "sel_penjualan_impor_id_impor_id_fk" FOREIGN KEY ("impor_id") REFERENCES "public"."impor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sel_penjualan" ADD CONSTRAINT "sel_penjualan_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cakupan_tanggal_impor_impor_toko_idx" ON "cakupan_tanggal_impor" USING btree ("impor_id","toko_id");--> statement-breakpoint
CREATE UNIQUE INDEX "impor_satu_aktif_per_bulan" ON "impor" USING btree ("tahun_impor","bulan_impor") WHERE "impor"."status" = 'aktif';--> statement-breakpoint
CREATE INDEX "sel_penjualan_impor_toko_idx" ON "sel_penjualan" USING btree ("impor_id","toko_id");