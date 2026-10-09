CREATE TABLE "periode_sumber_gudang" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "periode_sumber_gudang_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"gudang_id" integer NOT NULL,
	"bulan" text[] NOT NULL,
	"ditetapkan_oleh" text NOT NULL,
	"ditetapkan_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periode_sumber_gudang_jumlah_bulan" CHECK (cardinality("periode_sumber_gudang"."bulan") between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "periode_sumber_gudang" ADD CONSTRAINT "periode_sumber_gudang_gudang_id_gudang_id_fk" FOREIGN KEY ("gudang_id") REFERENCES "public"."gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periode_sumber_gudang" ADD CONSTRAINT "periode_sumber_gudang_ditetapkan_oleh_user_id_fk" FOREIGN KEY ("ditetapkan_oleh") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "periode_sumber_gudang_gudang_id_idx" ON "periode_sumber_gudang" USING btree ("gudang_id","id");