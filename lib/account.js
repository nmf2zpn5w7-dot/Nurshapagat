import { db } from "./db.js";
import { localizeProduct, localizeProducts } from "./product-i18n.js";

function toBool(value) {
  return value === 1 || value === true;
}

function computeClub(totalSpent) {
  const points = Math.floor(totalSpent / 1000);

  const tiers = [
    { key: "shakirt", title: "Уровень «Шәкірт»", min: 0, discount: 0, next: 800 },
    { key: "dombyrashy", title: "Уровень «Домбырашы»", min: 800, discount: 3, next: 2000 },
    { key: "kuishi", title: "Уровень «Күйші»", min: 2000, discount: 7, next: 4000 },
    { key: "usta", title: "Уровень «Ұста»", min: 4000, discount: 12, next: null }
  ];

  const tier = [...tiers].reverse().find((candidate) => points >= candidate.min) ?? tiers[0];
  const progress = tier.next ? Math.max(0, Math.min(100, Math.round((points / tier.next) * 100))) : 100;
  const pointsToNext = tier.next ? Math.max(0, tier.next - points) : 0;

  return { points, progress, pointsToNext, tierKey: tier.key, tierTitle: tier.title, discount: tier.discount };
}

export function getAccountData(userId, locale = "ru") {
  const user = db
    .prepare(
      `SELECT id, full_name, email, phone, city, address, membership_since
       FROM users
       WHERE id = ?`
    )
    .get(userId);

  if (!user) return null;

  const preferences = db
    .prepare(
      `SELECT newsletter, sms_status, club_news, security_alerts, login_alerts
       FROM user_preferences
       WHERE user_id = ?`
    )
    .get(userId) ?? { newsletter: 1, sms_status: 1, club_news: 0, security_alerts: 1, login_alerts: 1 };

  const orders = db
    .prepare(
      `SELECT
         o.id,
         o.total,
         o.status,
         o.created_at,
         (
           SELECT oi.product_id
           FROM order_items oi
           WHERE oi.order_id = o.id
           ORDER BY oi.id ASC
           LIMIT 1
         ) AS item_product_id,
         (
           SELECT oi.title
           FROM order_items oi
           WHERE oi.order_id = o.id
           ORDER BY oi.id ASC
           LIMIT 1
         ) AS item_title
       FROM orders o
       WHERE
         LOWER(COALESCE(o.email, '')) = LOWER(@email)
         OR REPLACE(COALESCE(o.phone, ''), ' ', '') = REPLACE(@phone, ' ', '')
       ORDER BY o.id DESC
       LIMIT 20`
    )
    .all({ email: user.email, phone: user.phone });

  const localizeOrderProduct = db.prepare(
    `SELECT id, slug, name, category, material, price, badge, image, description, long_description, city
     FROM products
     WHERE id = ?`
  );

  const localizedOrders = orders.map((order) => {
    if (!order.item_product_id) return order;
    const product = localizeProduct(localizeOrderProduct.get(order.item_product_id), locale);
    return {
      ...order,
      item_title: product?.name || order.item_title
    };
  });

  const totalSpent = localizedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const club = computeClub(totalSpent);

  const favorites = db
    .prepare(
      `SELECT
         p.id,
         p.slug,
         p.name,
         p.category,
         p.material,
         p.price,
         p.image,
         f.created_at
       FROM user_favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`
    )
    .all(userId);

  const paymentMethods = db
    .prepare(
      `SELECT id, brand, last4, exp_month, exp_year, holder_name, is_default, created_at
       FROM payment_methods
       WHERE user_id = ?
       ORDER BY is_default DESC, id DESC`
    )
    .all(userId);

  return {
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      city: user.city,
      address: user.address,
      membershipSince: user.membership_since
    },
    preferences: {
      newsletter: toBool(preferences.newsletter),
      smsStatus: toBool(preferences.sms_status),
      clubNews: toBool(preferences.club_news),
      securityAlerts: toBool(preferences.security_alerts),
      loginAlerts: toBool(preferences.login_alerts)
    },
    club,
    orders: localizedOrders,
    favorites: localizeProducts(favorites, locale),
    paymentMethods
  };
}

export function updateProfile(
  {
    fullName,
    email,
    phone,
    city,
    address
  },
  userId
) {
  db.prepare(
    `UPDATE users
     SET full_name = @full_name,
         email = @email,
         phone = @phone,
         city = @city,
         address = @address,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  ).run({
    id: userId,
    full_name: String(fullName || "").trim(),
    email: String(email || "").trim(),
    phone: String(phone || "").trim(),
    city: String(city || "").trim(),
    address: String(address || "").trim()
  });
}

export function updatePreferences(
  { newsletter, smsStatus, clubNews, securityAlerts, loginAlerts, email, phone },
  userId
) {
  if (typeof email === "string" || typeof phone === "string") {
    const user = db.prepare("SELECT email, phone FROM users WHERE id = ?").get(userId);
    if (user) {
      db.prepare(
        `UPDATE users
         SET email = @email,
             phone = @phone,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = @id`
      ).run({
        id: userId,
        email: typeof email === "string" ? email.trim() : user.email,
        phone: typeof phone === "string" ? phone.trim() : user.phone
      });
    }
  }

  db.prepare(
    `INSERT INTO user_preferences (user_id, newsletter, sms_status, club_news, security_alerts, login_alerts)
     VALUES (@user_id, @newsletter, @sms_status, @club_news, @security_alerts, @login_alerts)
     ON CONFLICT(user_id) DO UPDATE SET
       newsletter = excluded.newsletter,
       sms_status = excluded.sms_status,
       club_news = excluded.club_news,
       security_alerts = excluded.security_alerts,
       login_alerts = excluded.login_alerts`
  ).run({
    user_id: userId,
    newsletter: newsletter ? 1 : 0,
    sms_status: smsStatus ? 1 : 0,
    club_news: clubNews ? 1 : 0,
    security_alerts: securityAlerts ? 1 : 0,
    login_alerts: loginAlerts ? 1 : 0
  });
}

export function addFavorite(productId, userId) {
  db.prepare(
    `INSERT OR IGNORE INTO user_favorites (user_id, product_id)
     VALUES (?, ?)`
  ).run(userId, productId);
}

export function removeFavorite(productId, userId) {
  db.prepare("DELETE FROM user_favorites WHERE user_id = ? AND product_id = ?").run(userId, productId);
}
