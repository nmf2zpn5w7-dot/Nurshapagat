import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { productsSeed } from "../data/products.js";

const dbPath = path.join(process.cwd(), "data", "store.db");
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
  DROP TABLE IF EXISTS order_items;
  DROP TABLE IF EXISTS orders;
  DROP TABLE IF EXISTS products;
`);

db.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    material TEXT NOT NULL,
    price INTEGER NOT NULL,
    rating REAL NOT NULL,
    popular INTEGER NOT NULL DEFAULT 0,
    badge TEXT NOT NULL,
    image TEXT NOT NULL,
    description TEXT NOT NULL,
    long_description TEXT NOT NULL,
    craftsmanship_hours INTEGER NOT NULL,
    master_name TEXT NOT NULL,
    city TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    audio_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    comment TEXT,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    delivery_method TEXT NOT NULL DEFAULT 'pickup',
    payment_method TEXT NOT NULL DEFAULT 'card',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

const insert = db.prepare(`
  INSERT INTO products (
    slug, name, category, material, price, rating, popular, badge,
    image, audio_url, description, long_description, craftsmanship_hours,
    master_name, city, stock
  ) VALUES (
    @slug, @name, @category, @material, @price, @rating, @popular, @badge,
    @image, @audio_url, @description, @long_description, @craftsmanship_hours,
    @master_name, @city, @stock
  )
`);

const audioDir = path.join(process.cwd(), "public", "audio");
const audioFiles = fs.existsSync(audioDir)
  ? fs
      .readdirSync(audioDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  : [];

const audioFileSet = new Set(audioFiles.map((name) => `/audio/${name}`));
const hasAudioFile = (url) => typeof url === "string" && audioFileSet.has(url);

const pickAudioForSeedRow = (row, index) => {
  const slugLower = String(row.slug || "").toLowerCase();
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const slugCandidates = [
    `/audio/${row.slug}.mp3`,
    `/audio/${row.slug}.ogg`,
    `/audio/${row.slug}.wav`
  ];
  for (const candidate of slugCandidates) {
    if (hasAudioFile(candidate)) return candidate;
  }

  const slugFuzzy = audioFiles.find((name) => {
    const base = normalize(name);
    return base.includes(slugLower) || slugLower.includes(base);
  });
  if (slugFuzzy) return `/audio/${slugFuzzy}`;

  const idCandidates = [
    `/audio/dombra-${index + 1}.mp3`,
    `/audio/dombra-${index + 1}.ogg`,
    `/audio/dombra-${index + 1}.wav`
  ];
  for (const candidate of idCandidates) {
    if (hasAudioFile(candidate)) return candidate;
  }

  const fallback = audioFiles.find((name) => /\.(mp3|ogg|wav)$/i.test(name));
  return fallback ? `/audio/${fallback}` : null;
};

const tx = db.transaction((rows) => {
  rows.forEach((row, i) => {
    row.audio_url = pickAudioForSeedRow(row, i);
    insert.run(row);
  });
});

tx(productsSeed);

console.log(`SQLite база пересоздана. Добавлено товаров: ${productsSeed.length}`);
