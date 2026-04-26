const postEl = document.getElementById("post");
const empty = document.getElementById("post-empty");
const slug = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "");
const dateFormatter = new Intl.DateTimeFormat("hr-HR", { dateStyle: "long" });
document.getElementById("yr").textContent = new Date().getFullYear();

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const paragraphs = (content = "") =>
  content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");

fetch(`/api/blog-posts/${slug}`)
  .then((response) => {
    if (!response.ok) throw new Error("Not found");
    return response.json();
  })
  .then((post) => {
    document.title = `${post.title} - Fizikalna terapija SUPERIOR`;
    document.querySelector('meta[name="description"]').setAttribute("content", post.excerpt || post.title);
    document.getElementById("post-category").textContent = post.category;
    document.getElementById("post-date").textContent = dateFormatter.format(new Date(post.publishDate));
    document.getElementById("post-author").textContent = post.author;
    document.getElementById("post-title").textContent = post.title;
    document.getElementById("post-image").src = post.featuredImage || "/slika.jpg";
    document.getElementById("post-image").alt = post.title;
    document.getElementById("post-tags").innerHTML = (post.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    document.getElementById("post-content").innerHTML = paragraphs(post.content);
    postEl.hidden = false;
  })
  .catch(() => {
    empty.hidden = false;
  });
