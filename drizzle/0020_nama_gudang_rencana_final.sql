ALTER TABLE "rencana_final" ADD COLUMN "nama_gudang" text;--> statement-breakpoint
UPDATE "rencana_final" SET "nama_gudang" = "gudang"."nama" FROM "gudang" WHERE "gudang"."id" = "rencana_final"."gudang_id";--> statement-breakpoint
ALTER TABLE "rencana_final" ALTER COLUMN "nama_gudang" SET NOT NULL;
