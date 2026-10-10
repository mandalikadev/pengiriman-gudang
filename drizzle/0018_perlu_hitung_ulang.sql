-- T61: dasar perhitungan draft untuk mendeteksi "Perlu dihitung ulang": versi cache laporan dan set impor aktifnya,
-- pemetaan keluarga aroma per baris, perubahan kategori yang mengenai cakupan setiap toko, toko yang dikeluarkan saat
-- dihitung ulang, dan stok akhir toko–varian yang tidak ada lagi di draft (disimpan, PRD A7). Kolom dasar boleh kosong:
-- draft yang dihitung sebelum T61 tetap ada (beserta stok akhirnya) dan ditandai perlu dihitung ulang.
ALTER TABLE "baris_draft_rencana" ADD COLUMN "status_keluarga_aroma" text;--> statement-breakpoint
ALTER TABLE "baris_draft_rencana" ADD COLUMN "keluarga_aroma_id" integer;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD COLUMN "versi_cache_id" integer;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD COLUMN "impor_aktif" integer[];--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD COLUMN "toko_dikeluarkan" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD COLUMN "stok_tidak_dipakai" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD COLUMN "perubahan_kategori" integer[];