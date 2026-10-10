CREATE TABLE "baris_draft_rencana" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "baris_draft_rencana_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"toko_draft_id" integer NOT NULL,
	"kode_produk" text NOT NULL,
	"klasifikasi" text NOT NULL,
	"kebutuhan" integer,
	"tanpa_rata_rata" jsonb,
	CONSTRAINT "baris_draft_rencana_klasifikasi_dikenal" CHECK ("baris_draft_rencana"."klasifikasi" in ('manual', 'otomatis')),
	CONSTRAINT "baris_draft_rencana_kebutuhan_atau_tanpa_rata_rata" CHECK (("baris_draft_rencana"."kebutuhan" is null) = ("baris_draft_rencana"."tanpa_rata_rata" is not null))
);
--> statement-breakpoint
CREATE TABLE "draft_rencana" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "draft_rencana_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"gudang_id" integer NOT NULL,
	"tanggal_kirim" date NOT NULL,
	"dihitung_oleh" text NOT NULL,
	"dihitung_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"versi_periode_sumber" integer NOT NULL,
	"revisi_kalender" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toko_draft_rencana" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "toko_draft_rencana_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"draft_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"versi_jadwal" integer NOT NULL,
	"persiapan_hari" integer NOT NULL,
	"panjang_cakupan" integer NOT NULL,
	CONSTRAINT "toko_draft_rencana_persiapan" CHECK ("toko_draft_rencana"."persiapan_hari" in (0, 1, 2)),
	CONSTRAINT "toko_draft_rencana_panjang_cakupan" CHECK ("toko_draft_rencana"."panjang_cakupan" in (7, 14))
);
--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD CONSTRAINT "baris_draft_rencana_toko_draft_id_toko_draft_rencana_id_fk" FOREIGN KEY ("toko_draft_id") REFERENCES "public"."toko_draft_rencana"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD CONSTRAINT "draft_rencana_gudang_id_gudang_id_fk" FOREIGN KEY ("gudang_id") REFERENCES "public"."gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD CONSTRAINT "draft_rencana_dihitung_oleh_user_id_fk" FOREIGN KEY ("dihitung_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD CONSTRAINT "draft_rencana_versi_periode_sumber_periode_sumber_gudang_id_fk" FOREIGN KEY ("versi_periode_sumber") REFERENCES "public"."periode_sumber_gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_draft_id_draft_rencana_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft_rencana"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_versi_jadwal_jadwal_toko_id_fk" FOREIGN KEY ("versi_jadwal") REFERENCES "public"."jadwal_toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "baris_draft_rencana_unik" ON "baris_draft_rencana" USING btree ("toko_draft_id","kode_produk");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_rencana_gudang_tanggal_unik" ON "draft_rencana" USING btree ("gudang_id","tanggal_kirim");--> statement-breakpoint
CREATE UNIQUE INDEX "toko_draft_rencana_unik" ON "toko_draft_rencana" USING btree ("draft_id","toko_id");