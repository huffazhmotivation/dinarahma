/* Cloudflare Pages Function: /api/links
   - login admin, cek sesi, baca (publik) dan simpan (admin) data etalase
   - data disimpan di Workers KV (binding: ETALASE)
   - variabel: ADMIN_PASSWORD (wajib), TOKEN_SECRET (disarankan) */

const KEY = "config";
const TTL = 30 * 24 * 3600 * 1000; // sesi login 30 hari
const HEAD = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEAD });

/* ---------- auth (Web Crypto, tanpa modul Node) ---------- */
const enc = new TextEncoder();
const b64u = (buf) => {
  let s = "";
  for (const c of new Uint8Array(buf)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
};
const secret = (env) => (env.TOKEN_SECRET || "") + "|" + (env.ADMIN_PASSWORD || "");
const sign = async (env, p) => {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(p)));
};
const eq = (a, b) => {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const samePw = async (env, given) => eq(await sign(env, "pw:" + given), await sign(env, "pw:" + env.ADMIN_PASSWORD));
const makeToken = async (env) => {
  const p = b64u(enc.encode(JSON.stringify({ exp: Date.now() + TTL })));
  return p + "." + (await sign(env, p));
};
const authed = async (req, env) => {
  if (!env.ADMIN_PASSWORD) return false;
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [p, s] = t.split(".");
  if (!p || !s || !eq(await sign(env, p), s)) return false;
  try {
    return JSON.parse(fromB64u(p)).exp > Date.now();
  } catch {
    return false;
  }
};

/* ---------- sanitasi data ---------- */
const str = (v, max) => (v == null ? "" : String(v)).trim().slice(0, max);
const url = (v, max = 800) => {
  let u = str(v, max);
  if (!u) return "";
  if (/^(javascript|data|vbscript|file):/i.test(u)) return "";
  if (/^(mailto|tel):/i.test(u)) return u;
  if (/^\/(?!\/)/.test(u)) return u; // path file di situs sendiri, mis. /foto.jpg
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/\//, "");
  return u;
};
const clean = (d) => {
  if (!d || typeof d !== "object" || !Array.isArray(d.items)) return null;
  return {
    name: str(d.name, 60),
    role: str(d.role, 100),
    bio: str(d.bio, 300),
    photo: url(d.photo, 500),
    footer: str(d.footer, 80),
    disclosure: str(d.disclosure, 300),
    accent: /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent.toLowerCase() : "#a85f40",
    ticker: (Array.isArray(d.ticker) ? d.ticker : []).map((t) => str(t, 80)).filter(Boolean).slice(0, 20),
    items: d.items.slice(0, 300).map((i) => ({
      id: str(i && i.id, 20) || Math.random().toString(36).slice(2, 9),
      title: str(i && i.title, 120),
      url: url(i && i.url),
      image: url(i && i.image),
      price: str(i && i.price, 40),
      cat: str(i && i.cat, 30),
      tag: str(i && i.tag, 24),
      desc: str(i && i.desc, 300),
      featured: !!(i && i.featured),
      on: !(i && i.on === false),
    })),
  };
};


/* ---------- ambil gambar/judul/harga dari link Shopee (hanya admin) ---------- */
// Hanya host Shopee yang boleh diambil (mencegah endpoint disalahgunakan untuk situs lain).
const SHOPEE_HOST = /(^|\.)(shopee\.[a-z.]+|shope\.ee|shp\.ee|shopeemobile\.com)$/i;
const AGENTS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "WhatsApp/2.23.20.0 A",
  "Twitterbot/1.0",
];
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const fail = (m) => Object.assign(new Error(m), { user: true });
const decodeEnt = (t) =>
  String(t || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
const meta = (html, names) => {
  for (const n of names) {
    const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + n + '["\'][^>]*?content=["\']([^"\']*)["\']', "i");
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*?(?:property|name)=["\']' + n + '["\']', "i");
    const m = html.match(re1) || html.match(re2);
    if (m && m[1].trim()) return decodeEnt(m[1].trim());
  }
  return "";
};
const rupiah = (v) => {
  const n = Math.round(parseFloat(String(v).replace(/[^\d.]/g, "")));
  return n > 0 ? "Rp " + n.toLocaleString("id-ID") : "";
};
const cleanTitle = (t) => String(t || "").replace(/\s*\|\s*Shopee.*$/i, "").replace(/^Jual\s+/i, "").trim().slice(0, 120);

// ikuti pengalihan (affiliate shortlink -> halaman produk), tiap hop dicek host-nya
const getPage = async (start, ua) => {
  let u = new URL(start);
  for (let hop = 0; hop < 6; hop++) {
    if (!/^https?:$/.test(u.protocol) || !SHOPEE_HOST.test(u.hostname)) throw fail("Link dialihkan ke situs non-Shopee.");
    const r = await fetch(u.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml", "Accept-Language": "id-ID,id;q=0.9" },
    });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { u = new URL(loc, u); continue; }
    const html = (await r.text()).slice(0, 600000);
    if (!meta(html, ["og:image"])) {
      const m = html.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i) || html.match(/location(?:\.href)?\s*=\s*["'](https?:[^"']+)["']/i);
      if (m && hop < 5) { try { u = new URL(decodeEnt(m[1]), u); continue; } catch (_) {} }
    }
    return { html, final: u.toString(), status: r.status };
  }
  throw fail("Terlalu banyak pengalihan.");
};

const fromHtml = (html, base) => {
  let image = meta(html, ["og:image:secure_url", "og:image", "twitter:image"]);
  let title = meta(html, ["og:title", "twitter:title"]);
  let price = meta(html, ["product:price:amount", "og:price:amount"]);
  if (!image || !title || !price) {
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const j = JSON.parse(m[1]);
        const p = (Array.isArray(j) ? j : [j]).find((x) => x && /product/i.test(x["@type"] || ""));
        if (!p) continue;
        if (!image) image = [].concat(p.image || [])[0] || "";
        if (!title) title = p.name || "";
        if (!price && p.offers) { const o = [].concat(p.offers)[0]; price = o.price || o.lowPrice || ""; }
      } catch (_) {}
    }
  }
  try { if (image) image = new URL(image, base).toString(); } catch (_) { image = ""; }
  return { title: cleanTitle(title), image: /^https?:\/\//i.test(image) ? image : "", price: rupiah(price) };
};

// ambil shopid/itemid dari URL produk (termasuk yang terbungkus parameter redirect)
const idsOf = (s) => {
  let t = String(s || "");
  try { t += " " + decodeURIComponent(t); } catch (_) {}
  const m = t.match(/\/product\/(\d+)\/(\d+)/) || t.match(/-i\.(\d+)\.(\d+)/) || t.match(/\/(\d{5,})\/(\d{5,})(?:[/?#\s]|$)/);
  return m ? { shop: m[1], item: m[2] } : null;
};

// cadangan: API publik web Shopee (kadang diblokir untuk server)
const viaApi = async (final, ids) => {
  const host = new URL(final).hostname;
  const tld = (host.match(/shopee\.(.+)$/i) || [])[1] || "co.id";
  const site = "shopee." + tld;
  const cc = tld.split(".").pop();
  const H = {
    "User-Agent": MOBILE_UA, Accept: "application/json", "X-Requested-With": "XMLHttpRequest",
    "X-API-SOURCE": "pc", "Accept-Language": "id-ID,id;q=0.9", Referer: `https://${site}/product/${ids.shop}/${ids.item}`,
  };
  const paths = [
    `/api/v4/pdp/get_pc?item_id=${ids.item}&shop_id=${ids.shop}&tz_offset_minutes=420&detail_level=0`,
    `/api/v4/item/get?itemid=${ids.item}&shopid=${ids.shop}`,
  ];
  for (const path of paths) {
    try {
      const r = await fetch("https://" + site + path, { headers: H, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const j = await r.json();
      const it = (j && j.data && (j.data.item || j.data)) || (j && j.item);
      if (!it) continue;
      let img = it.image || (it.images || [])[0] || "";
      if (!img) continue;
      if (!/^https?:/i.test(img)) img = `https://down-${cc}.img.susercontent.com/file/${img}`;
      const raw = it.price || it.price_min || 0;
      return { title: cleanTitle(it.name || it.title), image: img, price: raw ? rupiah(raw / 100000) : "" };
    } catch (_) {}
  }
  return null;
};

const previewOf = async (link) => {
  let final = link, ids = idsOf(link), status = 0, got = false;
  for (const ua of AGENTS) {
    try {
      const r = await getPage(link, ua);
      got = true; final = r.final; status = r.status; ids = idsOf(r.final) || ids;
      const d = fromHtml(r.html, r.final);
      if (d.image) return d;
    } catch (e) { if (e.user) throw e; }
  }
  if (ids) {
    const d = await viaApi(final, ids);
    if (d) return d;
  }
  if (!got) throw fail("Server tidak bisa membuka link Shopee.");
  if (!ids) throw fail("Link tidak mengarah ke halaman produk, atau Shopee meminta verifikasi.");
  throw fail("Shopee memblokir pengambilan gambar (status " + status + ").");
};

// ---- unggah gambar manual (disimpan di KV, disajikan dari /api/links?a=img&id=...) ----
const sniff = (b) => {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return "";
};

/* ---------- handler ---------- */
export async function onRequest({ request: req, env }) {
  const a = new URL(req.url).searchParams.get("a");

  try {
    // login
    if (req.method === "POST" && a === "login") {
      if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD belum diatur di Cloudflare." }, 500);
      const body = await req.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, 400)); // perlambat tebak-tebakan password
      if (!(await samePw(env, body.password || ""))) return json({ error: "Kata sandi salah." }, 401);
      return json({ token: await makeToken(env) });
    }

    // cek sesi
    if (req.method === "GET" && a === "session") {
      if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);
      return json({ ok: true, storage: env.ETALASE ? "kv" : "none" });
    }

    // ambil gambar/judul/harga dari link Shopee (admin)
    if (req.method === "GET" && a === "preview") {
      if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);
      const link = new URL(req.url).searchParams.get("url") || "";
      let parsed;
      try { parsed = new URL(/^https?:\/\//i.test(link) ? link : "https://" + link); } catch (_) { return json({ error: "Link tidak valid." }, 400); }
      if (!SHOPEE_HOST.test(parsed.hostname)) return json({ error: "Hanya link Shopee yang didukung." }, 400);
      try {
        return json(await previewOf(parsed.toString()));
      } catch (e) {
        return json({ error: e && e.user ? e.message : "Gagal mengambil data dari Shopee." }, 502);
      }
    }

    // unggah gambar (admin)
    if (req.method === "POST" && a === "upload") {
      if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);
      if (!env.ETALASE) return json({ error: "KV namespace ETALASE belum dipasang di Cloudflare." }, 500);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ error: "File kosong." }, 400);
      if (buf.byteLength > 700 * 1024) return json({ error: "Gambar terlalu besar (maks 700 KB)." }, 413);
      const type = sniff(new Uint8Array(buf));
      if (!type) return json({ error: "Format harus JPG, PNG, atau WebP." }, 400);
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await env.ETALASE.put("img:" + id, buf, { metadata: { type } });
      return json({ url: "/api/links?a=img&id=" + id });
    }

    // sajikan gambar unggahan (publik)
    if (req.method === "GET" && a === "img") {
      const id = new URL(req.url).searchParams.get("id") || "";
      if (!/^[a-f0-9]{16}$/.test(id) || !env.ETALASE) return new Response("Not found", { status: 404 });
      const { value, metadata } = await env.ETALASE.getWithMetadata("img:" + id, "arrayBuffer");
      if (!value) return new Response("Not found", { status: 404 });
      return new Response(value, {
        headers: {
          "Content-Type": (metadata && metadata.type) || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // baca data (publik)
    if (req.method === "GET") {
      if (!env.ETALASE) return json({});
      const data = await env.ETALASE.get(KEY, "json");
      return json(data || {});
    }

    // simpan data (admin)
    if (req.method === "PUT") {
      if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);
      if (!env.ETALASE) return json({ error: "KV namespace ETALASE belum dipasang di Cloudflare." }, 500);
      const body = await req.json().catch(() => null);
      const data = clean(body);
      if (!data) return json({ error: "Format data tidak valid." }, 400);
      await env.ETALASE.put(KEY, JSON.stringify(data));
      return json(data);
    }

    return json({ error: "Method tidak didukung." }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "Kesalahan server." }, 500);
  }
}
