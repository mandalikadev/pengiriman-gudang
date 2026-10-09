CREATE TABLE "penugasan_operator" (
	"user_id" text NOT NULL,
	"gudang_id" integer NOT NULL,
	"hak_tindakan" text[] DEFAULT '{}'::text[] NOT NULL,
	"dibuat_pada" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah_pada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "penugasan_operator_user_id_gudang_id_pk" PRIMARY KEY("user_id","gudang_id"),
	CONSTRAINT "penugasan_operator_hak_tindakan_dikenal" CHECK ("penugasan_operator"."hak_tindakan" <@ ARRAY['kelola-usulan-jadwal', 'input-stok', 'hitung-kebutuhan', 'finalisasi', 'ekspor']::text[])
);
--> statement-breakpoint
ALTER TABLE "penugasan_operator" ADD CONSTRAINT "penugasan_operator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan_operator" ADD CONSTRAINT "penugasan_operator_gudang_id_gudang_id_fk" FOREIGN KEY ("gudang_id") REFERENCES "public"."gudang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "penugasan_operator_gudang_id_idx" ON "penugasan_operator" USING btree ("gudang_id");