import { db } from '../lib/db.js';
import { pick } from '../lib/i18n.js';
import { NotificationService } from '../services/notificationService.js';
import { formatKzt } from '../lib/money.js';
import { getOrderWithItems } from '../lib/orders.js';
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

function statusLabel(status, locale) {
    if (status === "delivered") return pick(locale, "Доставлено", "Жеткізілді");
    if (status === "transit") return pick(locale, "В пути", "Жолда");
    if (status === "delivery") return pick(locale, "Доставка", "Жеткізу");
    if (status === "packing") return pick(locale, "Упаковка", "Қаптама");
    if (status === "tuning") return pick(locale, "Настройка", "Баптау");
    if (status === "accepted") return pick(locale, "Принят", "Қабылданды");
    if (status === "canceled") return pick(locale, "Отменен", "Бас тартылды");
    return pick(locale, "Новый", "Жаңа");
}

function safeParse(json) {
    try { return JSON.parse(json || "{}"); } catch { return {}; }
}

function slugify(value) {
    const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
        к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
        х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
    };
    const raw = String(value || "").trim().toLowerCase();
    let out = "";
    for (const ch of raw) {
        if (map[ch] !== undefined) out += map[ch];
        else out += ch;
    }
    out = out
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    return out;
}

// Список всех товаров для админки
export const getAdminProducts = (req, res) => {
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    res.render('admin/products', { 
        title: 'Управление товарами',
        products,
        formatKzt,
        pick
    });
};

// Страница добавления/редактирования товара
export const getEditProduct = (req, res) => {
    const { id } = req.params;
    let product = null;
    if (id !== 'new') {
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    }
    res.render('admin/edit-product', { 
        title: product ? 'Редактировать товар' : 'Новый товар',
        product,
        pick
    });
};

// Сохранение товара (создание или обновление)
export const postSaveProduct = (req, res) => {
    const {
        id,
        slug,
        name,
        material,
        badge,
        image,
        images_json,
        audio_url,
        description,
        long_description,
        craftsmanship_hours,
        master_name,
        city,
        stock,
        price
    } = req.body;

    const normalizedCategory = "Домбыра";
    const normalizedName = String(name || "").trim();
    const normalizedMaterial = String(material || "").trim() || "Орех";
    const normalizedBadge = String(badge || "").trim() || "Классическая";
    const normalizedPrice = Math.max(0, Math.round(Number(price) || 0));
    const normalizedHours = Math.max(1, Math.round(Number(craftsmanship_hours) || 120));
    const normalizedStock = Math.max(0, Math.round(Number(stock) || 0));
    const normalizedAudio = String(audio_url || "").trim() || null;
    const normalizedDescription = String(description || "").trim();
    const normalizedLong = String(long_description || "").trim();
    const normalizedMaster = String(master_name || "").trim();
    const normalizedCity = String(city || "").trim() || "Алматы";

    let gallery = [];
    try {
        const arr = JSON.parse(images_json || "[]");
        if (Array.isArray(arr)) {
            gallery = arr.filter(Boolean).slice(0, 12).map((v) => String(v));
        }
    } catch {}

    const coverFromInput = String(image || "").trim();
    const cover = coverFromInput || gallery[0] || "";
    if (!gallery.length && cover) gallery = [cover];

    let finalSlug = String(slug || "").trim();
    if (!finalSlug) {
        const base = slugify(normalizedName);
        finalSlug = base || `dombra-${Date.now().toString(36)}`;
    }
    if (finalSlug.length > 64) finalSlug = finalSlug.slice(0, 64);

    const imagesJson = JSON.stringify(gallery);

    if (id && id !== "new") {
        db.prepare(
            `UPDATE products SET
               slug = ?, name = ?, category = ?, material = ?, price = ?,
               rating = ?, popular = ?, badge = ?, image = ?, images_json = ?, audio_url = ?,
               description = ?, long_description = ?, craftsmanship_hours = ?, master_name = ?, city = ?, stock = ?
             WHERE id = ?`
        ).run(
            finalSlug,
            normalizedName,
            normalizedCategory,
            normalizedMaterial,
            normalizedPrice,
            4.8,
            0,
            normalizedBadge,
            cover,
            imagesJson,
            normalizedAudio,
            normalizedDescription,
            normalizedLong,
            normalizedHours,
            normalizedMaster,
            normalizedCity,
            normalizedStock,
            Number(id)
        );
    } else {
        db.prepare(
            `INSERT INTO products (
               slug, name, category, material, price, rating, popular, badge, image, images_json, audio_url,
               description, long_description, craftsmanship_hours, master_name, city, stock
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            finalSlug,
            normalizedName,
            normalizedCategory,
            normalizedMaterial,
            normalizedPrice,
            4.8,
            0,
            normalizedBadge,
            cover,
            imagesJson,
            normalizedAudio,
            normalizedDescription,
            normalizedLong,
            normalizedHours,
            normalizedMaster,
            normalizedCity,
            normalizedStock
        );
    }

    res.redirect("/admin/products");
};


// Удаление товара
export const postDeleteProduct = (req, res) => {
    const { id } = req.body;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ ok: true });
};

// Список заказов для админки
export const getAdminOrders = (req, res) => {
    const orders = db.prepare(`
        SELECT id, customer_name, phone, email, city, address, total, status, delivery_method, payment_method, payment_status, payment_ref, paid_at, created_at
        FROM orders
        ORDER BY id DESC
        LIMIT 200
    `).all();
    res.render('admin/orders', { 
        title: 'Управление заказами',
        orders,
        formatKzt,
        pick,
        statusLabel
    });
};

export const getAdminOrder = (req, res) => {
    const locale = req.locale;
    const { id } = req.params;
    const payload = getOrderWithItems(id);
    if (!payload) return res.redirect('/admin/orders');
    res.render('admin/order', {
        title: `Order #${id}`,
        order: payload.order,
        items: payload.items,
        formatKzt,
        pick,
        statusLabel,
        locale
    });
};

export const postUpdateOrder = async (req, res) => {
    const { id, status, payment_status, delivery_method, payment_method } = req.body;
    const orderId = Number(id);
    if (!orderId) return res.status(400).json({ error: "Invalid id" });

    const patch = [];
    const params = {};

    if (typeof status === "string") {
        patch.push("status = @status");
        params.status = status;
    }
    if (typeof payment_status === "string") {
        patch.push("payment_status = @payment_status");
        params.payment_status = payment_status;
        if (payment_status === "paid") {
            patch.push("paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)");
        }
    }
    if (typeof delivery_method === "string") {
        patch.push("delivery_method = @delivery_method");
        params.delivery_method = delivery_method;
    }
    if (typeof payment_method === "string") {
        patch.push("payment_method = @payment_method");
        params.payment_method = payment_method;
    }

    if (!patch.length) return res.json({ ok: true });

    db.prepare(`UPDATE orders SET ${patch.join(", ")} WHERE id = @id`).run({ ...params, id: orderId });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (order && typeof status === "string") {
        NotificationService.notifyStatusUpdate(order, status).catch(() => {});
    }

    return res.json({ ok: true });
};

export const postDeleteOrder = (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    res.json({ ok: true });
};

export const getAdminCustomOrders = (req, res) => {
    const orders = db.prepare(`
        SELECT id, user_id, customer_name, phone, email, city, specs_json, status, created_at
        FROM custom_orders
        ORDER BY id DESC
        LIMIT 300
    `).all();

    res.render('admin/custom-orders', {
        title: pick(req.locale, "Заявки мастерской", "Шеберхана өтінімдері"),
        orders,
        formatKzt,
        pick,
        safeParse
    });
};

export const postUpdateCustomOrder = (req, res) => {
    const { id, status } = req.body;
    const rowId = Number(id);
    if (!rowId || typeof status !== "string") return res.status(400).json({ error: "Invalid" });
    db.prepare("UPDATE custom_orders SET status = ? WHERE id = ?").run(status, rowId);
    return res.json({ ok: true });
};

export const postDeleteCustomOrder = (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM custom_orders WHERE id = ?").run(Number(id));
    res.json({ ok: true });
};

export const getAdminUsers = (req, res) => {
    const users = db.prepare(`
        SELECT id, full_name, email, phone, city, address, role, created_at, membership_since
        FROM users
        ORDER BY id DESC
        LIMIT 500
    `).all();

    res.render('admin/users', {
        title: pick(req.locale, "Пользователи", "Қолданушылар"),
        users,
        pick
    });
};

export const getAdminEditUser = (req, res) => {
    const { id } = req.params;
    const userRow = db.prepare(`
        SELECT id, full_name, email, phone, city, address, role, created_at, membership_since
        FROM users
        WHERE id = ?
    `).get(Number(id));

    if (!userRow) return res.redirect('/admin/users');

    res.render('admin/edit-user', {
        title: pick(req.locale, "Редактирование пользователя", "Қолданушыны өңдеу"),
        userRow,
        pick
    });
};

export const postAdminSaveUser = (req, res) => {
    const { id, full_name, email, phone, city, address, role } = req.body;
    const userId = Number(id);
    if (!userId) return res.status(400).json({ error: "Invalid id" });

    const cleanRole = String(role || "user") === "admin" ? "admin" : "user";
    db.prepare(
        `UPDATE users
         SET full_name = ?, email = ?, phone = ?, city = ?, address = ?, role = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(
        String(full_name || "").trim() || "—",
        String(email || "").trim().toLowerCase(),
        String(phone || "").trim(),
        String(city || "").trim(),
        String(address || "").trim(),
        cleanRole,
        userId
    );

    res.redirect('/admin/users/' + userId);
};

export const postAdminDeleteUser = (req, res) => {
    const locale = req.locale;
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid id" });
    if (req.user?.id === userId) {
        return res.status(400).json({ error: pick(locale, "Нельзя удалить себя", "Өзіңізді жоюға болмайды") });
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return res.json({ ok: true });
};

export const postAdminUpload = (req, res) => {
    const kind = String(req.body.kind || "").trim();
    const dataUrl = String(req.body.dataUrl || "");
    const originalName = String(req.body.name || "").slice(0, 180);

    if (!(kind === "image" || kind === "audio")) {
        return res.status(400).json({ error: "Invalid kind" });
    }

    const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Invalid payload" });

    const mime = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, "base64");

    const limits = kind === "image" ? 5 * 1024 * 1024 : 12 * 1024 * 1024;
    if (buffer.length <= 0 || buffer.length > limits) {
        return res.status(400).json({ error: "File too large" });
    }

    const allowedImage = new Map([
        ["image/jpeg", "jpg"],
        ["image/png", "png"],
        ["image/webp", "webp"]
    ]);
    const allowedAudio = new Map([
        ["audio/mpeg", "mp3"],
        ["audio/mp3", "mp3"],
        ["audio/ogg", "ogg"],
        ["audio/wav", "wav"]
    ]);

    const ext = kind === "image" ? allowedImage.get(mime) : allowedAudio.get(mime);
    if (!ext) return res.status(400).json({ error: "Unsupported file type" });

    const safeStem = originalName
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 36) || kind;

    const id = randomBytes(6).toString("hex");
    const fileName = `${safeStem}-${id}.${ext}`;

    const dir = path.join(process.cwd(), "public", "uploads", kind === "image" ? "images" : "audio");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), buffer);

    const url = `/uploads/${kind === "image" ? "images" : "audio"}/${fileName}`;
    return res.json({ ok: true, url });
};
