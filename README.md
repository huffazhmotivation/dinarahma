# Etalase Shopee (Link-in-bio) untuk Cloudflare Pages

Isi paket:

```
public/index.html              halaman publik + panel admin (/#admin)
public/_headers                header keamanan + cache
public/_redirects              /admin membuka halaman yang sama
functions/api/links.js         login admin + simpan/baca data (Pages Function + Workers KV)
package.json                   wrangler (untuk tes lokal / deploy lewat CLI)
.dev.vars.example              contoh variabel untuk tes lokal
```

## Fitur tampilan

Tombol kecil di bar kategori (sebelah kolom cari) mengganti dua mode:

- **Thumbnail**: kartu dengan gambar (tampilan lama).
- **Daftar teks**: hanya nomor + nama produk + harga, satu baris per produk. Ketuk baris untuk intip detail, tombol panah untuk langsung ke Shopee.

Pilihan mode diingat di browser pengunjung. Nomor sama di kedua mode, jadi pencarian nomor (mis. `12`) tetap jalan.

## Cara deploy (lewat GitHub)

1. Upload semua file ke repo GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pilih repo.
3. Pengaturan build:
   - Framework preset: **None**
   - Build command: *(kosongkan)*
   - Build output directory: **`public`**
4. **Deploy**. Situs tayang, tapi admin belum bisa menyimpan sampai langkah di bawah.

## Pasang penyimpanan (KV) dan kata sandi

1. **Storage & databases → KV → Create** namespace, namanya bebas (mis. `etalase`).
2. Buka project Pages kamu → **Settings → Bindings → Add → KV namespace**:
   - Variable name: **`ETALASE`** (harus persis)
   - KV namespace: yang tadi dibuat
3. **Settings → Variables and Secrets → Add**:

| Nama | Isi |
|---|---|
| `ADMIN_PASSWORD` | kata sandi pilihanmu (panjang & unik) |
| `TOKEN_SECRET` | teks acak panjang (opsional tapi disarankan) |

4. Isi untuk environment **Production** (dan **Preview** kalau dipakai), lalu **Deployments → Retry deployment** supaya aktif.

## Pindah data dari Netlify

1. Di situs Netlify lama: buka `/#admin` → **Ekspor JSON**.
2. Di situs Cloudflare baru: buka `/#admin` → masuk → **Impor JSON** → pilih file → **Simpan**.

## Cara pakai

- Halaman publik: `https://namaprojectmu.pages.dev/`
- Panel admin: `https://namaprojectmu.pages.dev/#admin` (atau `/admin`)
- Edit profil, tambah/hapus/urutkan produk, ganti warna, lalu **Simpan**. Perubahan tampil ke semua pengunjung tanpa deploy ulang.
- Login berlaku 30 hari di browser yang sama; ganti `ADMIN_PASSWORD` untuk mencabut semua sesi.
- Domain sendiri: project Pages → **Custom domains**.

## Tes lokal / deploy lewat CLI

```bash
npm install
cp .dev.vars.example .dev.vars     # lalu isi kata sandinya
npm run dev                        # http://localhost:8788

# deploy manual (opsional, kalau tidak pakai GitHub)
npx wrangler login
npx wrangler pages project create etalase-shopee --production-branch main
npm run deploy
```

Setelah deploy manual pertama, pasang binding KV `ETALASE` dan variabel di dashboard seperti langkah di atas.

## Catatan

- Data disimpan di Workers KV. Setelah **Simpan**, pengunjung di lokasi lain bisa butuh sampai sekitar 1 menit sebelum melihat perubahan (sifat KV).
- Jika `ADMIN_PASSWORD` atau binding `ETALASE` belum dipasang, admin menampilkan pesan error yang jelas.
- Tidak ada `wrangler.toml` sengaja, supaya binding dan variabel diatur dari dashboard.
