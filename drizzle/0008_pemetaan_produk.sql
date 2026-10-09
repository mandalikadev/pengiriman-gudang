CREATE TABLE "riwayat_pemetaan_produk" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "riwayat_pemetaan_produk_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kode_produk" text NOT NULL,
	"dari_status" text NOT NULL,
	"dari_keluarga_id" integer,
	"ke_status" text NOT NULL,
	"ke_keluarga_id" integer,
	"pelaku" text NOT NULL,
	"terjadi_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riwayat_pemetaan_produk_status_dikenal" CHECK ("riwayat_pemetaan_produk"."dari_status" in ('terpetakan', 'tanpa-aroma', 'belum-dipetakan') and "riwayat_pemetaan_produk"."ke_status" in ('terpetakan', 'tanpa-aroma', 'belum-dipetakan')),
	CONSTRAINT "riwayat_pemetaan_produk_keluarga_sesuai_status" CHECK (("riwayat_pemetaan_produk"."dari_status" = 'terpetakan') = ("riwayat_pemetaan_produk"."dari_keluarga_id" is not null) and ("riwayat_pemetaan_produk"."ke_status" = 'terpetakan') = ("riwayat_pemetaan_produk"."ke_keluarga_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "segmen_kode_keluarga_aroma" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "segmen_kode_keluarga_aroma_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"keluarga_id" integer NOT NULL,
	"segmen" text NOT NULL,
	CONSTRAINT "segmen_kode_keluarga_aroma_segmen_unique" UNIQUE("segmen")
);
--> statement-breakpoint
ALTER TABLE "produk" ADD COLUMN "keluarga_aroma_id" integer;--> statement-breakpoint
ALTER TABLE "riwayat_pemetaan_produk" ADD CONSTRAINT "riwayat_pemetaan_produk_kode_produk_produk_kode_fk" FOREIGN KEY ("kode_produk") REFERENCES "public"."produk"("kode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riwayat_pemetaan_produk" ADD CONSTRAINT "riwayat_pemetaan_produk_dari_keluarga_id_keluarga_aroma_id_fk" FOREIGN KEY ("dari_keluarga_id") REFERENCES "public"."keluarga_aroma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riwayat_pemetaan_produk" ADD CONSTRAINT "riwayat_pemetaan_produk_ke_keluarga_id_keluarga_aroma_id_fk" FOREIGN KEY ("ke_keluarga_id") REFERENCES "public"."keluarga_aroma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riwayat_pemetaan_produk" ADD CONSTRAINT "riwayat_pemetaan_produk_pelaku_user_id_fk" FOREIGN KEY ("pelaku") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segmen_kode_keluarga_aroma" ADD CONSTRAINT "segmen_kode_keluarga_aroma_keluarga_id_keluarga_aroma_id_fk" FOREIGN KEY ("keluarga_id") REFERENCES "public"."keluarga_aroma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "riwayat_pemetaan_produk_waktu_idx" ON "riwayat_pemetaan_produk" USING btree ("terjadi_pada");--> statement-breakpoint
CREATE INDEX "riwayat_pemetaan_produk_kode_idx" ON "riwayat_pemetaan_produk" USING btree ("kode_produk");--> statement-breakpoint
CREATE INDEX "segmen_kode_keluarga_aroma_keluarga_id_idx" ON "segmen_kode_keluarga_aroma" USING btree ("keluarga_id");--> statement-breakpoint
ALTER TABLE "produk" ADD CONSTRAINT "produk_keluarga_aroma_id_keluarga_aroma_id_fk" FOREIGN KEY ("keluarga_aroma_id") REFERENCES "public"."keluarga_aroma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produk_keluarga_aroma_id_idx" ON "produk" USING btree ("keluarga_aroma_id");--> statement-breakpoint
ALTER TABLE "produk" ADD CONSTRAINT "produk_keluarga_aroma_sesuai_status" CHECK (("produk"."status_keluarga_aroma" = 'terpetakan') = ("produk"."keluarga_aroma_id" is not null));