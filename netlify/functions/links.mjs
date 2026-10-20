import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/links" };

const KEY = "config";
const TTL = 30 * 24 * 3600 * 1000; // sesi login 30 hari
const HEAD = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEAD });

/* ---------- auth ---------- */
const secret = () => (process.env.TOKEN_SECRET || "") + "|" + (process.env.ADMIN_PASSWORD || "");
const sign = (p) => createHmac("sha256", secret()).update(p).digest("base64url");
const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const makeToken = () => {
  const p = Buffer.from(JSON.stringify({ exp: Date.now() + TTL })).toString("base64url");
  return p + "." + sign(p);
};
const authed = (req) => {
  if (!process.env.ADMIN_PASSWORD) return false;
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [p, s] = t.split(".");
  if (!p || !s || !eq(sign(p), s)) return false;
  try {
    return JSON.parse(Buffer.from(p, "base64url").toString()).exp > Date.now();
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

/* ---------- handler ---------- */
export default async (req) => {
  const u = new URL(req.url);
  const a = u.searchParams.get("a");
  const store = getStore("etalase");

  try {
    // login
    if (req.method === "POST" && a === "login") {
      if (!process.env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD belum diatur di Netlify." }, 500);
      const body = await req.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, 400)); // perlambat tebak-tebakan password
      if (!eq(body.password || "", process.env.ADMIN_PASSWORD)) return json({ error: "Kata sandi salah." }, 401);
      return json({ token: makeToken() });
    }

    // cek sesi
    if (req.method === "GET" && a === "session") {
      if (!authed(req)) return json({ error: "unauthorized" }, 401);
      return json({ ok: true, storage: "blobs" });
    }

    // baca data (publik)
    if (req.method === "GET") {
      const data = await store.get(KEY, { type: "json" });
      return json(data || {});
    }

    // simpan data (admin)
    if (req.method === "PUT") {
      if (!authed(req)) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const data = clean(body);
      if (!data) return json({ error: "Format data tidak valid." }, 400);
      await store.setJSON(KEY, data);
      return json(data);
    }

    return json({ error: "Method tidak didukung." }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "Kesalahan server." }, 500);
  }
};
