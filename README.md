# Etalase Shopee (Link-in-bio) untuk Netlify

Isi paket:

```
index.html                     halaman publik + panel admin (/#admin)
netlify/functions/links.mjs    login admin + simpan/baca data (Netlify Blobs)
netlify.toml                   konfigurasi build
package.json                   dependensi function
```

## Cara deploy

> Function butuh build di Netlify, jadi **jangan** pakai drag & drop folder biasa. Pakai salah satu cara ini:

### Cara A: lewat GitHub (paling mudah)
1. Buat repo GitHub baru, upload semua file di folder ini.
2. Netlify → **Add new site → Import an existing project** → pilih repo itu.
3. Biarkan pengaturan build default (sudah dibaca dari `netlify.toml`) → **Deploy**.
4. Atur kata sandi admin (langkah di bawah), lalu **Deploy → Trigger deploy** sekali lagi.

### Cara B: lewat Netlify CLI
```bash
npm i -g netlify-cli
cd folder-ini
npm install
netlify login
netlify init            # buat site baru
netlify env:set ADMIN_PASSWORD "kata-sandi-kuat-kamu"
netlify env:set TOKEN_SECRET "$(openssl rand -hex 24)"
netlify deploy --build --prod
```

## Atur kata sandi admin (wajib)

Netlify → **Site configuration → Environment variables → Add a variable**:

| Key | Value |
|---|---|
| `ADMIN_PASSWORD` | kata sandi pilihanmu (panjang & unik) |
| `TOKEN_SECRET` | teks acak panjang (opsional tapi disarankan) |

Setelah menyimpan variabel, jalankan **Trigger deploy** supaya aktif.

## Cara pakai

- Halaman publik: `https://namasitusmu.netlify.app/`
- Panel admin: `https://namasitusmu.netlify.app/#admin` → masuk dengan `ADMIN_PASSWORD`
- Panel admin punya **pratinjau langsung**: di layar lebar tampil di sisi kanan, di ponsel buka lewat tombol **Pratinjau** di bar atas. Setiap ketikan langsung terlihat sebelum disimpan.
- Edit profil, tambah/hapus/urutkan produk, ganti warna, lalu tekan **Simpan**. Perubahan langsung tampil ke semua pengunjung, tanpa deploy ulang.
- Sebelum ada data tersimpan, halaman menampilkan contoh bawaan.
- Tombol **Ekspor JSON** untuk cadangan data.

## Catatan

- Data disimpan di Netlify Blobs (otomatis aktif di Netlify, tanpa setup tambahan).
- Login berlaku 30 hari di browser yang sama; ganti `ADMIN_PASSWORD` untuk mencabut semua sesi.
- Tes lokal: `netlify dev` (butuh Netlify CLI), lalu buka `http://localhost:8888`.
- Kalau mau domain sendiri: Domain management → Add custom domain.
