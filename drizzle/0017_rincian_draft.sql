-- T60: dasar rincian perhitungan per baris draft. Kolom boleh kosong: draft yang dihitung sebelum T60 tetap ada
-- (beserta stok akhir yang sudah diisi, T59) dan rinciannya tampil setelah draft dihitung ulang.
ALTER TABLE "baris_draft_rencana" ADD COLUMN "rincian" jsonb;--> statement-breakpoint
ALTER TABLE "draft_rencana" ADD COLUMN "bulan_sumber" jsonb;--> statement-breakpoint
ALTER TABLE "toko_draft_rencana" ADD COLUMN "cakupan" jsonb;