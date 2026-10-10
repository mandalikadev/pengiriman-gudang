CREATE TABLE "perubahan_kategori" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "perubahan_kategori_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tanggal" date NOT NULL,
	"toko_id" integer,
	"kategori_sebelum" text NOT NULL,
	"kategori_sesudah" text NOT NULL,
	"alasan" text NOT NULL,
	"revisi" integer NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"dibuat_oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"dibatalkan_oleh" text,
	"dibatalkan_pada" timestamp with time zone,
	"alasan_pembatalan" text,
	CONSTRAINT "perubahan_kategori_revisi_unik" UNIQUE NULLS NOT DISTINCT("tanggal","toko_id","revisi"),
	CONSTRAINT "perubahan_kategori_kategori_dikenal" CHECK ("perubahan_kategori"."kategori_sebelum" in ('Senin–Kamis', 'Jumat', 'Sabtu', 'Minggu') and "perubahan_kategori"."kategori_sesudah" in ('Senin–Kamis', 'Jumat', 'Sabtu', 'Minggu')),
	CONSTRAINT "perubahan_kategori_status_dikenal" CHECK ("perubahan_kategori"."status" in ('aktif', 'dibatalkan')),
	CONSTRAINT "perubahan_kategori_jejak_pembatalan" CHECK (("perubahan_kategori"."status" = 'dibatalkan') = ("perubahan_kategori"."dibatalkan_oleh" is not null and "perubahan_kategori"."dibatalkan_pada" is not null and "perubahan_kategori"."alasan_pembatalan" is not null))
);
--> statement-breakpoint
ALTER TABLE "perubahan_kategori" ADD CONSTRAINT "perubahan_kategori_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perubahan_kategori" ADD CONSTRAINT "perubahan_kategori_dibuat_oleh_user_id_fk" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perubahan_kategori" ADD CONSTRAINT "perubahan_kategori_dibatalkan_oleh_user_id_fk" FOREIGN KEY ("dibatalkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perubahan_kategori_status_tanggal_idx" ON "perubahan_kategori" USING btree ("status","tanggal");