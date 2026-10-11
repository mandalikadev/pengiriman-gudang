CREATE TABLE "alias_nama_stok" (
	"alias" text PRIMARY KEY NOT NULL,
	"kode_produk" text NOT NULL,
	"dibuat_oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alias_nama_stok" ADD CONSTRAINT "alias_nama_stok_kode_produk_produk_kode_fk" FOREIGN KEY ("kode_produk") REFERENCES "public"."produk"("kode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_nama_stok" ADD CONSTRAINT "alias_nama_stok_dibuat_oleh_user_id_fk" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alias_nama_stok_kode_produk_idx" ON "alias_nama_stok" USING btree ("kode_produk");