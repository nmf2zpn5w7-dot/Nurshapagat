import { getAccountData } from '../lib/account.js';
import { formatKzt } from '../lib/money.js';
import { pick } from '../lib/i18n.js';
import { db } from '../lib/db.js';

function normalizeCardNumber(input) {
    return String(input || "").replace(/[^\d]/g, "");
}

function luhnCheck(num) {
    const digits = String(num || "").replace(/[^\d]/g, "");
    if (digits.length < 12) return false;
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = Number(digits[i]);
        if (alt) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
    }
    return sum % 10 === 0;
}

function detectBrand(digits) {
    if (digits.startsWith("4")) return "Visa";
    const p2 = Number(digits.slice(0, 2));
    const p4 = Number(digits.slice(0, 4));
    if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return "Mastercard";
    return "Card";
}

function isPlausibleCardNumber(digits) {
    const v = String(digits || "").replace(/[^\d]/g, "");
    if (v.length < 16 || v.length > 19) return false;
    if (/^0+$/.test(v)) return false;
    if (!/^[245]/.test(v)) return false;
    return true;
}

export const postToggleFavorite = (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required' });
    if (req.user.role === 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { productId } = req.body;
    
    const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?').get(req.user.id, productId);
    
    if (existing) {
        db.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').run(req.user.id, productId);
        return res.json({ status: 'removed' });
    } else {
        db.prepare('INSERT INTO favorites (user_id, product_id) VALUES (?, ?)').run(req.user.id, productId);
        return res.json({ status: 'added' });
    }
};

export const getAccount = (req, res) => {
    if (!req.user) {
        return res.redirect('/login?next=/account');
    }
    if (req.user.role === "admin") {
        return res.redirect("/admin/orders");
    }

    const data = getAccountData(req.user.id, req.locale);
    if (!data) {
        return res.redirect('/login');
    }

    res.render('account', {
        title: pick(req.locale, "Личный кабинет", "Жеке кабинет"),
        data,
        formatKzt,
        pick,
        formatDate: (value, locale) => {
            if (!value) return "—";
            return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
        },
        formatMembershipSince: (value, locale) => {
            if (!value) return "—";
            const year = new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { year: "numeric" }).format(new Date(value));
            return locale === "kk" ? `Домбыра жолында ${year} жылдан бері` : `В пути домбры с ${year} года`;
        },
        statusLabel: (status, locale) => {
            if (status === "delivered") return pick(locale, "Доставлено", "Жеткізілді");
            if (status === "transit") return pick(locale, "В пути", "Жолда");
            if (status === "delivery") return pick(locale, "Доставка", "Жеткізу");
            if (status === "packing") return pick(locale, "Упаковка", "Қаптама");
            if (status === "tuning") return pick(locale, "Настройка", "Баптау");
            if (status === "accepted") return pick(locale, "Принят", "Қабылданды");
            return pick(locale, "В работе", "Өңделуде");
        },
        tierTitleByKey: (key, locale) => {
            if (key === "usta") return pick(locale, "Уровень «Ұста»", "«Ұста» деңгейі");
            if (key === "kuishi") return pick(locale, "Уровень «Күйші»", "«Күйші» деңгейі");
            if (key === "dombyrashy") return pick(locale, "Уровень «Домбырашы»", "«Домбырашы» деңгейі");
            return pick(locale, "Уровень «Шәкірт»", "«Шәкірт» деңгейі");
        }
    });
};

export const postAddPaymentMethod = (req, res) => {
    const locale = req.locale;
    if (!req.user) return res.status(401).json({ error: pick(locale, "Требуется вход", "Кіру қажет") });

    const digits = normalizeCardNumber(req.body.cardNumber);
    const expMonth = Number(req.body.expMonth);
    const expYear = Number(req.body.expYear);
    const holderName = String(req.body.holderName || "").trim();
    const makeDefault = Boolean(req.body.makeDefault);

    if (!isPlausibleCardNumber(digits) && !luhnCheck(digits)) {
        return res.status(400).json({ error: pick(locale, "Неверный номер карты", "Карта нөмірі қате") });
    }
    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) return res.status(400).json({ error: pick(locale, "Неверный месяц", "Ай қате") });
    if (!Number.isInteger(expYear) || expYear < 2024 || expYear > 2100) return res.status(400).json({ error: pick(locale, "Неверный год", "Жыл қате") });

    const now = new Date();
    const expDate = new Date(expYear, expMonth - 1, 1);
    expDate.setMonth(expDate.getMonth() + 1);
    if (expDate.getTime() <= now.getTime()) return res.status(400).json({ error: pick(locale, "Срок действия истек", "Мерзімі өтіп кеткен") });

    const last4 = digits.slice(-4);
    const brand = detectBrand(digits);

    const existingCount = db.prepare("SELECT COUNT(*) AS c FROM payment_methods WHERE user_id = ?").get(req.user.id)?.c ?? 0;
    const shouldDefault = makeDefault || Number(existingCount) === 0;

    const tx = db.transaction(() => {
        if (shouldDefault) {
            db.prepare("UPDATE payment_methods SET is_default = 0 WHERE user_id = ?").run(req.user.id);
        }
        db.prepare(
            `INSERT INTO payment_methods (user_id, brand, last4, exp_month, exp_year, holder_name, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(req.user.id, brand, last4, expMonth, expYear, holderName || null, shouldDefault ? 1 : 0);
    });
    tx();

    return res.json({ ok: true });
};

export const postDeletePaymentMethod = (req, res) => {
    const locale = req.locale;
    if (!req.user) return res.status(401).json({ error: pick(locale, "Требуется вход", "Кіру қажет") });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid" });

    const tx = db.transaction(() => {
        const row = db.prepare("SELECT id, is_default FROM payment_methods WHERE id = ? AND user_id = ?").get(id, req.user.id);
        if (!row) return;
        db.prepare("DELETE FROM payment_methods WHERE id = ? AND user_id = ?").run(id, req.user.id);
        if (row.is_default) {
            const next = db.prepare("SELECT id FROM payment_methods WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(req.user.id);
            if (next?.id) db.prepare("UPDATE payment_methods SET is_default = 1 WHERE id = ? AND user_id = ?").run(next.id, req.user.id);
        }
    });
    tx();

    return res.json({ ok: true });
};

export const postSetDefaultPaymentMethod = (req, res) => {
    const locale = req.locale;
    if (!req.user) return res.status(401).json({ error: pick(locale, "Требуется вход", "Кіру қажет") });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid" });

    const tx = db.transaction(() => {
        db.prepare("UPDATE payment_methods SET is_default = 0 WHERE user_id = ?").run(req.user.id);
        db.prepare("UPDATE payment_methods SET is_default = 1 WHERE id = ? AND user_id = ?").run(id, req.user.id);
    });
    tx();

    return res.json({ ok: true });
};
