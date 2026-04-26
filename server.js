import compression from "compression";
import express from "express";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "jurej2750@gmail.com";
const FROM_EMAIL =
  process.env.FROM_EMAIL ||
  "Fizikalna terapija SUPERIOR <noreply@mamicwebdesign.com>";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BLOG_DATA_DIR = process.env.BLOG_DATA_DIR || join(__dirname, "data");
const BLOG_UPLOAD_DIR = process.env.BLOG_UPLOAD_DIR || join(__dirname, "uploads", "blog");
const BLOG_POSTS_FILE = join(BLOG_DATA_DIR, "blog-posts.json");

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const requiredText = (value) => typeof value === "string" && value.trim().length > 0;
const slugify = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const readPosts = async () => {
  try {
    const content = await readFile(BLOG_POSTS_FILE, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      await writePosts([]);
      return [];
    }
    throw error;
  }
};

const writePosts = async (posts) => {
  await mkdir(BLOG_DATA_DIR, { recursive: true });
  await writeFile(BLOG_POSTS_FILE, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
};

const publicPost = (post) => {
  const { content, ...summary } = post;
  return summary;
};

const requireAdmin = (req, res, next) => {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD nije postavljen na serveru." });
  }
  if (req.get("x-admin-password") !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Neispravna admin lozinka." });
  }
  next();
};

app.use(compression());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false }));

app.post("/api/send-email", async (req, res) => {
  if (!RESEND_KEY) {
    console.error("Missing RESEND_API_KEY environment variable");
    return res.status(500).json({ error: "Email servis nije konfiguriran." });
  }

  const { name, phone, email, topic, time, message, consent } = req.body || {};

  if (!requiredText(name) || !requiredText(phone) || !consent) {
    return res.status(400).json({ error: "Ime, telefon i suglasnost su obavezni." });
  }

  const safeName = escapeHtml(name.trim());
  const safePhone = escapeHtml(phone.trim());
  const safeEmail = escapeHtml(email?.trim() || "");
  const safeTopic = escapeHtml(topic?.trim() || "Nije odabrano");
  const safeTime = escapeHtml(time?.trim() || "Nije odabrano");
  const safeMessage = escapeHtml(message?.trim() || "Nema poruke").replaceAll("\n", "<br>");

  const payload = {
    from: FROM_EMAIL,
    to: [CONTACT_EMAIL],
    subject: `Novi upit od ${name.trim()} - Fizikalna terapija SUPERIOR`,
    html: `
      <h2 style="color:#0b1f38">Novi upit s web stranice - Fizikalna terapija SUPERIOR</h2>
      <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;color:#111">
        <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Ime i prezime</td><td style="padding:8px 12px">${safeName}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Telefon</td><td style="padding:8px 12px">${safePhone}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">E-mail</td><td style="padding:8px 12px">${safeEmail || "-"}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Razlog dolaska</td><td style="padding:8px 12px">${safeTopic}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Preferirani termin</td><td style="padding:8px 12px">${safeTime}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;vertical-align:top">Poruka</td><td style="padding:8px 12px">${safeMessage}</td></tr>
      </table>
    `,
  };

  if (email && String(email).includes("@")) {
    payload.reply_to = email.trim();
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend error:", error);
      return res.status(500).json({ error: "Greška pri slanju upita." });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Resend error:", error);
    res.status(500).json({ error: "Greška pri slanju upita." });
  }
});

app.get("/api/blog-posts", async (req, res) => {
  try {
    const posts = await readPosts();
    const includeDrafts = req.query.includeDrafts === "true";

    if (includeDrafts) {
      return requireAdmin(req, res, () => {
        res.json(posts.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate)));
      });
    }

    res.json(
      posts
        .filter((post) => post.status === "published")
        .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
        .map(publicPost),
    );
  } catch (error) {
    console.error("Blog read error:", error);
    res.status(500).json({ error: "Greška pri učitavanju bloga." });
  }
});

app.get("/api/blog-posts/:slug", async (req, res) => {
  try {
    const posts = await readPosts();
    const post = posts.find((item) => item.slug === req.params.slug);
    if (!post || post.status !== "published") {
      return res.status(404).json({ error: "Objava nije pronađena." });
    }
    res.json(post);
  } catch (error) {
    console.error("Blog post read error:", error);
    res.status(500).json({ error: "Greška pri učitavanju objave." });
  }
});

app.post("/api/blog-posts", requireAdmin, async (req, res) => {
  try {
    const posts = await readPosts();
    const now = new Date().toISOString();
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ error: "Naslov je obavezan." });

    const baseSlug = slugify(req.body.slug || title);
    const slug = baseSlug || randomUUID();
    if (posts.some((post) => post.slug === slug)) {
      return res.status(400).json({ error: "Slug već postoji." });
    }

    const post = {
      id: randomUUID(),
      title,
      slug,
      excerpt: String(req.body.excerpt || "").trim(),
      content: String(req.body.content || "").trim(),
      featuredImage: String(req.body.featuredImage || "/slika.jpg").trim(),
      publishDate: req.body.publishDate || now.slice(0, 10),
      author: String(req.body.author || "Fizikalna terapija SUPERIOR").trim(),
      category: String(req.body.category || "Savjeti").trim(),
      tags: normalizeTags(req.body.tags),
      status: req.body.status === "draft" ? "draft" : "published",
      createdAt: now,
      updatedAt: now,
    };

    posts.unshift(post);
    await writePosts(posts);
    res.status(201).json(post);
  } catch (error) {
    console.error("Blog create error:", error);
    res.status(500).json({ error: "Greška pri spremanju objave." });
  }
});

app.put("/api/blog-posts/:id", requireAdmin, async (req, res) => {
  try {
    const posts = await readPosts();
    const index = posts.findIndex((post) => post.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Objava nije pronađena." });

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ error: "Naslov je obavezan." });

    const slug = slugify(req.body.slug || title);
    if (posts.some((post) => post.slug === slug && post.id !== req.params.id)) {
      return res.status(400).json({ error: "Slug već postoji." });
    }

    posts[index] = {
      ...posts[index],
      title,
      slug,
      excerpt: String(req.body.excerpt || "").trim(),
      content: String(req.body.content || "").trim(),
      featuredImage: String(req.body.featuredImage || "/slika.jpg").trim(),
      publishDate: req.body.publishDate || posts[index].publishDate,
      author: String(req.body.author || "Fizikalna terapija SUPERIOR").trim(),
      category: String(req.body.category || "Savjeti").trim(),
      tags: normalizeTags(req.body.tags),
      status: req.body.status === "draft" ? "draft" : "published",
      updatedAt: new Date().toISOString(),
    };

    await writePosts(posts);
    res.json(posts[index]);
  } catch (error) {
    console.error("Blog update error:", error);
    res.status(500).json({ error: "Greška pri ažuriranju objave." });
  }
});

app.delete("/api/blog-posts/:id", requireAdmin, async (req, res) => {
  try {
    const posts = await readPosts();
    const nextPosts = posts.filter((post) => post.id !== req.params.id);
    if (nextPosts.length === posts.length) {
      return res.status(404).json({ error: "Objava nije pronađena." });
    }
    await writePosts(nextPosts);
    res.json({ ok: true });
  } catch (error) {
    console.error("Blog delete error:", error);
    res.status(500).json({ error: "Greška pri brisanju objave." });
  }
});

app.post("/api/blog-upload", requireAdmin, async (req, res) => {
  try {
    const { filename, dataUrl } = req.body || {};
    const match = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
    if (!match) return res.status(400).json({ error: "Podržane su PNG, JPG, WEBP i GIF slike." });

    const ext = match[1].toLowerCase().replace("jpeg", "jpg");
    const cleanName = slugify(String(filename || "blog-slika").replace(/\.[^.]+$/, "")) || "blog-slika";
    const savedName = `${Date.now()}-${cleanName}.${ext}`;
    await mkdir(BLOG_UPLOAD_DIR, { recursive: true });
    await writeFile(join(BLOG_UPLOAD_DIR, savedName), Buffer.from(match[2], "base64"));
    res.status(201).json({ url: `/uploads/blog/${savedName}` });
  } catch (error) {
    console.error("Blog upload error:", error);
    res.status(500).json({ error: "Greška pri spremanju slike." });
  }
});

app.get("/blog/:slug", (_req, res) => {
  res.sendFile(join(__dirname, "blog", "post.html"));
});

app.use("/uploads/blog", express.static(BLOG_UPLOAD_DIR));

app.use(
  express.static(__dirname, {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

app.use((_req, res) => {
  res.status(404).sendFile(join(__dirname, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
