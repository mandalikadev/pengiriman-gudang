CREATE TABLE "gudang" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gudang_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nama" text NOT NULL,
	CONSTRAINT "gudang_nama_unique" UNIQUE("nama")
);
--> statement-breakpoint
CREATE TABLE "hubungan_toko_gudang" (
	"toko_id" integer PRIMARY KEY NOT NULL,
	"gudang_id" integer NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toko" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "toko_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nama" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "toko_nama_unique" UNIQUE("nama")
);
--> statement-breakpoint
ALTER TABLE "hubungan_toko_gudang" ADD CONSTRAINT "hubungan_toko_gudang_toko_id_toko_id_fk" FOREIGN KEY ("toko_id") REFERENCES "public"."toko"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubungan_toko_gudang" ADD CONSTRAINT "hubungan_toko_gudang_gudang_id_gudang_id_fk" FOREIGN KEY ("gudang_id") REFERENCES "public"."gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hubungan_toko_gudang_gudang_id_idx" ON "hubungan_toko_gudang" USING btree ("gudang_id");