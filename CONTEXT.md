# Dashboard Penjualan MANDALIKA

Mengubah data penjualan harian toko menjadi laporan rata-rata bertahap, lalu memakainya untuk merencanakan jumlah barang yang dikirim dari gudang ke toko.

## Organisasi dan pengguna

**Gudang**:
Tempat asal pengiriman barang ke toko. MANDALIKA punya lima: Pusat dan empat lainnya.
_Avoid_: depo, warehouse

**Pusat**:
Nama salah satu gudang. Bukan peran.
_Avoid_: memakai "pusat" untuk admin

**Toko**:
Gerai penjualan yang muncul sebagai blok kolom di sheet penjualan (misalnya PMS, PMJ) dan dapat dihubungkan ke gudang.
_Avoid_: outlet, store

**Admin**:
Peran yang mengelola konfigurasi gudang, hubungan toko, penugasan operator, hak tindakan, ranking pusat, periode sumber, dan persetujuan. Admin tidak otomatis menjadi operator.

**Operator**:
Pengguna yang ditugaskan ke gudang tertentu untuk menyiapkan jadwal, stok, perhitungan, finalisasi, dan ekspor sesuai hak tindakannya.

**Viewer**:
Pengguna yang hanya melihat laporan sesuai haknya.

**Hak tindakan**:
Izin per operator per gudang untuk satu jenis tindakan (misalnya memfinalisasi atau mengekspor).

## Impor penjualan

**Sheet penjualan**:
Sheet workbook berpola `<BULAN> (S)` dengan A1 `SALES`, berisi kuantitas harian per produk dan per toko.
_Avoid_: sheet BARDAT, sheet MP (keduanya di luar scope)

**Impor**:
Satu kali pembacaan satu sheet dari satu file, dengan status, hasil validasi, dan identitas file.
_Avoid_: upload (untuk menyebut hasilnya)

**Impor aktif**:
Impor yang menjadi sumber laporan untuk bulan impornya. Hanya satu per bulan impor.

**Bulan impor**:
Bulan kalender yang dicakup sebuah sheet penjualan.
_Avoid_: menyamakannya dengan bulan laporan

**Pengamatan**:
Kuantitas suatu produk–toko pada tanggal yang termasuk cakupan tanggal sebuah impor aktif. Bisa berupa angka terisi atau nol tersirat.

**Nol tersirat**:
Sel kosong pada tanggal valid di sheet penjualan; bernilai nol dan teramati.

**Tidak tersedia**:
Tanggal yang tidak ada di cakupan tanggal impor aktif mana pun. Tidak pernah dianggap nol.

**Kolom tanggal invalid**:
Kolom tanggal di sheet yang bukan tanggal kalender nyata (misalnya `31/6`).

## Kalender

**Kategori dasar**:
Kategori hari menurut tanggal sebenarnya: Senin–Kamis, Jumat, Sabtu, atau Minggu.

**Kategori efektif**:
Kategori yang dipakai untuk menghitung: perubahan khusus toko, lalu perubahan semua-toko, lalu kategori dasar.

**Perubahan kategori**:
Penggantian kategori satu tanggal oleh admin, dengan alasan, cakupan (semua toko atau satu toko), revisi, dan status.

**Tanggal acuan**:
Kamis di minggu yang sama untuk Senin–Kamis; tanggal itu sendiri untuk Jumat sampai Minggu.

**Bulan laporan**:
Bulan dari tanggal acuan.

**Minggu laporan**:
⌈hari tanggal acuan / 7⌉ dalam bulan laporan.
_Avoid_: ISO week, baris kalender

**Snapshot libur**:
Daftar libur satu tahun hasil sinkronisasi API, menunggu persetujuan admin sebelum aktif.

## Laporan

**Nilai mingguan**:
Hasil tahap pertama per produk–toko, kategori, bulan laporan, dan minggu laporan.

**Rata-rata bulanan**:
Hasil tahap kedua per produk–toko, kategori, dan bulan laporan.

**Rata-rata Ringkasan**:
Hasil tahap ketiga lintas bulan pilihan.

**Pembagi**:
Bilangan yang membagi suatu jumlah dalam satu tahap. Selalu ditampilkan bersama jumlahnya.

**Total penjualan mentah**:
Jumlah kuantitas teramati tanpa perataan.
_Avoid_: menyebutnya "total" tanpa kata "mentah", atau menjumlahkan rata-rata dan menamainya total

**Penanda kelengkapan**:
Tanda bahwa suatu nilai dihitung dari pengamatan parsial.

## Pengiriman gudang

**Periode sumber**:
Bulan laporan yang dipakai gudang sebagai dasar rata-rata. Ditetapkan admin per gudang.
_Avoid_: bulan ranking, filter Ringkasan

**Jadwal**:
Pengaturan hari pengiriman satu toko. Hanya satu yang aktif per toko.

**Usulan jadwal**:
Perubahan jadwal yang menunggu persetujuan admin. Tidak menggantikan jadwal aktif sebelum disetujui.

**Tanggal kirim (H)**:
Tanggal barang dikirim dari gudang.

**Persiapan (p)**:
0, 1, atau 2 hari sebelum H.

**Cakupan**:
Rentang tanggal H−p sampai H+L−1, inklusif.

**Panjang cakupan (L)**:
7 untuk pola mingguan (termasuk dua atau tiga kali seminggu); 14 untuk dua mingguan.

**Tanggal jangkar**:
Tanggal yang menentukan pekan kirim untuk pola dua mingguan.

**Kebutuhan barang**:
Jumlah rata-rata sesuai kategori efektif setiap tanggal dalam cakupan.

**Stok akhir**:
Stok toko yang diisi operator. Jika kosong, berarti belum diketahui.

**File stok**:
Ekspor stok akhir satu toko dari sistem kasir (CSV `;` atau `.xlsx`) dengan kolom `Name - Variant`, `Category`, `Ending`.
_Avoid_: menganggap nama produk di dalamnya sama dengan nama master

**Alias nama stok**:
Nama produk di file stok yang dipetakan admin ke tepat satu kode produk. Nama master adalah alias bawaan. Dicocokkan persis setelah normalisasi.
_Avoid_: pencocokan mirip/fuzzy

**Unggah stok**:
Membaca satu file stok untuk satu toko di draft rencana menjadi isian stok yang belum disimpan.
_Avoid_: menganggap hasil unggahan sudah tersimpan

**Buffer**:
Persen tambahan: 20 untuk keluarga aroma tujuh besar, 10 untuk produk otomatis lainnya.

**Jumlah kirim**:
max(0, ⌈(kebutuhan − stok akhir) × (1 + buffer)⌉).

**Ranking pusat**:
Urutan keluarga aroma dari file yang dipublikasikan admin, dengan bulan ranking dan versi. Setiap baris file ranking adalah satu keluarga aroma (kelompok ranking). Yang berlaku untuk semua gudang adalah ranking terakhir yang dipublikasikan.

**Bulan ranking**:
Bulan yang melekat pada satu versi ranking pusat.

**Keluarga aroma**:
Kelompok varian yang menjadi satu baris di file ranking pusat, dipetakan oleh admin. Biasanya varian dengan aroma yang sama (misalnya Gorgeous Tuberose), tetapi tidak selalu aroma: GIFT SET BOX (produk kotak hadiah) juga satu kelompok.
_Avoid_: menebaknya dari kemiripan nama

**Varian**:
Satu produk dengan satu kode produk.
_Avoid_: SKU dan produk dipakai bergantian tanpa kode

**Varian rework**:
Varian berakhiran `-R`. SKU tersendiri dalam keluarga aroma yang sama.

**Produk manual**:
Display tester (kode `-T`) dan kertas tester (kategori `KTP`/`KTL`). Tanpa jumlah kirim dan tanpa buffer otomatis.

**Produk otomatis**:
Semua produk selain produk manual.

**Draft rencana**:
Hasil hitung kebutuhan yang belum final. Bisa ditandai perlu dihitung ulang.

**Finalisasi**:
Menyimpan rencana beserta snapshot semua masukannya. Bukan konfirmasi pengiriman fisik.
_Avoid_: kirim, terima

**Rencana final**:
Rencana yang sudah difinalisasi. Tidak berubah oleh perubahan data berikutnya.
