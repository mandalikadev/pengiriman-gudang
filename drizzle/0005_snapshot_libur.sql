CREATE TABLE "entri_libur" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entri_libur_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot_id" integer NOT NULL,
	"tanggal" date NOT NULL,
	"keterangan" text NOT NULL,
	"jenis" text NOT NULL,
	"jenis_usulan" boolean DEFAULT true NOT NULL,
	CONSTRAINT "entri_libur_jenis_dikenal" CHECK ("entri_libur"."jenis" in ('libur nasional', 'cuti bersama'))
);
--> statement-breakpoint
CREATE TABLE "kejadian_libur" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kejadian_libur_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"jenis" text NOT NULL,
	"tahun" integer NOT NULL,
	"snapshot_id" integer,
	"pesan" text,
	"pelaku" text NOT NULL,
	"terjadi_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kejadian_libur_jenis_dikenal" CHECK ("kejadian_libur"."jenis" in ('sinkronisasi-berhasil', 'sinkronisasi-gagal'))
);
--> statement-breakpoint
CREATE TABLE "snapshot_libur" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "snapshot_libur_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tahun" integer NOT NULL,
	"status" text DEFAULT 'menunggu-persetujuan' NOT NULL,
	"sumber" text NOT NULL,
	"disinkronkan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"disinkronkan_oleh" text NOT NULL,
	CONSTRAINT "snapshot_libur_status_dikenal" CHECK ("snapshot_libur"."status" in ('menunggu-persetujuan', 'aktif', 'diarsipkan'))
);
--> statement-breakpoint
ALTER TABLE "entri_libur" ADD CONSTRAINT "entri_libur_snapshot_id_snapshot_libur_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot_libur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_libur" ADD CONSTRAINT "kejadian_libur_snapshot_id_snapshot_libur_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot_libur"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_libur" ADD CONSTRAINT "kejadian_libur_pelaku_user_id_fk" FOREIGN KEY ("pelaku") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_libur" ADD CONSTRAINT "snapshot_libur_disinkronkan_oleh_user_id_fk" FOREIGN KEY ("disinkronkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entri_libur_tanggal_unik" ON "entri_libur" USING btree ("snapshot_id","tanggal");--> statement-breakpoint
CREATE INDEX "kejadian_libur_jenis_waktu_idx" ON "kejadian_libur" USING btree ("jenis","terjadi_pada");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_libur_satu_aktif_per_tahun" ON "snapshot_libur" USING btree ("tahun") WHERE "snapshot_libur"."status" = 'aktif';