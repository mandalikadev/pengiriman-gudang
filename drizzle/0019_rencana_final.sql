CREATE TABLE "baris_rencana_final" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "baris_rencana_final_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rencana_final_id" integer NOT NULL,
	"kode_produk" text NOT NULL,
	"nama_produk" text,
	"kategori_produk" text,
	"status" text NOT NULL,
	"kebutuhan" integer,
	"tanpa_rata_rata" jsonb,
	"stok_akhir" integer,
	"persen_buffer" integer,
	"jumlah_kirim" integer,
	"rincian" jsonb NOT NULL,
	CONSTRAINT "baris_rencana_final_status_dikenal" CHECK ("baris_rencana_final"."status" in ('siap', 'manual')),
	CONSTRAINT "baris_rencana_final_siap_lengkap" CHECK ("baris_rencana_final"."status" <> 'siap' or ("baris_rencana_final"."kebutuhan" is not null and "baris_rencana_final"."stok_akhir" is not null and "baris_rencana_final"."persen_buffer" in (10, 20) and "baris_rencana_final"."jumlah_kirim" >= 0)),
	CONSTRAINT "baris_rencana_final_manual_tanpa_kirim" CHECK ("baris_rencana_final"."status" <> 'manual' or ("baris_rencana_final"."persen_buffer" is null and "baris_rencana_final"."jumlah_kirim" is null)),
	CONSTRAINT "baris_rencana_final_kebutuhan_atau_tanpa_rata_rata" CHECK (("baris_rencana_final"."kebutuhan" is null) = ("baris_rencana_final"."tanpa_rata_rata" is not null))
);
--> statement-breakpoint
CREATE TABLE "rencana_final" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rencana_final_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"gudang_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"nama_toko" text NOT NULL,
	"tanggal_kirim" date NOT NULL,
	"versi" integer NOT NULL,
	"alasan_finalisasi_ulang" text,
	"difinalisasi_oleh" text NOT NULL,
	"nama_pemfinalisasi" text NOT NULL,
	"difinalisasi_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"bulan_sumber" jsonb NOT NULL,
	"versi_periode_sumber" integer NOT NULL,
	"impor" jsonb NOT NULL,
	"versi_ranking_id" integer NOT NULL,
	"bulan_ranking" text NOT NULL,
	"versi_ranking" integer NOT NULL,
	"versi_jadwal" integer NOT NULL,
	"jadwal" jsonb NOT NULL,
	"persiapan_hari" integer NOT NULL,
	"panjang_cakupan" integer NOT NULL,
	"revisi_kalender" integer NOT NULL,
	"perubahan_kategori" integer[] NOT NULL,
	"cakupan" jsonb NOT NULL,
	CONSTRAINT "rencana_final_versi" CHECK ("rencana_final"."versi" >= 1),
	CONSTRAINT "rencana_final_alasan_finalisasi_ulang" CHECK (("rencana_final"."versi" = 1) = ("rencana_final"."alasan_finalisasi_ulang" is null) and coalesce(btrim("rencana_final"."alasan_finalisasi_ulang"), 'x') <> ''),
	CONSTRAINT "rencana_final_persiapan" CHECK ("rencana_final"."persiapan_hari" in (0, 1, 2)),
	CONSTRAINT "rencana_final_panjang_cakupan" CHECK ("rencana_final"."panjang_cakupan" in (7, 14))
);
--> statement-breakpoint
ALTER TABLE "baris_rencana_final" ADD CONSTRAINT "baris_rencana_final_rencana_final_id_rencana_final_id_fk" FOREIGN KEY ("rencana_final_id") REFERENCES "public"."rencana_final"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_gudang_id_gudang_id_fk" FOREIGN KEY ("gudang_id") REFERENCES "public"."gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_difinalisasi_oleh_user_id_fk" FOREIGN KEY ("difinalisasi_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_versi_ranking_id_versi_ranking_id_fk" FOREIGN KEY ("versi_ranking_id") REFERENCES "public"."versi_ranking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "baris_rencana_final_unik" ON "baris_rencana_final" USING btree ("rencana_final_id","kode_produk");--> statement-breakpoint
CREATE UNIQUE INDEX "rencana_final_gudang_toko_tanggal_versi_unik" ON "rencana_final" USING btree ("gudang_id","toko_id","tanggal_kirim","versi");