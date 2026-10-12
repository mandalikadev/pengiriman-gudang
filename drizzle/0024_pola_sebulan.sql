ALTER TABLE "jadwal_toko" DROP CONSTRAINT "jadwal_toko_pola_dikenal";--> statement-breakpoint
ALTER TABLE "usulan_jadwal" DROP CONSTRAINT "usulan_jadwal_pola_dikenal";--> statement-breakpoint
ALTER TABLE "jadwal_toko" ADD CONSTRAINT "jadwal_toko_pola_dikenal" CHECK ("jadwal_toko"."pola" in ('mingguan', '2x-seminggu', '3x-seminggu', 'dua-mingguan', '1x-sebulan'));--> statement-breakpoint
ALTER TABLE "usulan_jadwal" ADD CONSTRAINT "usulan_jadwal_pola_dikenal" CHECK ("usulan_jadwal"."pola" in ('mingguan', '2x-seminggu', '3x-seminggu', 'dua-mingguan', '1x-sebulan'));