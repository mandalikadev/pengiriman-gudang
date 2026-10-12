ALTER TABLE "rencana_final" DROP CONSTRAINT "rencana_final_panjang_cakupan";--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" DROP CONSTRAINT "toko_draft_rencana_panjang_cakupan";--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_panjang_cakupan" CHECK ("rencana_final"."panjang_cakupan" between 1 and 30);--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD CONSTRAINT "toko_draft_rencana_panjang_cakupan" CHECK ("toko_draft_rencana"."panjang_cakupan" between 1 and 30);