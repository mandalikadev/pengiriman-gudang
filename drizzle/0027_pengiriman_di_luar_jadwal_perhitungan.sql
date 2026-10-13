ALTER TABLE "rencana_final" DROP CONSTRAINT "rencana_final_panjang_cakupan";--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" DROP CONSTRAINT "toko_draft_rencana_panjang_cakupan";--> statement-breakpoint
ALTER TABLE "rencana_final" ADD COLUMN "jenis_pengiriman" text DEFAULT 'rutin' NOT NULL;--> statement-breakpoint
ALTER TABLE "rencana_final" ADD COLUMN "di_luar_jadwal" jsonb;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD COLUMN "jenis_pengiriman" text;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD COLUMN "pengiriman_di_luar_jadwal_id" integer;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD COLUMN "kiriman_sebelumnya_belum_sampai" date;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_pengiriman_di_luar_jadwal_id_pengiriman_di_luar_jadwal_id_fk" FOREIGN KEY ("pengiriman_di_luar_jadwal_id") REFERENCES "public"."pengiriman_di_luar_jadwal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_jenis_pengiriman" CHECK ("rencana_final"."jenis_pengiriman" in ('rutin', 'tambahan', 'pindah') and ("rencana_final"."jenis_pengiriman" = 'rutin') = ("rencana_final"."di_luar_jadwal" is null));--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_panjang_cakupan" CHECK ("rencana_final"."panjang_cakupan" >= 1);--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_jenis_pengiriman" CHECK (("toko_draft_rencana"."jenis_pengiriman" is null or "toko_draft_rencana"."jenis_pengiriman" in ('rutin', 'tambahan', 'pindah')) and (coalesce("toko_draft_rencana"."jenis_pengiriman", 'rutin') = 'rutin') = ("toko_draft_rencana"."pengiriman_di_luar_jadwal_id" is null));--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_panjang_cakupan" CHECK ("toko_draft_rencana"."panjang_cakupan" >= 1);