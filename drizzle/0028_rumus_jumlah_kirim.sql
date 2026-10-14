-- T126 (PRD A6 ▶ Revisi 2026-10-14): rencana final menyimpan rumus jumlah kirim yang dipakai. Rencana final yang sudah
-- ada difinalisasi dengan rumus lama dan tetap begitu (snapshot); finalisasi sesudahnya memakai stok target.
ALTER TABLE "rencana_final" ADD COLUMN "rumus_jumlah_kirim" text DEFAULT 'lama' NOT NULL;--> statement-breakpoint
ALTER TABLE "rencana_final" ALTER COLUMN "rumus_jumlah_kirim" SET DEFAULT 'stok-target';--> statement-breakpoint
ALTER TABLE "rencana_final" ADD CONSTRAINT "rencana_final_rumus_jumlah_kirim" CHECK ("rencana_final"."rumus_jumlah_kirim" in ('stok-target', 'lama'));--> statement-breakpoint
-- Draft yang belum final mengikuti stok target tanpa dihitung ulang: jumlah kirim = max(0, ⌈kebutuhan × (100 + buffer)
-- / 100⌉ − stok akhir), dengan bilangan bulat (ADR-0008). Stok akhir, masalah, dan baris tanpa jumlah kirim tidak berubah.
UPDATE "baris_draft_rencana" SET "jumlah_kirim" = greatest(0, ("kebutuhan"::bigint * (100 + "persen_buffer") + 99) / 100 - "stok_akhir") WHERE "jumlah_kirim" is not null and "kebutuhan" is not null and "stok_akhir" is not null and "persen_buffer" is not null;
