let password = localStorage.getItem("superior_admin_password") || "";
let posts = [];
let activeId = null;

const loginPanel = document.getElementById("login-panel");
const editorPanel = document.getElementById("editor-panel");
const message = document.getElementById("admin-message");
const postList = document.getElementById("admin-posts");
const form = document.getElementById("post-form");
const fields = form.elements;

const today = () => new Date().toISOString().slice(0, 10);
const headers = () => ({ "Content-Type": "application/json", "x-admin-password": password });
const show = (text) => {
  message.textContent = text;
};
const slugify = (value = "") =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const emptyPost = () => ({
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  featuredImage: "/slika.jpg",
  publishDate: today(),
  author: "Fizikalna terapija SUPERIOR",
  category: "Savjeti",
  tags: [],
  status: "draft",
});

const formData = () => {
  const data = Object.fromEntries(new FormData(form).entries());
  data.tags = data.tags || "";
  data.slug = data.slug || slugify(data.title);
  return data;
};

const fillForm = (post) => {
  activeId = post.id || null;
  fields.id.value = post.id || "";
  fields.title.value = post.title || "";
  fields.slug.value = post.slug || "";
  fields.author.value = post.author || "Fizikalna terapija SUPERIOR";
  fields.publishDate.value = post.publishDate || today();
  fields.category.value = post.category || "Savjeti";
  fields.status.value = post.status || "draft";
  fields.excerpt.value = post.excerpt || "";
  fields.content.value = post.content || "";
  fields.tags.value = (post.tags || []).join(", ");
  fields.featuredImage.value = post.featuredImage || "/slika.jpg";
};

const renderList = () => {
  postList.innerHTML = posts
    .map(
      (post) => `
        <button type="button" class="post-row ${post.id === activeId ? "active" : ""}" data-id="${post.id}">
          <span>${post.title || "Bez naslova"}</span>
          <small>${post.status}</small>
        </button>
      `,
    )
    .join("");
  postList.querySelectorAll(".post-row").forEach((button) => {
    button.addEventListener("click", () => {
      const post = posts.find((item) => item.id === button.dataset.id);
      if (post) {
        fillForm(post);
        renderList();
      }
    });
  });
};

const loadPosts = async () => {
  const response = await fetch("/api/blog-posts?includeDrafts=true", { headers: { "x-admin-password": password } });
  if (!response.ok) throw new Error((await response.json()).error || "Ne mogu učitati objave.");
  posts = await response.json();
  loginPanel.hidden = true;
  editorPanel.hidden = false;
  renderList();
  fillForm(posts[0] || emptyPost());
};

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  password = document.getElementById("admin-password").value;
  localStorage.setItem("superior_admin_password", password);
  try {
    await loadPosts();
  } catch (error) {
    localStorage.removeItem("superior_admin_password");
    alert(error.message);
  }
});

document.getElementById("new-post").addEventListener("click", () => {
  fillForm(emptyPost());
  renderList();
  show("Nova objava je spremna za uređivanje.");
});

fields.title.addEventListener("input", () => {
  if (!activeId) fields.slug.value = slugify(fields.title.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData();
  const method = activeId ? "PUT" : "POST";
  const url = activeId ? `/api/blog-posts/${activeId}` : "/api/blog-posts";
  const response = await fetch(url, { method, headers: headers(), body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) return show(result.error || "Spremanje nije uspjelo.");
  show("Objava je spremljena.");
  await loadPosts();
  fillForm(result);
});

document.getElementById("save-draft").addEventListener("click", () => {
  fields.status.value = "draft";
  form.requestSubmit();
});

document.getElementById("delete-post").addEventListener("click", async () => {
  if (!activeId) return fillForm(emptyPost());
  if (!confirm("Obrisati ovu objavu?")) return;
  const response = await fetch(`/api/blog-posts/${activeId}`, { method: "DELETE", headers: { "x-admin-password": password } });
  const result = await response.json();
  if (!response.ok) return show(result.error || "Brisanje nije uspjelo.");
  show("Objava je obrisana.");
  await loadPosts();
});

document.getElementById("image-upload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const response = await fetch("/api/blog-upload", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ filename: file.name, dataUrl: reader.result }),
    });
    const result = await response.json();
    if (!response.ok) return show(result.error || "Upload nije uspio.");
    fields.featuredImage.value = result.url;
    show("Slika je uploadana i postavljena kao featured image.");
  };
  reader.readAsDataURL(file);
});

if (password) {
  loadPosts().catch(() => {
    localStorage.removeItem("superior_admin_password");
  });
}
