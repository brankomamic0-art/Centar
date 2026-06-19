const dateFormatter = new Intl.DateTimeFormat("hr-HR", { dateStyle: "long" });
const list = document.getElementById("blog-list");
const empty = document.getElementById("blog-empty");
document.getElementById("yr").textContent = new Date().getFullYear();

const FALLBACK_IMAGES = [
  "/neurorehabilitacija/neuro-sesija-1.webp",
  "/neurorehabilitacija/neuro-sesija-2.webp",
  "/neurorehabilitacija/neuro-sesija-3.webp",
  "/neurorehabilitacija/neuro-sesija-4.webp",
  "/neurorehabilitacija/neuro-sesija-5.webp",
  "/neurorehabilitacija/neuro-sesija-6.webp",
  "/neurorehabilitacija/neuro-mirror-terapija.webp",
  "/neurorehabilitacija/neuro-aktivacija-core.webp",
  "/braingym/braingym-program-split-1.webp",
  "/braingym/braingym-program-split-2.webp",
  "/braingym/braingym-sesija-split-4.webp",
  "/braingym/braingym-sesija-split-5.webp",
];

const getPostImage = (post, index) =>
  post.featuredImage || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const renderPosts = (posts) => {
  if (!posts.length) {
    empty.hidden = false;
    return;
  }

  list.innerHTML = posts
    .map(
      (post, index) => `
        <article class="blog-card">
          <img src="${escapeHtml(getPostImage(post, index))}" alt="">
          <div class="blog-card-body">
            <div class="meta">${escapeHtml(dateFormatter.format(new Date(post.publishDate)))} · ${escapeHtml(post.author)}</div>
            <h2>${escapeHtml(post.title)}</h2>
            <p>${escapeHtml(post.excerpt)}</p>
            <a href="/blog/${escapeHtml(post.slug)}" class="btn">Pročitaj više</a>
          </div>
        </article>
      `,
    )
    .join("");
};

fetch("/api/blog-posts")
  .then((response) => response.json())
  .then(renderPosts)
  .catch(() => {
    empty.hidden = false;
    empty.textContent = "Blog se trenutno ne može učitati.";
  });
