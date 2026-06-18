import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, hashPassword, verifyPassword } from "./db.js";
import { pick } from "./i18n.js";

const SESSION_TTL_DAYS = 30;
const SESSION_COOKIE = "dh_session";

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function createUser({ fullName, email, phone, city, address, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(normalizedEmail);
  if (existing) {
    return { ok: false, error: "Пользователь с таким email уже существует" };
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, password_hash, phone, city, address, membership_since)
       VALUES (@full_name, @email, @password_hash, @phone, @city, @address, @membership_since)`
    )
    .run({
      full_name: fullName.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      phone: phone.trim(),
      city: city.trim(),
      address: address.trim(),
      membership_since: new Date().toISOString()
    });

  const userId = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT OR IGNORE INTO user_preferences (user_id, newsletter, sms_status, club_news, security_alerts, login_alerts)
     VALUES (?, 1, 1, 0, 1, 1)`
  ).run(userId);

  return { ok: true, userId };
}

export function authenticateUser({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = db
    .prepare("SELECT id, password_hash FROM users WHERE LOWER(email) = ?")
    .get(normalizedEmail);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { ok: false, error: "Неверный email или пароль" };
  }

  return { ok: true, userId: user.id };
}

export function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS).toISOString();

  db.prepare(
    `INSERT INTO user_sessions (token, user_id, expires_at)
     VALUES (?, ?, ?)`
  ).run(token, userId, expiresAt);

  return { token, expiresAt };
}

export function deleteSession(token) {
  if (!token) return;
  db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token);
}

export function getUserIdBySessionToken(token) {
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT user_id, expires_at
       FROM user_sessions
       WHERE token = ?`
    )
    .get(token);

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return Number(row.user_id);
}

export function getSessionUser(token) {
  const userId = getUserIdBySessionToken(token);
  if (!userId) return null;

  return db
    .prepare("SELECT id, full_name, email, role, phone, city, address FROM users WHERE id = ?")
    .get(userId);
}

export function cookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt)
  };
}

export function changeUserPassword({ userId, currentPassword, newPassword }) {
  const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId);
  if (!user) {
    return { ok: false, error: "Пользователь не найден" };
  }
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return { ok: false, error: "Текущий пароль введен неверно" };
  }
  if (String(newPassword || "").length < 8) {
    return { ok: false, error: "Новый пароль должен быть не короче 8 символов" };
  }

  const nextHash = hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextHash, userId);
  return { ok: true };
}

export function revokeUserSessions(userId, keepToken = null) {
  if (keepToken) {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ? AND token <> ?").run(userId, keepToken);
    return;
  }
  db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
}

export function localizeAuthError(error, locale = "ru") {
  switch (error) {
    case "Пользователь с таким email уже существует":
      return pick(locale, "Пользователь с таким email уже существует", "Осындай email бар пайдаланушы әлдеқашан тіркелген");
    case "Неверный email или пароль":
      return pick(locale, "Неверный email или пароль", "Email немесе құпиясөз қате");
    case "Пользователь не найден":
      return pick(locale, "Пользователь не найден", "Пайдаланушы табылмады");
    case "Текущий пароль введен неверно":
      return pick(locale, "Текущий пароль введен неверно", "Ағымдағы құпиясөз қате енгізілді");
    case "Новый пароль должен быть не короче 8 символов":
      return pick(locale, "Новый пароль должен быть не короче 8 символов", "Жаңа құпиясөз кемінде 8 таңбадан тұруы керек");
    default:
      return error;
  }
}
