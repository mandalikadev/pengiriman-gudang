CREATE TABLE "baris_ranking" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "baris_ranking_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"versi_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"variant" text NOT NULL,
	"qty_sales" integer NOT NULL,
	"keluarga_aroma_id" integer
);
--> statement-breakpoint
CREATE TABLE "versi_ranking" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "versi_ranking_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bulan_ranking" text NOT NULL,
	"versi" integer NOT NULL,
	"nama_file" text NOT NULL,
	"ukuran_byte" bigint NOT NULL,
	"kunci_objek" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"error_validasi" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diunggah_oleh" text NOT NULL,
	"diunggah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"dipublikasikan_oleh" text,
	"dipublikasikan_pada" timestamp with time zone,
	"diarsipkan_pada" timestamp with time zone,
	CONSTRAINT "versi_ranking_kunci_objek_unique" UNIQUE("kunci_objek"),
	CONSTRAINT "versi_ranking_status_dikenal" CHECK ("versi_ranking"."status" in ('draft', 'dipublikasikan', 'diarsipkan')),
	CONSTRAINT "versi_ranking_bulan_valid" CHECK ("versi_ranking"."bulan_ranking" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "baris_ranking" ADD CONSTRAINT "baris_ranking_versi_id_versi_ranking_id_fk" FOREIGN KEY ("versi_id") REFERENCES "public"."versi_ranking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baris_ranking" ADD CONSTRAINT "baris_ranking_keluarga_aroma_id_keluarga_aroma_id_fk" FOREIGN KEY ("keluarga_aroma_id") REFERENCES "public"."keluarga_aroma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versi_ranking" ADD CONSTRAINT "versi_ranking_diunggah_oleh_user_id_fk" FOREIGN KEY ("diunggah_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versi_ranking" ADD CONSTRAINT "versi_ranking_dipublikasikan_oleh_user_id_fk" FOREIGN KEY ("dipublikasikan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "baris_ranking_versi_rank_unik" ON "baris_ranking" USING btree ("versi_id","rank");--> statement-breakpoint
CREATE INDEX "baris_ranking_keluarga_aroma_id_idx" ON "baris_ranking" USING btree ("keluarga_aroma_id");--> statement-breakpoint
CREATE UNIQUE INDEX "versi_ranking_bulan_versi_unik" ON "versi_ranking" USING btree ("bulan_ranking","versi");--> statement-breakpoint
CREATE UNIQUE INDEX "versi_ranking_satu_dipublikasikan" ON "versi_ranking" USING btree ("status") WHERE "versi_ranking"."status" = 'dipublikasikan';