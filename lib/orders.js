import { db } from "./db.js";

export function getOrderWithItems(orderId) {
  const order = db
    .prepare(
      `SELECT id, customer_name, phone, email, city, address, comment, total, status, delivery_method, payment_method, payment_status, payment_ref, paid_at, created_at
       FROM orders
       WHERE id = ?`
    )
    .get(orderId);

  if (!order) {
    return null;
  }

  const items = db
    .prepare(
      `SELECT product_id, title, price, quantity
       FROM order_items
       WHERE order_id = ?
       ORDER BY id ASC`
    )
    .all(orderId);

  return { order, items };
}

export function parseOrderCode(input) {
  if (!input) return null;
  const normalized = String(input).trim().toUpperCase();
  const fromCode = normalized.match(/^DH-(\d+)$/);
  if (fromCode) return Number(fromCode[1]);
  const direct = Number(normalized);
  if (Number.isInteger(direct) && direct > 0) return direct;
  return null;
}

export function getTrackingOrder({ code, contact }) {
  const orderId = parseOrderCode(code);
  const contactValue = String(contact || "").trim().toLowerCase();

  if (!orderId || !contactValue) {
    return null;
  }

  const payload = getOrderWithItems(orderId);
  if (!payload) return null;

  const phoneMatch = (payload.order.phone || "").toLowerCase().includes(contactValue);
  const emailMatch = (payload.order.email || "").toLowerCase() === contactValue;
  if (!phoneMatch && !emailMatch) {
    return null;
  }

  return payload;
}

export function buildTrackingSteps(status, locale = "ru") {
  const isKk = locale === "kk";
  const definitions = [
    { key: "accepted", title: isKk ? "Қабылданды" : "Принят", icon: "✓" },
    { key: "tuning", title: isKk ? "Баптау" : "Настройка", icon: "♬" },
    { key: "packing", title: isKk ? "Қаптама" : "Упаковка", icon: "▣" },
    { key: "delivery", title: isKk ? "Жеткізу" : "Доставка", icon: "🚚" },
    { key: "transit", title: isKk ? "Жолда" : "В пути", icon: "⇄" },
    { key: "delivered", title: isKk ? "Жеткізілді" : "Доставлено", icon: "✔" }
  ];

  const order = ["new", "accepted", "tuning", "packing", "delivery", "transit", "delivered"];
  const normalized = status || "new";
  const currentIndex = Math.max(0, order.indexOf(normalized));

  return definitions.map((step, index) => {
    return {
      ...step,
      done: index <= currentIndex,
      current: index === currentIndex
    };
  });
}

export function listRecentOrders(limit = 5) {
  return db
    .prepare(
      `SELECT
         o.id,
         o.total,
         o.status,
         o.created_at,
         (
           SELECT oi.title
           FROM order_items oi
           WHERE oi.order_id = o.id
           ORDER BY oi.id ASC
           LIMIT 1
         ) AS item_title
       FROM orders o
       ORDER BY o.id DESC
       LIMIT ?`
    )
    .all(Math.max(1, Number(limit) || 5));
}
