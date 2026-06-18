import { db } from "./db.js";
import { localizeProduct, localizeProducts } from "./product-i18n.js";

const sortMap = {
  newest: "id DESC",
  popular: "popular DESC, id DESC",
  cheap: "price ASC, id DESC",
  expensive: "price DESC, id DESC",
  rating: "rating DESC, id DESC"
};

function createInClause(field, values, params) {
  if (!values.length) {
    return "";
  }

  const placeholders = values.map((_, index) => {
    const key = `${field}_${index}`;
    params[key] = values[index];
    return `@${key}`;
  });

  return `${field} IN (${placeholders.join(",")})`;
}

export function listFilters() {
  const categories = db
    .prepare("SELECT DISTINCT category FROM products ORDER BY category ASC")
    .all()
    .map((row) => row.category);

  const materials = db
    .prepare("SELECT DISTINCT material FROM products ORDER BY material ASC")
    .all()
    .map((row) => row.material);

  const badges = db
    .prepare("SELECT DISTINCT badge FROM products ORDER BY badge ASC")
    .all()
    .map((row) => row.badge);

  return { categories, materials, badges };
}

export function listProducts({ search = "", sort = "newest", categories = [], materials = [], badges = [], locale = "ru" } = {}) {
  const params = {};
  const clauses = [];

  if (search.trim()) {
    params.search = `%${search.trim().toLowerCase()}%`;
    clauses.push("(LOWER(name) LIKE @search OR LOWER(category) LIKE @search OR LOWER(material) LIKE @search)");
  }

  const categoryClause = createInClause("category", categories, params);
  if (categoryClause) clauses.push(categoryClause);

  const materialClause = createInClause("material", materials, params);
  if (materialClause) clauses.push(materialClause);

  const badgeClause = createInClause("badge", badges, params);
  if (badgeClause) clauses.push(badgeClause);

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderBy = sortMap[sort] ?? sortMap.popular;

  const rows = db
    .prepare(`
      SELECT id, slug, name, category, material, price, rating, popular, badge, image, description, stock, audio_url
      FROM products
      ${where}
      ORDER BY ${orderBy}
    `)
    .all(params);

  return localizeProducts(rows, locale);
}

export function getProductById(id, locale = "ru") {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  return localizeProduct(row, locale);
}

export function getProductBySlug(slug, locale = "ru") {
  const row = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  return localizeProduct(row, locale);
}
