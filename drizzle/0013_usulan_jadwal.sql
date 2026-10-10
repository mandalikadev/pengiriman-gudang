CREATE TABLE "usulan_jadwal" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usulan_jadwal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"toko_id" integer NOT NULL,
	"jenis" text NOT NULL,
	"pola" text,
	"hari_kirim" jsonb,
	"tanggal_jangkar" date,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"diusulkan_oleh" text NOT NULL,
	"diusulkan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diputuskan_oleh" text,
	"diputuskan_pada" timestamp with time zone,
	"alasan_penolakan" text,
	CONSTRAINT "usulan_jadwal_jenis_dikenal" CHECK ("usulan_jadwal"."jenis" in ('buat', 'ubah', 'nonaktifkan')),
	CONSTRAINT "usulan_jadwal_status_dikenal" CHECK ("usulan_jadwal"."status" in ('menunggu', 'disetujui', 'ditolak')),
	CONSTRAINT "usulan_jadwal_pola_dikenal" CHECK ("usulan_jadwal"."pola" in ('mingguan', '2x-seminggu', '3x-seminggu', 'dua-mingguan')),
	CONSTRAINT "usulan_jadwal_isi_sesuai_jenis" CHECK (("usulan_jadwal"."jenis" = 'nonaktifkan') = ("usulan_jadwal"."pola" is null and "usulan_jadwal"."hari_kirim" is null)),
	CONSTRAINT "usulan_jadwal_hari_kirim_array" CHECK ("usulan_jadwal"."hari_kirim" is null or jsonb_typeof("usulan_jadwal"."hari_kirim") = 'array'),
	CONSTRAINT "usulan_jadwal_jangkar_dua_mingguan" CHECK ((coalesce("usulan_jadwal"."pola", '') = 'dua-mingguan') = ("usulan_jadwal"."tanggal_jangkar" is not null)),
	CONSTRAINT "usulan_jadwal_jejak_keputusan" CHECK (("usulan_jadwal"."status" <> 'menunggu') = ("usulan_jadwal"."diputuskan_oleh" is not null and "usulan_jadwal"."diputuskan_pada" is not null)),
	CONSTRAINT "usulan_jadwal_alasan_penolakan" CHECK (("usulan_jadwal"."status" = 'ditolak') = ("usulan_jadwal"."alasan_penolakan" is not null))
);
--> statement-breakpoint
ALTER TABLE "usulan_jadwal" ADD CONSTRAINT "usulan_jadwal_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usulan_jadwal" ADD CONSTRAINT "usulan_jadwal_diusulkan_oleh_user_id_fk" FOREIGN KEY ("diusulkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usulan_jadwal" ADD CONSTRAINT "usulan_jadwal_diputuskan_oleh_user_id_fk" FOREIGN KEY ("diputuskan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usulan_jadwal_satu_menunggu" ON "usulan_jadwal" USING btree ("toko_id") WHERE "usulan_jadwal"."status" = 'menunggu';--> statement-breakpoint
CREATE INDEX "usulan_jadwal_toko_id_idx" ON "usulan_jadwal" USING btree ("toko_id","id");