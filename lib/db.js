import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { productsSeed } from "../data/products.js";

const dbDir = path.join(process.cwd(), "data");
const dbFile = path.join(dbDir, "store.db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbFile, { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
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
    images_json TEXT,
    description TEXT NOT NULL,
    long_description TEXT NOT NULL,
    craftsmanship_hours INTEGER NOT NULL,
    master_name TEXT NOT NULL,
    city TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    audio_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS custom_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    specs_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    comment TEXT,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS favorites (
     user_id INTEGER NOT NULL,
     product_id INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (user_id, product_id),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
   );

   CREATE TABLE IF NOT EXISTS order_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL,
     product_id INTEGER NOT NULL,
     title TEXT NOT NULL,
     price INTEGER NOT NULL,
     quantity INTEGER NOT NULL,
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
     FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
   );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    membership_since TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    brand TEXT NOT NULL,
    last4 TEXT NOT NULL,
    exp_month INTEGER NOT NULL,
    exp_year INTEGER NOT NULL,
    holder_name TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payment_intents (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KZT',
    status TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    brand TEXT NOT NULL,
    last4 TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    authorized_at TEXT,
    captured_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    newsletter INTEGER NOT NULL DEFAULT 1,
    sms_status INTEGER NOT NULL DEFAULT 1,
    club_news INTEGER NOT NULL DEFAULT 0,
    security_alerts INTEGER NOT NULL DEFAULT 1,
    login_alerts INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const productColumns = db.prepare("PRAGMA table_info(products)").all();
const productColumnNames = new Set(productColumns.map((column) => column.name));

if (!productColumnNames.has("audio_url")) {
  db.exec("ALTER TABLE products ADD COLUMN audio_url TEXT");
}
if (!productColumnNames.has("images_json")) {
  db.exec("ALTER TABLE products ADD COLUMN images_json TEXT");
}

const customOrderColumns = db.prepare("PRAGMA table_info(custom_orders)").all();
const customOrderColumnNames = new Set(customOrderColumns.map((column) => column.name));

if (!customOrderColumnNames.has("user_id")) {
  db.exec("ALTER TABLE custom_orders ADD COLUMN user_id INTEGER");
}

const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get()?.count ?? 0;
if (Number(productCount) < Number(productsSeed.length)) {
  const insertProduct = db.prepare(
    `INSERT OR IGNORE INTO products (
       slug, name, category, material, price, rating, popular, badge,
       image, description, long_description, craftsmanship_hours,
       master_name, city, stock, audio_url
     ) VALUES (
       @slug, @name, @category, @material, @price, @rating, @popular, @badge,
       @image, @description, @long_description, @craftsmanship_hours,
       @master_name, @city, @stock, @audio_url
     )`
  );

  const tx = db.transaction(() => {
    productsSeed.forEach((p) => {
      insertProduct.run({
        slug: p.slug,
        name: p.name,
        category: p.category,
        material: p.material,
        price: p.price,
        rating: p.rating,
        popular: p.popular,
        badge: p.badge,
        image: p.image,
        description: p.description,
        long_description: p.long_description,
        craftsmanship_hours: p.craftsmanship_hours,
        master_name: p.master_name,
        city: p.city,
        stock: p.stock,
        audio_url: p.audio_url || null
      });
    });
  });
  tx();
}

{
  const updateSeededBasics = db.prepare(
    `UPDATE products
     SET material = @material,
         badge = @badge
     WHERE slug = @slug`
  );
  const tx = db.transaction(() => {
    productsSeed.forEach((p) => {
      updateSeededBasics.run({ slug: p.slug, material: p.material, badge: p.badge });
    });
  });
  tx();
}

{
  const fillImages = db.prepare(
    `UPDATE products
     SET images_json = COALESCE(images_json, json_array(image))
     WHERE images_json IS NULL OR TRIM(images_json) = ''`
  );
  try {
    fillImages.run();
  } catch {
    const rows = db.prepare("SELECT id, image, images_json FROM products").all();
    const upd = db.prepare("UPDATE products SET images_json = ? WHERE id = ?");
    const tx = db.transaction(() => {
      rows.forEach((r) => {
        const has = typeof r.images_json === "string" && r.images_json.trim();
        if (has) return;
        upd.run(JSON.stringify([r.image].filter(Boolean)), r.id);
      });
    });
    tx();
  }
}

// Ensure unique, real dombra sounds are assigned
const audioDir = path.join(process.cwd(), "public", "audio");
const audioFiles = fs.existsSync(audioDir)
  ? fs
      .readdirSync(audioDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  : [];

const audioFileSet = new Set(audioFiles.map((name) => `/audio/${name}`));
const hasAudioFile = (url) => typeof url === "string" && audioFileSet.has(url);

const pickAudioForProduct = ({ id, slug }) => {
  const slugLower = String(slug || "").toLowerCase();
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const slugCandidates = [
    `/audio/${slug}.mp3`,
    `/audio/${slug}.ogg`,
    `/audio/${slug}.wav`
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
    `/audio/dombra-${id}.mp3`,
    `/audio/dombra-${id}.ogg`,
    `/audio/dombra-${id}.wav`
  ];
  for (const candidate of idCandidates) {
    if (hasAudioFile(candidate)) return candidate;
  }

  return null;
};

const productsForAudio = db
  .prepare("SELECT id, slug, audio_url FROM products ORDER BY id")
  .all();

const updateAudioStmt = db.prepare(
  "UPDATE products SET audio_url = ? WHERE id = ?"
);

productsForAudio.forEach((p) => {
  const current = typeof p.audio_url === "string" ? p.audio_url : "";
  const currentIsLocal = current.startsWith("/audio/");
  const currentOk = currentIsLocal ? hasAudioFile(current) : Boolean(current);

  if (currentOk) return;

  const picked = pickAudioForProduct({ id: p.id, slug: p.slug });
  if (!picked) return;

  updateAudioStmt.run(picked, p.id);
});

const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
const orderColumnNames = new Set(orderColumns.map((column) => column.name));

if (!orderColumnNames.has("email")) {
  db.exec("ALTER TABLE orders ADD COLUMN email TEXT");
}
if (!orderColumnNames.has("delivery_method")) {
  db.exec("ALTER TABLE orders ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'pickup'");
}
if (!orderColumnNames.has("payment_method")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'card'");
}
if (!orderColumnNames.has("payment_status")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'");
}
if (!orderColumnNames.has("payment_ref")) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_ref TEXT");
}
if (!orderColumnNames.has("paid_at")) {
  db.exec("ALTER TABLE orders ADD COLUMN paid_at TEXT");
}

const pmColumns = db.prepare("PRAGMA table_info(payment_methods)").all();
const pmColumnNames = new Set(pmColumns.map((column) => column.name));
if (pmColumnNames.size) {
  db.exec("CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id)");
}

const piColumns = db.prepare("PRAGMA table_info(payment_intents)").all();
const piColumnNames = new Set(piColumns.map((column) => column.name));
if (piColumnNames.size) {
  db.exec("CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status)");
}

const userColumns = db.prepare("PRAGMA table_info(users)").all();
const userColumnNames = new Set(userColumns.map((column) => column.name));

if (!userColumnNames.has("membership_since")) {
  db.exec("ALTER TABLE users ADD COLUMN membership_since TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
}
if (!userColumnNames.has("updated_at")) {
  db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
}
if (!userColumnNames.has("password_hash")) {
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
}
if (!userColumnNames.has("role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

{
  const adminEmail = "admin@aspap.kz";
  const legacyEmail = "alpamys@example.com";

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get(adminEmail);
  if (!existing) {
    const legacy = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get(legacyEmail);
    if (legacy) {
      db.prepare("UPDATE users SET email = ?, role = 'admin' WHERE id = ?").run(adminEmail, legacy.id);
    } else {
      db.prepare(
        `INSERT INTO users (full_name, email, phone, city, address, role, membership_since)
         VALUES (@full_name, @email, @phone, @city, @address, @role, @membership_since)`
      ).run({
        full_name: "Aspap Admin",
        email: adminEmail,
        phone: "+7 (700) 000-00-00",
        city: "Алматы",
        address: "Aspap.kz",
        role: "admin",
        membership_since: "2022-01-15T00:00:00.000Z"
      });
    }
  }

  const adminRow = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get(adminEmail);
  if (adminRow?.id) {
    db.prepare("UPDATE users SET role = 'admin', full_name = ?, phone = ?, city = ?, address = ? WHERE id = ?").run(
      "Админ",
      "+7 (700) 000-00-00",
      "Алматы",
      "Aspap.kz",
      adminRow.id
    );
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword("admin12345"), adminRow.id);
    db.prepare(
      `INSERT OR IGNORE INTO user_preferences (user_id, newsletter, sms_status, club_news, security_alerts, login_alerts)
       VALUES (?, 1, 1, 0, 1, 1)`
    ).run(adminRow.id);
  }
}

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email)");

const prefColumns = db.prepare("PRAGMA table_info(user_preferences)").all();
const prefColumnNames = new Set(prefColumns.map((column) => column.name));

if (!prefColumnNames.has("security_alerts")) {
  db.exec("ALTER TABLE user_preferences ADD COLUMN security_alerts INTEGER NOT NULL DEFAULT 1");
}
if (!prefColumnNames.has("login_alerts")) {
  db.exec("ALTER TABLE user_preferences ADD COLUMN login_alerts INTEGER NOT NULL DEFAULT 1");
}

const adminId = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get("admin@aspap.kz")?.id;
if (adminId) {
  const favoritesCount = db
    .prepare("SELECT COUNT(*) AS count FROM user_favorites WHERE user_id = ?")
    .get(adminId)?.count;

  if (!favoritesCount) {
    db.prepare(
      `INSERT OR IGNORE INTO user_favorites (user_id, product_id)
       SELECT ?, id
       FROM products
       ORDER BY popular DESC, id DESC
       LIMIT 2`
    ).run(adminId);
  }
}

function hashPassword(plainPassword) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plainPassword, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.includes(":")) return false;
  const [salt, savedHash] = storedHash.split(":");
  const current = scryptSync(plainPassword, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(current, "hex"), Buffer.from(savedHash, "hex"));
}

export { db, hashPassword };
