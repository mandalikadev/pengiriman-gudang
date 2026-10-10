CREATE TABLE "jadwal_toko" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jadwal_toko_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"toko_id" integer NOT NULL,
	"pola" text NOT NULL,
	"hari_kirim" jsonb NOT NULL,
	"tanggal_jangkar" date,
	"status" text DEFAULT 'aktif' NOT NULL,
	"dibuat_oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"dinonaktifkan_oleh" text,
	"dinonaktifkan_pada" timestamp with time zone,
	CONSTRAINT "jadwal_toko_pola_dikenal" CHECK ("jadwal_toko"."pola" in ('mingguan', '2x-seminggu', '3x-seminggu', 'dua-mingguan')),
	CONSTRAINT "jadwal_toko_status_dikenal" CHECK ("jadwal_toko"."status" in ('aktif', 'nonaktif')),
	CONSTRAINT "jadwal_toko_hari_kirim_array" CHECK (jsonb_typeof("jadwal_toko"."hari_kirim") = 'array'),
	CONSTRAINT "jadwal_toko_jangkar_dua_mingguan" CHECK (("jadwal_toko"."pola" = 'dua-mingguan') = ("jadwal_toko"."tanggal_jangkar" is not null)),
	CONSTRAINT "jadwal_toko_jejak_nonaktif" CHECK (("jadwal_toko"."status" = 'nonaktif') = ("jadwal_toko"."dinonaktifkan_oleh" is not null and "jadwal_toko"."dinonaktifkan_pada" is not null))
);
--> statement-breakpoint
ALTER TABLE "jadwal_toko" ADD CONSTRAINT "jadwal_toko_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_toko" ADD CONSTRAINT "jadwal_toko_dibuat_oleh_user_id_fk" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_toko" ADD CONSTRAINT "jadwal_toko_dinonaktifkan_oleh_user_id_fk" FOREIGN KEY ("dinonaktifkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jadwal_toko_satu_aktif" ON "jadwal_toko" USING btree ("toko_id") WHERE "jadwal_toko"."status" = 'aktif';--> statement-breakpoint
CREATE INDEX "jadwal_toko_toko_id_idx" ON "jadwal_toko" USING btree ("toko_id","id");