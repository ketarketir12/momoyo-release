# MOMOYO Live

Aplikasi undian giveaway (CAP-CIP-CUP WIN + Peach Podium) dengan overlay transparan untuk OBS.
Server lokal Python (hanya pustaka standar) + halaman operator + pemasang Windows.

## Isi repo

| Folder | Isi |
| --- | --- |
| `app/` | Server, panel operator, overlay, launcher, updater |
| `runtime/python/` | Python 3.13 embeddable (Windows x64), ikut dibundel ke paket |
| `package/` | Berkas di akar ZIP portabel (`MOMOYO Live.cmd`, `Tutup MOMOYO Live.cmd`, `00 - Baca Dulu.txt`) |
| `installer/` | Sumber pemasang + uninstaller (`Setup.cs`, satu exe untuk keduanya) dan ikon |
| `tools/build.py` | Membangun ZIP portabel dan pemasang ke `dist/` |
| `tests/run_tests.py` | Uji pasang, upgrade, downgrade, uninstall, dan server |
| `.github/workflows/build.yml` | Menjalankan build dan uji di Windows setiap push |

## Alur kerja

1. Ubah kode. Naikkan versi di **lima tempat** yang harus sama (build menolak kalau berbeda):
   `VERSION`, `app/server.py` (`VERSION = '...'`), `app/VERSION.txt`, `package/00 - Baca Dulu.txt`,
   serta baris "versi portabel ..." di `app/BACA-DULU.txt` (tambahkan catatan versi di bagian CATATAN VERSI).
2. `git commit` dan `git push`. GitHub Actions membangun di Windows dan menjalankan semua uji.
3. Buka tab Actions, pastikan hijau, lalu unduh artifact `momoyo-live-<hash>` (berisi pemasang, ZIP, dan checksum).
4. Untuk rilis: buat GitHub Release dengan tag `vX.Y.Z` yang lebih tinggi dari versi terpasang, lalu unggah
   `MOMOYO-Portable-Windows-x64.zip` (nama harus persis ini) dan pemasang `.exe`.
   Tombol "Cek pembaruan" di panel membaca rilis terbaru dari repo ini dan memeriksa checksum SHA-256 aset.

## Build lokal

- Windows: `python tools/build.py` lalu `python tests/run_tests.py` (butuh .NET Framework 4 yang sudah ada di Windows 10/11).
- Linux/macOS dengan Mono: `python3 tools/build.py --allow-mono`. Hasilnya hanya untuk uji lokal. Jangan dirilis:
  Mono menawarkan overload `String` yang tidak ada di .NET Framework Windows dan menyebabkan crash saat dijalankan.

## Aturan penting

- Jangan mengganti nama aset `MOMOYO-Portable-Windows-x64.zip`; updater mencarinya dengan nama itu.
- Hentikan MOMOYO yang sedang berjalan sebelum `tests/run_tests.py` (uji memakai port 8766).
- Pemasang belum ditandatangani digital; Windows SmartScreen bisa menampilkan peringatan.
- Data operator (`data/`, `giveaway-state.json`, `podium-state.json`) tidak boleh masuk repo (lihat `.gitignore`).
- `.gitattributes` mematikan konversi akhir baris (`* -text`). Berkas `.cmd` dan `.txt` memang CRLF; pertahankan saat mengedit.
