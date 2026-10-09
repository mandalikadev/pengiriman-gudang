CREATE TABLE "alias_keluarga_aroma" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alias_keluarga_aroma_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"keluarga_id" integer NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "alias_keluarga_aroma_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE "keluarga_aroma" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "keluarga_aroma_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nama" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alias_keluarga_aroma" ADD CONSTRAINT "alias_keluarga_aroma_keluarga_id_keluarga_aroma_id_fk" FOREIGN KEY ("keluarga_id") REFERENCES "public"."keluarga_aroma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alias_keluarga_aroma_keluarga_id_idx" ON "alias_keluarga_aroma" USING btree ("keluarga_id");