ALTER TABLE "gudang" ADD COLUMN "aktif" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "gudang_nama_tanpa_huruf_besar_unik" ON "gudang" USING btree (lower("nama"));