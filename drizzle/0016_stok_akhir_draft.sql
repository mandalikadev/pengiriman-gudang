-- T59: stok akhir per toko–varian di draft. Kosong = belum diketahui (bukan nol); boleh negatif.
ALTER TABLE "baris_draft_rencana" ADD COLUMN "stok_akhir" integer;