-- T66: draft yang dihitung sebelum buffer belum punya versi ranking. Draft adalah hasil hitung tanpa isian pengguna
-- (input stok belum ada, T59), jadi dihapus dan cukup dihitung ulang dengan ranking berlaku.
DELETE FROM "draft_rencana";--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD COLUMN "persen_buffer" integer;--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD COLUMN "masalah" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD COLUMN "jumlah_kirim" integer;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD COLUMN "versi_ranking_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD CONSTRAINT "draft_rencana_versi_ranking_id_versi_ranking_id_fk" FOREIGN KEY ("versi_ranking_id") REFERENCES "public"."versi_ranking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD CONSTRAINT "baris_draft_rencana_persen_buffer_dikenal" CHECK ("baris_draft_rencana"."persen_buffer" is null or "baris_draft_rencana"."persen_buffer" in (10, 20));--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD CONSTRAINT "baris_draft_rencana_jumlah_kirim" CHECK ("baris_draft_rencana"."jumlah_kirim" is null or "baris_draft_rencana"."jumlah_kirim" >= 0);