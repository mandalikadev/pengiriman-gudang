CREATE TABLE "pengiriman_di_luar_jadwal" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pengiriman_di_luar_jadwal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"gudang_id" integer NOT NULL,
	"toko_id" integer NOT NULL,
	"jenis" text NOT NULL,
	"tanggal_kirim" date NOT NULL,
	"persiapan_hari" integer NOT NULL,
	"tanggal_rutin_dipindah" date,
	"alasan" text NOT NULL,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"diusulkan_oleh" text NOT NULL,
	"diusulkan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diputuskan_oleh" text,
	"diputuskan_pada" timestamp with time zone,
	"alasan_penolakan" text,
	"dibatalkan_oleh" text,
	"dibatalkan_pada" timestamp with time zone,
	"alasan_pembatalan" text,
	"ditarik_pada" timestamp with time zone,
	CONSTRAINT "pengiriman_di_luar_jadwal_jenis_dikenal" CHECK ("pengiriman_di_luar_jadwal"."jenis" in ('tambahan', 'pindah')),
	CONSTRAINT "pengiriman_di_luar_jadwal_status_dikenal" CHECK ("pengiriman_di_luar_jadwal"."status" in ('menunggu', 'berlaku', 'ditolak', 'ditarik', 'dibatalkan')),
	CONSTRAINT "pengiriman_di_luar_jadwal_persiapan" CHECK ("pengiriman_di_luar_jadwal"."persiapan_hari" in (0, 1, 2)),
	CONSTRAINT "pengiriman_di_luar_jadwal_tanggal_rutin_sesuai_jenis" CHECK (("pengiriman_di_luar_jadwal"."jenis" = 'pindah') = ("pengiriman_di_luar_jadwal"."tanggal_rutin_dipindah" is not null) and "pengiriman_di_luar_jadwal"."tanggal_rutin_dipindah" is distinct from "pengiriman_di_luar_jadwal"."tanggal_kirim"),
	CONSTRAINT "pengiriman_di_luar_jadwal_alasan" CHECK (btrim("pengiriman_di_luar_jadwal"."alasan") <> ''),
	CONSTRAINT "pengiriman_di_luar_jadwal_jejak_keputusan" CHECK (("pengiriman_di_luar_jadwal"."diputuskan_oleh" is null) = ("pengiriman_di_luar_jadwal"."diputuskan_pada" is null) and ("pengiriman_di_luar_jadwal"."status" not in ('menunggu', 'ditarik') or "pengiriman_di_luar_jadwal"."diputuskan_pada" is null) and ("pengiriman_di_luar_jadwal"."status" <> 'ditolak' or "pengiriman_di_luar_jadwal"."diputuskan_pada" is not null)),
	CONSTRAINT "pengiriman_di_luar_jadwal_alasan_penolakan" CHECK (("pengiriman_di_luar_jadwal"."status" = 'ditolak') = ("pengiriman_di_luar_jadwal"."alasan_penolakan" is not null) and coalesce(btrim("pengiriman_di_luar_jadwal"."alasan_penolakan"), 'x') <> ''),
	CONSTRAINT "pengiriman_di_luar_jadwal_jejak_pembatalan" CHECK (("pengiriman_di_luar_jadwal"."status" = 'dibatalkan') = ("pengiriman_di_luar_jadwal"."dibatalkan_pada" is not null and "pengiriman_di_luar_jadwal"."alasan_pembatalan" is not null) and ("pengiriman_di_luar_jadwal"."dibatalkan_oleh" is null or "pengiriman_di_luar_jadwal"."status" = 'dibatalkan') and coalesce(btrim("pengiriman_di_luar_jadwal"."alasan_pembatalan"), 'x') <> ''),
	CONSTRAINT "pengiriman_di_luar_jadwal_jejak_penarikan" CHECK (("pengiriman_di_luar_jadwal"."status" = 'ditarik') = ("pengiriman_di_luar_jadwal"."ditarik_pada" is not null))
);
--> statement-breakpoint
ALTER TABLE "usulan_jadwal" DROP CONSTRAINT "usulan_jadwal_jejak_keputusan";--> statement-breakpoint
ALTER TABLE "pengiriman_di_luar_jadwal" ADD CONSTRAINT "pengiriman_di_luar_jadwal_gudang_id_gudang_id_fk" FOREIGN KEY ("gudang_id") REFERENCES "public"."gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengiriman_di_luar_jadwal" ADD CONSTRAINT "pengiriman_di_luar_jadwal_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengiriman_di_luar_jadwal" ADD CONSTRAINT "pengiriman_di_luar_jadwal_diusulkan_oleh_user_id_fk" FOREIGN KEY ("diusulkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengiriman_di_luar_jadwal" ADD CONSTRAINT "pengiriman_di_luar_jadwal_diputuskan_oleh_user_id_fk" FOREIGN KEY ("diputuskan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengiriman_di_luar_jadwal" ADD CONSTRAINT "pengiriman_di_luar_jadwal_dibatalkan_oleh_user_id_fk" FOREIGN KEY ("dibatalkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pengiriman_di_luar_jadwal_toko_tanggal_kirim_unik" ON "pengiriman_di_luar_jadwal" USING btree ("toko_id","tanggal_kirim") WHERE "pengiriman_di_luar_jadwal"."status" in ('menunggu', 'berlaku');--> statement-breakpoint
CREATE UNIQUE INDEX "pengiriman_di_luar_jadwal_toko_tanggal_rutin_unik" ON "pengiriman_di_luar_jadwal" USING btree ("toko_id","tanggal_rutin_dipindah") WHERE "pengiriman_di_luar_jadwal"."status" in ('menunggu', 'berlaku') and "pengiriman_di_luar_jadwal"."tanggal_rutin_dipindah" is not null;--> statement-breakpoint
CREATE INDEX "pengiriman_di_luar_jadwal_gudang_id_idx" ON "pengiriman_di_luar_jadwal" USING btree ("gudang_id","id");--> statement-breakpoint
ALTER TABLE "usulan_jadwal" ADD CONSTRAINT "usulan_jadwal_jejak_keputusan" CHECK (("usulan_jadwal"."status" <> 'menunggu') = ("usulan_jadwal"."diputuskan_pada" is not null) and ("usulan_jadwal"."diputuskan_oleh" is null or "usulan_jadwal"."diputuskan_pada" is not null));--> statement-breakpoint
-- T113 (PRD A5 ▶ Revisi 2026-10-13): alur usulan jadwal tetap dihapus. Usulan lama yang masih menunggu ditutup sebagai
-- ditolak oleh sistem (tanpa pemutus); semua usulan lama tetap tersimpan sebagai riwayat.
UPDATE "usulan_jadwal" SET "status" = 'ditolak', "alasan_penolakan" = 'Alur usulan jadwal tetap dihapus (keputusan pemilik 2026-10-13)', "diputuskan_pada" = now() WHERE "status" = 'menunggu';
