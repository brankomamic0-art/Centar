import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const file = join(root, "data", "chatbot-knowledge.json");

const normalizeSearchText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const items = JSON.parse(await readFile(file, "utf8"));

if (!Array.isArray(items)) {
  throw new Error("data/chatbot-knowledge.json must contain an array.");
}

const failures = [];
const ids = new Set();

const prepared = items.map((item, index) => {
  if (!item.id) failures.push(`Item at index ${index} is missing id.`);
  if (ids.has(item.id)) failures.push(`Duplicate id: ${item.id}`);
  ids.add(item.id);

  if (!item.title) failures.push(`${item.id || index} is missing title.`);
  if (!item.answer || String(item.answer).trim().length < 20) {
    failures.push(`${item.id || index} has a missing or too-short answer.`);
  }
  if (!Array.isArray(item.keywords)) failures.push(`${item.id || index} keywords must be an array.`);

  return {
    ...item,
    normalizedKeywords: (Array.isArray(item.keywords) ? item.keywords : []).map(normalizeSearchText).filter(Boolean),
  };
});

if (!prepared.some((item) => item.id === "default")) {
  failures.push("Missing required default item.");
}

for (const item of prepared) {
  if (item.id === "default") continue;

  for (const keyword of item.keywords || []) {
    const query = normalizeSearchText(keyword);
    const matched = prepared.find((candidate) => candidate.normalizedKeywords.some((candidateKeyword) => query.includes(candidateKeyword)));

    if (!matched) {
      failures.push(`Keyword "${keyword}" from ${item.id} did not match anything.`);
      continue;
    }

    if (matched.id !== item.id) {
      failures.push(`Keyword "${keyword}" from ${item.id} is shadowed by ${matched.id}.`);
    }
  }
}

if (failures.length) {
  console.error("Chatbot knowledge test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const keywordCount = prepared.reduce((sum, item) => sum + (item.keywords?.length || 0), 0);
console.log(`Chatbot knowledge OK: ${prepared.length} items, ${keywordCount} keywords.`);
