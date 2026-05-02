import compression from "compression";
import express from "express";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "jurej2750@gmail.com";
const FROM_EMAIL =
  process.env.FROM_EMAIL ||
  "Fizikalna terapija SUPERIOR <noreply@mamicwebdesign.com>";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const BLOG_STORAGE_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || "";
const BLOG_DATA_DIR = process.env.BLOG_DATA_DIR || (BLOG_STORAGE_ROOT ? join(BLOG_STORAGE_ROOT, "data") : join(__dirname, "data"));
const BLOG_UPLOAD_DIR =
  process.env.BLOG_UPLOAD_DIR || (BLOG_STORAGE_ROOT ? join(BLOG_STORAGE_ROOT, "uploads", "blog") : join(__dirname, "uploads", "blog"));
const BLOG_POSTS_FILE = join(BLOG_DATA_DIR, "blog-posts.json");
const BUNDLED_BLOG_POSTS_FILE = join(__dirname, "data", "blog-posts.json");
const SOCIAL_KNOWLEDGE_FILE = join(__dirname, "data", "social-knowledge.json");
const CHATBOT_KNOWLEDGE_FILE = join(__dirname, "data", "chatbot-knowledge.json");
const ADMIN_COOKIE_NAME = "superior_admin_session";
const ADMIN_SESSION_MS = 1000 * 60 * 60 * 8;
const SITE_URL = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
const adminSessions = new Map();

const SEO_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/usluge/", priority: "0.9", changefreq: "monthly" },
  { path: "/neuro/", priority: "0.9", changefreq: "monthly" },
  { path: "/braingym/", priority: "0.9", changefreq: "monthly" },
  { path: "/o-nama/", priority: "0.8", changefreq: "monthly" },
  { path: "/kontakt/", priority: "0.8", changefreq: "monthly" },
  { path: "/blog/", priority: "0.7", changefreq: "weekly" },
];

const STATIC_SEO_PAGES = [
  { routes: ["/", "/index.html"], file: "index.html", canonical: "/" },
  { routes: ["/usluge", "/usluge/"], file: join("usluge", "index.html"), canonical: "/usluge/" },
  { routes: ["/neuro", "/neuro/"], file: join("neuro", "index.html"), canonical: "/neuro/" },
  { routes: ["/braingym", "/braingym/"], file: join("braingym", "index.html"), canonical: "/braingym/" },
  { routes: ["/o-nama", "/o-nama/"], file: join("o-nama", "index.html"), canonical: "/o-nama/" },
  { routes: ["/kontakt", "/kontakt/"], file: join("kontakt", "index.html"), canonical: "/kontakt/" },
  { routes: ["/blog", "/blog/"], file: join("blog", "index.html"), canonical: "/blog/" },
];

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const escapeXml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const getSiteOrigin = (req) => {
  if (SITE_URL) return SITE_URL;
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
};

const absolutizeSeoUrls = (html, req, canonicalPath) => {
  const origin = getSiteOrigin(req);
  const absoluteCanonical = `${origin}${canonicalPath}`;
  return html
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtml(absoluteCanonical)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(absoluteCanonical)}" />`)
    .replace(/<meta property="og:image" content="\/([^"]+)" \/>/, (_match, imagePath) => {
      return `<meta property="og:image" content="${escapeHtml(`${origin}/${imagePath}`)}" />`;
    })
    .replace(/"image": "\/([^"]+)"/, (_match, imagePath) => `"image": "${escapeHtml(`${origin}/${imagePath}`)}"`);
};

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

const CHATBOT_KNOWLEDGE = `
Fizikalna terapija + rehabilitacija SUPERIOR is a specialized physiotherapy and neurorehabilitation center in Split, Croatia.
Address: Put studenca 23a, Split.
Phone: +385 99 855 6105.
Email: fizikalnasuperior@gmail.com.
Preferred website contact path for appointments and personal questions: /kontakt. Direct users to the contact form instead of giving the phone number unless they explicitly ask for the phone number.
Working hours shown on the website: Monday-Friday 08:00-20:00.
Facebook: https://www.facebook.com/fizikalnasuperior/
Instagram: https://www.instagram.com/fizikalna_superior/
Website language: Croatian, but answer in the user's language if they write in another language.

About Antonela Pavic:
Antonela Pavic, mag. physioth., founded and leads SUPERIOR. She is a master of physiotherapy and a lecturer at the University Department of Health Studies in Split, teaching Physiotherapy and Nursing students. Her work connects academic teaching and clinical neurorehabilitation practice. Areas mentioned on the website include Bobath concept, mirror therapy, Brain Gym, neurorehabilitation after CVI/stroke, MS, Parkinson's disease, Alzheimer's disease, nerve injuries, and spinal cord injuries.

Services and offerings:
- Advanced neurorehabilitation.
- Recovery after stroke/CVI.
- Rehabilitation for multiple sclerosis, Parkinson's disease, Alzheimer's disease, nerve injuries, and spinal cord injuries.
- Therapy recovery after traffic accidents, car accidents, falls, fractures, soft-tissue injuries, post-operative states, mobility loss, pain, and return to everyday movement after trauma.
- Bobath concept.
- Mirror therapy.
- Brain Gym. The website describes SUPERIOR as the only Brain Gym program/center in the region.
- Gait re-education.
- Balance exercises.
- Functional electrical stimulation.
- Ultrasound therapy.
- Electromagnetic therapy.
- Electrotherapy TENS/EMS.
- Cryotherapy and thermotherapy.
- Medical massage.
- Lymphatic drainage.
- Manual mobilization.
- Kinesiology taping.
- Trigger point therapy.
- Home visits for immobile patients, patients after severe CVI, and people with limited mobility in Split and the surrounding area.
- Bebologija Superior is linked at https://bebologija-superior.com/.

Safety boundary:
The chatbot is only a website information assistant. It must not diagnose, prescribe treatment, interpret symptoms, assess urgency, or replace a doctor/physiotherapist. For personal medical advice, booking, acute symptoms, or post-accident evaluation, it should direct users to the contact form at /kontakt or contacting emergency/medical services when urgent.
`;

const SITE_KNOWLEDGE_FILES = [
  ["Naslovna", "index.html"],
  ["O nama", join("o-nama", "index.html")],
  ["Usluge", join("usluge", "index.html")],
  ["Neurorehabilitacija", join("neuro", "index.html")],
  ["Brain Gym", join("braingym", "index.html")],
  ["Kontakt", join("kontakt", "index.html")],
  ["Blog", join("blog", "index.html")],
  ["Privatnost", join("privatnost", "index.html")],
];

let websiteKnowledgeCache = "";
let socialKnowledgeCache = "";
let chatbotKnowledgeCache = null;

const fetchWithRetry = async (url, options, retries = 2) => {
  let response;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    response = await fetch(url, options);
    const retryable = response.status === 429 || response.status >= 500;
    if (response.ok || !retryable || attempt === retries) return response;
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return response;
};

const htmlToKnowledgeText = (html = "") =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/\s+/g, " ")
    .trim();

const getWebsiteKnowledge = async () => {
  if (websiteKnowledgeCache) return websiteKnowledgeCache;

  const sections = [];
  for (const [label, relativePath] of SITE_KNOWLEDGE_FILES) {
    try {
      const html = await readFile(join(__dirname, relativePath), "utf8");
      const text = htmlToKnowledgeText(html);
      if (text) sections.push(`${label}: ${text.slice(0, 6000)}`);
    } catch (error) {
      console.error(`Chat knowledge read error for ${relativePath}:`, error.message);
    }
  }

  websiteKnowledgeCache = sections.join("\n\n");
  return websiteKnowledgeCache;
};

const getSocialKnowledge = async () => {
  if (socialKnowledgeCache) return socialKnowledgeCache;

  try {
    const data = JSON.parse(await readFile(SOCIAL_KNOWLEDGE_FILE, "utf8"));
    const sourceText = Array.isArray(data.sources)
      ? data.sources
          .map((source) => {
            const notes = Array.isArray(source.notes) ? source.notes.join(" ") : "";
            return `${source.name || "Društvena mreža"}: ${source.url || ""}. ${notes}`.trim();
          })
          .join("\n")
      : "";
    const guidanceText = Array.isArray(data.chatbotGuidance) ? data.chatbotGuidance.join(" ") : "";
    socialKnowledgeCache = [sourceText, guidanceText].filter(Boolean).join("\n");
  } catch (error) {
    console.error("Social knowledge read error:", error.message);
    socialKnowledgeCache =
      "Instagram: https://www.instagram.com/fizikalna_superior/. Facebook: https://www.facebook.com/fizikalnasuperior/.";
  }

  return socialKnowledgeCache;
};

const conditionAnswers = [
  {
    terms: ["cvi", "moždan", "mozdan", "udar", "šlog", "slog", "stroke"],
    answer:
      "Kod oporavka nakon CVI-ja/moždanog udara rehabilitacija je usmjerena na ponovno učenje pokreta, hod, ravnotežu, funkciju ruke, kontrolu trupa i svakodnevne aktivnosti. SUPERIOR u tom području koristi neurorehabilitacijske pristupe poput Bobath koncepta, terapije ogledalom, reedukacije hoda, vježbi ravnoteže i funkcionalne elektrostimulacije. Za individualnu procjenu najbolje je poslati upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["multipla skleroza", "multiplu sklerozu", "skleroz", "ms"],
    answer:
      "Kod multiple skleroze rehabilitacija se prilagođava trenutnom stanju osobe, umoru, ravnoteži, hodu, snazi i funkcionalnim ciljevima. SUPERIOR radi neurorehabilitaciju za osobe s MS-om kroz kontrolirane vježbe, rad na stabilnosti, ravnoteži, hodu i očuvanju svakodnevne funkcije. Za individualni plan najbolje je poslati upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["parkinson", "parkinsonova"],
    answer:
      "Kod Parkinsonove bolesti fizioterapija i neurorehabilitacija mogu pomoći u održavanju pokretljivosti, ravnoteže, koordinacije, sigurnijeg hoda i svakodnevne funkcionalnosti. SUPERIOR radi vježbe ravnoteže, reedukaciju hoda i individualno prilagođenu neurorehabilitaciju. Za procjenu i termin pošaljite upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["alzheimer", "alzheimerova"],
    answer:
      "Kod Alzheimerove bolesti rehabilitacija je usmjerena na očuvanje funkcionalnosti, sigurnosti, rutine kretanja, ravnoteže i podršku obitelji u svakodnevnoj skrbi. SUPERIOR pristupa takvim stanjima individualno, uz naglasak na sigurno kretanje i održavanje sposobnosti koliko je moguće. Za dogovor procjene pošaljite upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["ozljeda leđne moždine", "ozljeda ledne mozdine", "leđna moždina", "ledna mozdina", "spinal"],
    answer:
      "Kod ozljeda leđne moždine rehabilitacija se usmjerava na očuvanje i poboljšanje funkcije, kontrolu trupa, transfer, ravnotežu, hod gdje je moguć, prevenciju komplikacija i što veću samostalnost. SUPERIOR radi individualno prilagođenu neurorehabilitaciju za složena neurološka stanja. Za procjenu pošaljite upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["ozljeda živca", "ozljedu živca", "ozljeda zivca", "ozljedu zivca", "živac", "živca", "zivac", "zivca", "periferni živac", "periferni zivac"],
    answer:
      "Kod ozljeda perifernih živaca rehabilitacija može uključivati rad na aktivaciji mišića, očuvanju opsega pokreta, smanjenju boli, funkcionalnoj elektrostimulaciji i postupnom vraćanju funkcije. SUPERIOR radi oporavak nakon ozljeda živaca i neuroloških oštećenja. Za individualnu procjenu pošaljite upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["ataksija", "ataxia"],
    answer:
      "Kod ataksije rehabilitacija je najčešće usmjerena na koordinaciju, ravnotežu, sigurniji hod, kontrolu trupa i smanjenje rizika od pada. SUPERIOR radi vježbe ravnoteže i individualnu neurorehabilitaciju kod takvih neuroloških poteškoća. Za procjenu pošaljite upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["edem", "otok", "oteklina"],
    answer:
      "Kod edema ili oticanja rehabilitacija može uključivati postupke poput limfne drenaže, edukacije, terapijskih procedura i prilagodbe aktivnosti, ovisno o uzroku. SUPERIOR nudi limfnu drenažu i rehabilitacijsku podršku kod edema, osobito nakon operacija i kod određenih stanja. Za procjenu pošaljite upit putem kontakt forme: /kontakt.",
  },
  {
    terms: ["prijelom", "prelom", "fraktura", "operacija", "postoperativ"],
    answer:
      "Nakon prijeloma, operacija ili postoperativnih stanja rehabilitacija je usmjerena na smanjenje boli i otoka, vraćanje opsega pokreta, snage, stabilnosti i sigurnog povratka svakodnevnim aktivnostima. SUPERIOR radi oporavak nakon ozljeda i operacija. Za individualni plan pošaljite upit putem kontakt forme: /kontakt.",
  },
];

const normalizeSearchText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getChatbotKnowledge = async () => {
  if (chatbotKnowledgeCache) return chatbotKnowledgeCache;

  try {
    const items = JSON.parse(await readFile(CHATBOT_KNOWLEDGE_FILE, "utf8"));
    if (!Array.isArray(items)) throw new Error("chatbot-knowledge.json must contain an array.");

    chatbotKnowledgeCache = items.map((item) => ({
      ...item,
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
      normalizedKeywords: (Array.isArray(item.keywords) ? item.keywords : []).map(normalizeSearchText).filter(Boolean),
    }));
  } catch (error) {
    console.error("Chatbot knowledge read error:", error.message);
    chatbotKnowledgeCache = [
      {
        id: "default",
        title: "Opći odgovor",
        keywords: [],
        normalizedKeywords: [],
        answer:
          "SUPERIOR nudi fizikalnu terapiju i naprednu neurorehabilitaciju. Za osobni medicinski savjet ili termin pošaljite upit putem kontakt forme: /kontakt.",
      },
    ];
  }

  return chatbotKnowledgeCache;
};

const findChatbotKnowledgeAnswer = async (message) => {
  const text = normalizeSearchText(message);
  const words = text.split(" ");
  const items = await getChatbotKnowledge();
  const matches = items
    .map((item, order) => {
      const matchedKeyword = item.normalizedKeywords
        .filter((keyword) => (keyword.length <= 3 ? words.includes(keyword) : text.includes(keyword)))
        .sort((a, b) => b.length - a.length)[0];
      return matchedKeyword ? { item, order, keywordLength: matchedKeyword.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.keywordLength - a.keywordLength || a.order - b.order);
  const match = matches[0]?.item;
  return match?.answer || "";
};

const findWebsiteKnowledgeAnswer = async (message) => {
  const tokens = normalizeSearchText(message)
    .split(" ")
    .filter((token) => token.length > 3 && !["kako", "koje", "koji", "sto", "sta", "ima", "imaju", "moze", "mogu"].includes(token));

  if (!tokens.length) return "";

  const websiteKnowledge = await getWebsiteKnowledge();
  const chunks = websiteKnowledge
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 40 && chunk.length <= 520)
    .filter((chunk) => {
      const normalized = normalizeSearchText(chunk);
      return (
        !normalized.includes("preskoci na sadrzaj") &&
        !normalized.includes("navigacija") &&
        !normalized.includes("politika privatnosti") &&
        !normalized.includes("fizikalnasuperior gmail") &&
        !normalized.includes("put studenca") &&
        !normalized.includes("naslovna o nama usluge")
      );
    });

  let best = null;
  for (const chunk of chunks) {
    const normalizedChunk = normalizeSearchText(chunk);
    const score = tokens.reduce((sum, token) => sum + (normalizedChunk.includes(token) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { chunk, score };
  }

  if (!best) return "";

  return `${best.chunk} Za detaljniji upit ili dogovor termina najbolje je poslati poruku putem kontakt forme: /kontakt.`;
};

const getChatbotKnowledgeText = async () => {
  const items = await getChatbotKnowledge();
  return items
    .filter((item) => item.id !== "default")
    .map((item) => {
      const keywords = item.keywords.length ? ` Keywords: ${item.keywords.join(", ")}.` : "";
      return `${item.title || item.id}: ${item.answer}${keywords}`;
    })
    .join("\n");
};

const fallbackChatAnswer = async (message) => {
  const knowledgeAnswer = await findChatbotKnowledgeAnswer(message);
  if (knowledgeAnswer) return knowledgeAnswer;

  const websiteAnswer = await findWebsiteKnowledgeAnswer(message);
  if (websiteAnswer) return websiteAnswer;

  const text = String(message || "").toLowerCase();
  if (text.includes("facebook") || text.includes("instagram") || text.includes("društven") || text.includes("drustven") || text.includes("mrež") || text.includes("mrez") || text.includes("social")) {
    return "SUPERIOR možete pronaći na Facebooku: https://www.facebook.com/fizikalnasuperior/ i Instagramu: https://www.instagram.com/fizikalna_superior/.";
  }
  const condition = conditionAnswers.find((item) => item.terms.some((term) => text.includes(term)));
  if (condition) return condition.answer;
  if (text.includes("bobath")) {
    return "Bobath koncept je neurorazvojni terapijski pristup koji se koristi kod neuroloških poteškoća, primjerice nakon moždanog udara, kod multiple skleroze i drugih oštećenja središnjeg živčanog sustava. Cilj je poticati kvalitetniji obrazac pokreta, bolju kontrolu tijela i funkcionalniji oporavak kroz individualno prilagođen rad. Za procjenu odgovara li Bobath terapija vašem slučaju, najbolje je poslati upit putem kontakt forme: /kontakt.";
  }
  if (text.includes("mirror") || text.includes("ogledal")) {
    return "Mirror therapy, odnosno terapija ogledalom, koristi vizualnu povratnu informaciju kako bi potaknula aktivaciju i oporavak pokreta, osobito kod neuroloških stanja i oporavka nakon moždanog udara. Za individualnu procjenu najbolje je poslati upit putem kontakt forme: /kontakt.";
  }
  if (text.includes("limfn") || text.includes("drenaž") || text.includes("drenaz")) {
    return "Limfna drenaža je terapijska tehnika kojom se potiče protok limfe, često kao podrška kod edema, nakon operacija ili kod određenih rehabilitacijskih stanja. Za odabir odgovarajuće terapije najbolje je poslati upit putem kontakt forme: /kontakt.";
  }
  if (text.includes("ultrazv")) {
    return "Ultrazvučna terapija koristi se kao fizikalna procedura za potporu oporavku mekih tkiva, smanjenje upale i poboljšanje lokalne cirkulacije. Za procjenu je li prikladna za vašu tegobu, pošaljite upit putem kontakt forme: /kontakt.";
  }
  if (text.includes("bol") || text.includes("boli") || text.includes("problem") || text.includes("tegob") || text.includes("ozljed") || text.includes("ozlijed") || text.includes("rastrg") || text.includes("puk") || text.includes("istegn") || text.includes("uganu") || text.includes("prepon") || text.includes("mišić") || text.includes("misic") || text.includes("tetiv") || text.includes("ligament") || text.includes("vrat") || text.includes("leđa") || text.includes("leda") || text.includes("rame") || text.includes("lakat") || text.includes("šaka") || text.includes("saka") || text.includes("ruka") || text.includes("koljeno") || text.includes("kuk") || text.includes("zglob") || text.includes("list") || text.includes("noga") || text.includes("stopalo") || text.includes("gležanj") || text.includes("glezanj") || text.includes("naručit") || text.includes("narucit") || text.includes("termin")) {
    return "SUPERIOR radi rehabilitaciju nakon ozljeda, bolova i individualnih tegoba, uključujući ozljede mišića, tetiva, ligamenata i oporavak nakon nezgoda. Za takav slučaj najbolje je poslati upit putem kontakt forme: /kontakt. U poruci kratko opišite što se dogodilo, gdje osjećate problem, koliko dugo traje i želite li termin za procjenu. Ako je ozljeda svježa, jaka ili se stanje naglo pogoršava, prvo se obratite liječniku ili hitnoj službi.";
  }
  if (text.includes("antonela") || text.includes("pavic") || text.includes("pavić")) {
    return "Antonela Pavić, mag. physioth., voditeljica je centra SUPERIOR. Magistrica je fizioterapije i predavačica na Sveučilišnom odjelu zdravstvenih studija u Splitu, gdje povezuje akademsko znanje s kliničkom praksom neurorehabilitacije.";
  }
  if (text.includes("nezgod") || text.includes("nesre") || text.includes("promet") || text.includes("auto") || text.includes("accident")) {
    return "SUPERIOR radi i terapijski oporavak nakon prometnih i drugih nezgoda: nakon padova, prijeloma, ozljeda mekih tkiva, operacija, boli, gubitka pokretljivosti i povratka svakodnevnom kretanju. Za individualnu procjenu ili termin najbolje je poslati upit putem kontakt forme: /kontakt.";
  }
  if (text.includes("kontakt") || text.includes("adresa") || text.includes("gdje") || text.includes("telefon")) {
    if (text.includes("telefon") || text.includes("broj") || text.includes("nazvati") || text.includes("zvati")) {
      return "Telefon centra je +385 99 855 6105. Za slanje upita ili dogovor termina možete koristiti i kontakt formu: /kontakt.";
    }
    return "SUPERIOR se nalazi na adresi Put studenca 23a, Split. Za upit ili dogovor termina najbolje je koristiti kontakt formu: /kontakt. Radno vrijeme navedeno na stranici je ponedjeljak-petak 08-20h.";
  }
  if (text.includes("brain") || text.includes("gym")) {
    return "Brain Gym je strukturirani program vježbi za poticanje neuroplastičnosti i integracije moždanih funkcija. Na stranici je SUPERIOR istaknut kao jedini Brain Gym centar/program u regiji.";
  }
  return "SUPERIOR nudi fizikalnu terapiju i naprednu neurorehabilitaciju: oporavak nakon CVI/moždanog udara, neurološka stanja, Bobath koncept, mirror therapy, Brain Gym, fizikalne procedure, manualnu terapiju, rehabilitaciju nakon nezgoda i kućne posjete. Za osobni medicinski savjet ili termin pošaljite upit putem kontakt forme: /kontakt.";
};

const readPosts = async () => {
  try {
    const content = await readFile(BLOG_POSTS_FILE, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      let starterPosts = [];
      if (BLOG_POSTS_FILE !== BUNDLED_BLOG_POSTS_FILE) {
        try {
          starterPosts = JSON.parse(await readFile(BUNDLED_BLOG_POSTS_FILE, "utf8"));
        } catch {
          starterPosts = [];
        }
      }
      await writePosts(starterPosts);
      return starterPosts;
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

const parseCookies = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );

const sessionCookie = (token, maxAgeSeconds) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
};

const requireAdmin = (req, res, next) => {
  if (!ADMIN_PASSWORD_HASH) {
    return res.status(500).json({ error: "ADMIN_PASSWORD_HASH nije postavljen na serveru." });
  }

  const token = parseCookies(req)[ADMIN_COOKIE_NAME];
  const session = token ? adminSessions.get(token) : null;

  if (!session || session.expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ error: "Admin sesija je istekla. Prijavite se ponovno." });
  }

  session.expiresAt = Date.now() + ADMIN_SESSION_MS;
  next();
};

app.use(compression());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false }));

app.post("/api/admin-login", async (req, res) => {
  if (!ADMIN_PASSWORD_HASH) {
    return res.status(500).json({ error: "ADMIN_PASSWORD_HASH nije postavljen na serveru." });
  }

  const password = String(req.body?.password || "");
  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) {
    return res.status(401).json({ error: "Neispravna admin lozinka." });
  }

  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, { expiresAt: Date.now() + ADMIN_SESSION_MS });
  res.setHeader("Set-Cookie", sessionCookie(token, ADMIN_SESSION_MS / 1000));
  res.json({ ok: true });
});

app.post("/api/admin-logout", requireAdmin, (req, res) => {
  const token = parseCookies(req)[ADMIN_COOKIE_NAME];
  if (token) adminSessions.delete(token);
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  res.json({ ok: true });
});

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

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];

  if (!message) {
    return res.status(400).json({ error: "Poruka je obavezna." });
  }

  if (message.length > 900) {
    return res.status(400).json({ error: "Poruka je preduga. Molimo skratite upit." });
  }

  if (!OPENAI_API_KEY) {
    return res.json({ answer: await fallbackChatAnswer(message), fallback: true });
  }

  const websiteKnowledge = await getWebsiteKnowledge();
  const socialKnowledge = await getSocialKnowledge();
  const chatbotKnowledge = await getChatbotKnowledgeText();
  const input = [
    ...history
      .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
      .map((item) => ({ role: item.role, content: item.content.slice(0, 900) })),
    { role: "user", content: message },
  ];
  const openAiInstructions =
    "You are Duje, the website assistant for Fizikalna terapija + rehabilitacija SUPERIOR. Answer only using the provided website knowledge. Keep information formal, accurate, concise, and direct. Do not begin answers with signature phrases like 'Duje kaže' or 'Duje misli'. Do not overdo humor. Do not provide diagnosis, medical advice, prognosis, exercises, prescriptions, or urgency triage. When users describe pain, injuries, torn/strained muscles, groin problems, accident recovery, or similar patient problems, say that SUPERIOR works with rehabilitation after injuries and individual musculoskeletal/neurorehabilitation issues, then direct them to the contact form at /kontakt for assessment/booking. Do not give the phone number unless the user explicitly asks for the phone number. If the user mentions an emergency or severe acute symptoms, tell them to contact emergency medical services. Prefer Croatian unless the user writes in another language.\n\nWEBSITE KNOWLEDGE:\n" +
    CHATBOT_KNOWLEDGE +
    "\n\nCHATBOT KNOWLEDGE BASE:\n" +
    chatbotKnowledge +
    "\n\nSOCIAL MEDIA SOURCES:\n" +
    socialKnowledge +
    "\n\nFULL WEBSITE TEXT:\n" +
    websiteKnowledge;

  try {
    const response = await fetchWithRetry("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions:
          "You are Duje, the website assistant for Fizikalna terapija + rehabilitacija SUPERIOR. Answer only using the provided website knowledge. Keep information formal, accurate, concise, and direct. Do not begin answers with signature phrases like 'Duje kaže' or 'Duje misli'. Do not overdo humor. Do not provide diagnosis, medical advice, prognosis, exercises, prescriptions, or urgency triage. When users describe pain, injuries, torn/strained muscles, groin problems, accident recovery, or similar patient problems, say that SUPERIOR works with rehabilitation after injuries and individual musculoskeletal/neurorehabilitation issues, then direct them to the contact form at /kontakt for assessment/booking. Do not give the phone number unless the user explicitly asks for the phone number. If the user mentions an emergency or severe acute symptoms, tell them to contact emergency medical services. Prefer Croatian unless the user writes in another language.\n\nWEBSITE KNOWLEDGE:\n" +
          CHATBOT_KNOWLEDGE +
          "\n\nCHATBOT KNOWLEDGE BASE:\n" +
          chatbotKnowledge +
          "\n\nSOCIAL MEDIA SOURCES:\n" +
          socialKnowledge +
          "\n\nFULL WEBSITE TEXT:\n" +
          websiteKnowledge,
        input,
        max_output_tokens: 260,
        store: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI chat error:", error);

      if (response.status >= 500) {
        const chatResponse = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
              { role: "system", content: openAiInstructions },
              ...input.map((item) => ({ role: item.role, content: item.content })),
            ],
            max_completion_tokens: 260,
            store: false,
          }),
        });

        if (chatResponse.ok) {
          const chatData = await chatResponse.json();
          const chatAnswer = chatData.choices?.[0]?.message?.content?.trim();
          if (chatAnswer) return res.json({ answer: chatAnswer });
        } else {
          console.error("OpenAI chat completions fallback error:", await chatResponse.text());
        }
      }

      return res.json({ answer: await fallbackChatAnswer(message), fallback: true });
    }

    const data = await response.json();
    const answer =
      data.output_text ||
      data.output
        ?.flatMap((item) => item.content || [])
        .map((content) => content.text)
        .filter(Boolean)
        .join("\n")
        .trim();

    res.json({ answer: answer || (await fallbackChatAnswer(message)) });
  } catch (error) {
    console.error("OpenAI chat error:", error);
    res.json({ answer: await fallbackChatAnswer(message), fallback: true });
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

app.get("/robots.txt", (req, res) => {
  const origin = getSiteOrigin(req);
  res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /admin
Sitemap: ${origin}/sitemap.xml
`);
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const origin = getSiteOrigin(req);
    const posts = await readPosts();
    const publishedPosts = posts
      .filter((post) => post.status === "published" && post.slug)
      .map((post) => ({
        path: `/blog/${post.slug}`,
        priority: "0.7",
        changefreq: "monthly",
        lastmod: post.updatedAt || post.publishDate || new Date().toISOString(),
      }));

    const urls = [...SEO_ROUTES, ...publishedPosts]
      .map((route) => {
        const loc = `${origin}${route.path}`;
        const lastmod = route.lastmod ? `<lastmod>${escapeXml(String(route.lastmod).slice(0, 10))}</lastmod>` : "";
        return `<url><loc>${escapeXml(loc)}</loc>${lastmod}<changefreq>${route.changefreq}</changefreq><priority>${route.priority}</priority></url>`;
      })
      .join("");

    res
      .type("application/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  } catch (error) {
    console.error("Sitemap error:", error);
    res.status(500).type("text/plain").send("Sitemap error");
  }
});

for (const page of STATIC_SEO_PAGES) {
  app.get(page.routes, async (req, res) => {
    try {
      const html = await readFile(join(__dirname, page.file), "utf8");
      res.type("html").send(absolutizeSeoUrls(html, req, page.canonical));
    } catch (error) {
      console.error(`SEO page render error for ${page.file}:`, error);
      res.status(500).sendFile(join(__dirname, page.file));
    }
  });
}

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

app.get("/blog/:slug", async (req, res) => {
  try {
    const posts = await readPosts();
    const post = posts.find((item) => item.slug === req.params.slug && item.status === "published");
    if (!post) return res.status(404).sendFile(join(__dirname, "blog", "post.html"));

    const origin = getSiteOrigin(req);
    const postUrl = `${origin}/blog/${post.slug}`;
    const imageUrl = post.featuredImage?.startsWith("http")
      ? post.featuredImage
      : `${origin}${post.featuredImage || "/slika.jpg"}`;
    const title = `${post.title} | SUPERIOR Split`;
    const description =
      post.excerpt ||
      String(post.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 155);

    let html = await readFile(join(__dirname, "blog", "post.html"), "utf8");
    html = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(
        /<meta name="description" content="[^"]*" \/>/,
        `<meta name="description" content="${escapeHtml(description)}" />`,
      )
      .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtml(postUrl)}" />`)
      .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
      .replace(
        /<meta property="og:description" content="[^"]*" \/>/,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
      )
      .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(postUrl)}" />`)
      .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`);

    res.type("html").send(html);
  } catch (error) {
    console.error("Blog SEO render error:", error);
    res.status(500).sendFile(join(__dirname, "blog", "post.html"));
  }
});

app.use((_req, res) => {
  res.status(404).sendFile(join(__dirname, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`OpenAI chat ${OPENAI_API_KEY ? "enabled" : "disabled"} using model ${OPENAI_MODEL}`);
});
