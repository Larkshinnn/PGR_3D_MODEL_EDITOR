# Kurumi 3D Viewer

Viewer dan editor karakter 3D di browser, dibangun dengan Vite dan three.js. Awalnya untuk melihat model karakter dengan shader cel bergaya PGR, sekarang bisa dipakai untuk pose, ganti bagian model, lalu ekspor hasilnya ke `.glb`.

Arahnya: editor "ala Blender" yang tetap gampang dipakai — satu klik atau otomatis, selalu ada cara untuk membatalkan.

## Fitur

- **Tampilan** — shader cel gaya PGR, mode PBR asli, atau polos. Outline, post-processing dengan LUT, cubemap studio, latar terang/gelap.
- **Animasi** — daftar klip dari manifest model, bisa dijeda di frame tertentu.
- **Pose** — handle sendi langsung di model, pose jari (titik ujung jari, slider per jari, bentuk tangan siap pakai), library pose, fisika rambut/baju saat pose.
- **Bagian model** — sembunyikan bagian (baju, sepatu, dll.), tambal tubuh otomatis untuk bagian yang bolong (kulit menimpa permukaan bagian yang hilang, atau anggota tubuh polos), ambil bagian dari karakter lain.
- **Aksesori** — klik di model untuk menempel aksesori, bisa ikut tulang.
- **Edit face** — mode edit mesh sederhana (Tab), pilih Box/Kuas/Linked, hapus atau pisah face.
- **Beberapa karakter** dalam satu scene — satu yang diedit, sisanya tetap tampil dan beranimasi.
- **Proyek & ekspor** — simpan proyek di browser (IndexedDB), ekspor `.glb` yang bisa dibuka di Blender.
- **Pintasan keyboard** ala Blender.

## Menjalankan

Butuh Node.js 20+ (dikembangkan di Node 24).

```bash
npm install
npm run dev        # dev server Vite
npm run build      # build ke dist/
npm run preview    # jalankan hasil build
```

Model dan daftar karakter dimuat dari jaringan saat runtime, jadi perlu koneksi internet.

### Parameter URL

| Parameter | Contoh | Fungsi |
| --- | --- | --- |
| `base` | `?base=https://.../model/` | Muat model dari folder lain (harus berisi `manifest.json`) |
| `clip` | `?clip=Stand1` | Langsung buka klip animasi, lewati katalog |
| `t` | `?t=0.46` | Jeda di detik tertentu |
| `cam` | `?cam=front` | Posisi kamera awal |
| `bg` | `?bg=flat` | Latar polos |
| `grid` / `shadow` | `?grid=1&shadow=0` | Tampilkan grid, matikan bayangan |

## Test

```bash
npm test                 # semua test node (tanpa browser)
npm run test:pose        # atau satu per satu: pose, fingers, limbs, patch, editor, glb, pgr-export
npm run test:parity      # cek render di Chrome headless
```

- `test:patch` membaca `base.glb` dari root project. File ini tidak ikut di-repo (aset game, 17 MB); unduh sendiri dari folder model default lalu taruh di root.
- `test:parity` dan `tests/e2e_v2.spec.js` butuh Google Chrome di `C:/Program Files/Google/Chrome/Application/chrome.exe` dan menulis screenshot serta profil Chrome ke `tests/output/`. Matikan dev server dulu (atau set `PARITY_OUT_DIR` di luar project) supaya Vite tidak crash karena EBUSY.

## Struktur

```
index.html          UI utama
src/
  main.js           scene, loader, UI, multi-karakter
  post.js           post-processing & LUT
  animation.js      pemutar klip
  api/huaxu.js      daftar & detail karakter
  materials/        shader toon PGR, wajah, outline
  pose/             rig, handle sendi, jari, korektif, collider
  editor/           tambal tubuh, edit mesh, proyek, ekspor .glb
  style.css
public/             LUT dan cubemap
tests/              test node + test browser
```

## Catatan

Proyek pribadi untuk belajar rendering dan editing karakter. Model, tekstur, dan karakter adalah milik pemegang hak cipta masing-masing dan tidak disertakan di repo ini.
