const dateFormatter = new Intl.DateTimeFormat("hr-HR", { dateStyle: "long" });
const list = document.getElementById("blog-list");
const empty = document.getElementById("blog-empty");
document.getElementById("yr").textContent = new Date().getFullYear();

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
      (post) => `
        <article class="blog-card">
          <img src="${escapeHtml(post.featuredImage || "/slika.jpg")}" alt="">
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
