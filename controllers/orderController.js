import { db } from '../lib/db.js';
import { pick } from '../lib/i18n.js';
import { getOrderWithItems } from '../lib/orders.js';
import { formatKzt } from '../lib/money.js';
import { NotificationService } from '../services/notificationService.js';
import { orderSchema, customOrderSchema } from '../lib/validation.js';

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

function maskPhone(phone) {
    const digits = String(phone || "").replace(/[^\d]/g, "");
    if (digits.length < 4) return phone || "";
    return `+${digits.slice(0, 1)} (***) ***-${digits.slice(-4, -2)}-${digits.slice(-2)}`;
}

export const getCheckout = (req, res) => {
    if (req.user?.role === "admin") {
        return res.redirect("/admin/orders");
    }
    const paymentMethods = req.user
        ? db
            .prepare(
                `SELECT id, brand, last4, exp_month, exp_year, holder_name, is_default
                 FROM payment_methods
                 WHERE user_id = ?
                 ORDER BY is_default DESC, id DESC`
            )
            .all(req.user.id)
        : [];

    res.render('checkout', { 
        title: pick(req.locale, "Оформление заказа", "Тапсырысты рәсімдеу"),
        formatKzt,
        pick,
        paymentMethods,
        initialData: req.user ? {
            customerName: req.user.full_name,
            email: req.user.email,
            phone: req.user.phone || '',
            city: req.user.city || '',
            address: req.user.address || ''
        } : null
    });
};

export const postOrder = async (req, res) => {
    const locale = req.locale;
    try {
        if (req.user?.role === "admin") {
            return res.status(403).json({ error: pick(locale, "Доступ запрещен", "Қол жеткізу тыйым салынған") });
        }
        const { error, value } = orderSchema.validate(req.body, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { customer, items, checkout, payment } = value;

        const getProduct = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ?");
        const insertOrder = db.prepare(`
            INSERT INTO orders (
                customer_name, phone, email, city, address, comment, total, status, delivery_method, payment_method, payment_status, payment_ref, paid_at
            )
            VALUES (
                @customer_name, @phone, @email, @city, @address, @comment, @total, @status, @delivery_method, @payment_method, @payment_status, @payment_ref, @paid_at
            )
        `);
        const insertOrderItem = db.prepare(`
            INSERT INTO order_items (order_id, product_id, title, price, quantity)
            VALUES (@order_id, @product_id, @title, @price, @quantity)
        `);
        const updateStock = db.prepare(
            "UPDATE products SET stock = CASE WHEN stock - @qty < 0 THEN 0 ELSE stock - @qty END WHERE id = @id"
        );

        const parsedItems = [];
        const missing = [];
        for (const line of items) {
            const id = Number(line?.id);
            const qty = Number(line?.qty);
            if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty <= 0) {
                missing.push({ id: line?.id, qty: line?.qty });
                continue;
            }
            const product = getProduct.get(id);
            if (!product) {
                missing.push({ id, qty });
                continue;
            }
            parsedItems.push({ ...product, qty });
        }
        if (missing.length) {
            return res.status(409).json({
                error: pick(locale, "Некоторые товары больше недоступны. Корзина будет обновлена.", "Кейбір тауарлар қолжетімсіз. Себет жаңартылады."),
                missing
            });
        }

        const deliveryMap = { express: 5000, standard: 2000, pickup: 0 };
        const deliveryMethod = checkout?.deliveryMethod || "pickup";
        const paymentMethod = checkout?.paymentMethod || "card";
        const shippingFee = deliveryMap[deliveryMethod] ?? 0;
        const subtotal = parsedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
        const totalQty = parsedItems.reduce((sum, item) => sum + item.qty, 0);
        const discount = totalQty >= 2 ? 10000 : 0;
        const total = Math.max(0, subtotal + shippingFee - discount);

        if (paymentMethod === "card") {
            const intentId = payment?.intentId ? String(payment.intentId) : "";
            if (!intentId) {
                const pmId = Number(payment?.paymentMethodId || 0);
                let brand = "Card";
                let last4 = "0000";

                if (pmId) {
                    if (!req.user) {
                        return res.status(401).json({ error: pick(locale, "Требуется вход для выбора сохраненной карты", "Сақталған картаны таңдау үшін кіру қажет") });
                    }
                    const pm = db.prepare("SELECT id, brand, last4 FROM payment_methods WHERE id = ? AND user_id = ?").get(pmId, req.user.id);
                    if (!pm) return res.status(400).json({ error: pick(locale, "Карта не найдена", "Карта табылмады") });
                    brand = pm.brand;
                    last4 = pm.last4;
                } else {
                    const digits = normalizeCardNumber(payment?.cardNumber);
                    const expMonth = Number(payment?.expMonth);
                    const expYear = Number(payment?.expYear);
                    const cvc = String(payment?.cvc || "").trim();

                    if (!isPlausibleCardNumber(digits) && !luhnCheck(digits)) {
                        return res.status(400).json({ error: pick(locale, "Неверный номер карты", "Карта нөмірі қате") });
                    }
                    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) return res.status(400).json({ error: pick(locale, "Неверный срок", "Мерзім қате") });
                    if (!Number.isInteger(expYear) || expYear < 2024 || expYear > 2100) return res.status(400).json({ error: pick(locale, "Неверный срок", "Мерзім қате") });
                    if (!(cvc.length === 3 || cvc.length === 4)) return res.status(400).json({ error: pick(locale, "Неверный CVC", "CVC қате") });

                    const now = new Date();
                    const expDate = new Date(expYear, expMonth - 1, 1);
                    expDate.setMonth(expDate.getMonth() + 1);
                    if (expDate.getTime() <= now.getTime()) return res.status(400).json({ error: pick(locale, "Срок действия истек", "Мерзімі өтіп кеткен") });

                    brand = detectBrand(digits);
                    last4 = digits.slice(-4);

                    if (payment?.saveCard && req.user) {
                        const existingCount = db.prepare("SELECT COUNT(*) AS c FROM payment_methods WHERE user_id = ?").get(req.user.id)?.c ?? 0;
                        const shouldDefault = Number(existingCount) === 0;
                        const txSave = db.transaction(() => {
                            if (shouldDefault) db.prepare("UPDATE payment_methods SET is_default = 0 WHERE user_id = ?").run(req.user.id);
                            db.prepare(
                                `INSERT INTO payment_methods (user_id, brand, last4, exp_month, exp_year, holder_name, is_default)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`
                            ).run(req.user.id, brand, last4, expMonth, expYear, String(payment?.holderName || "").trim() || null, shouldDefault ? 1 : 0);
                        });
                        txSave();
                    }
                }

                const otp = String(Math.floor(100000 + Math.random() * 900000));
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
                const intent = {
                    id: `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 10)}`,
                    user_id: req.user ? req.user.id : null,
                    amount: total,
                    status: "requires_action",
                    otp_code: otp,
                    expires_at: expiresAt,
                    brand,
                    last4,
                    customer_email: (customer.email || "").trim(),
                    customer_phone: customer.phone.trim()
                };

                db.prepare(
                    `INSERT INTO payment_intents (id, user_id, amount, status, otp_code, expires_at, brand, last4, customer_email, customer_phone)
                     VALUES (@id, @user_id, @amount, @status, @otp_code, @expires_at, @brand, @last4, @customer_email, @customer_phone)`
                ).run(intent);

                const payload = {
                    requiresAction: true,
                    intentId: intent.id,
                    brand: intent.brand,
                    last4: intent.last4,
                    destination: maskPhone(intent.customer_phone)
                };
                if (process.env.NODE_ENV !== "production") {
                    payload.otp = intent.otp_code;
                }
                return res.json(payload);
            }

            const pi = db.prepare("SELECT id, amount, status, expires_at FROM payment_intents WHERE id = ?").get(intentId);
            if (!pi) return res.status(400).json({ error: pick(locale, "Платеж не найден", "Төлем табылмады") });
            if (String(pi.status) !== "authorized") return res.status(400).json({ error: pick(locale, "Платеж не подтвержден", "Төлем расталмаған") });
            if (new Date(pi.expires_at).getTime() < Date.now()) return res.status(400).json({ error: pick(locale, "Сессия оплаты истекла", "Төлем сессиясы аяқталды") });
            if (Number(pi.amount) !== Number(total)) return res.status(400).json({ error: pick(locale, "Сумма не совпадает", "Сома сәйкес емес") });
        }

        const tx = db.transaction(() => {
            let paymentStatus = "pending";
            let paymentRef = null;
            let paidAt = null;
            if (paymentMethod === "card") {
                paymentStatus = "paid";
                paymentRef = payment.intentId;
                paidAt = new Date().toISOString();
                db.prepare("UPDATE payment_intents SET status = 'captured', captured_at = CURRENT_TIMESTAMP WHERE id = ?").run(payment.intentId);
            } else if (paymentMethod === "kaspi_qr" || paymentMethod === "installments" || paymentMethod === "kaspi_red") {
                paymentStatus = "pending";
            } else {
                paymentStatus = "pending";
            }

            const result = insertOrder.run({
                customer_name: customer.customerName.trim(),
                phone: customer.phone.trim(),
                email: (customer.email || "").trim(),
                city: customer.city.trim(),
                address: customer.address.trim(),
                comment: customer.comment || "",
                total,
                status: "packing",
                delivery_method: deliveryMethod,
                payment_method: paymentMethod,
                payment_status: paymentStatus,
                payment_ref: paymentRef,
                paid_at: paidAt
            });
            const orderId = result.lastInsertRowid;
            for (const item of parsedItems) {
                insertOrderItem.run({
                    order_id: Number(orderId),
                    product_id: item.id,
                    title: item.name,
                    price: item.price,
                    quantity: item.qty
                });
                updateStock.run({ id: item.id, qty: item.qty });
            }
            return Number(orderId);
        });

        const orderId = tx();

        // Асинхронное уведомление
        NotificationService.notifyNewOrder({
            id: orderId,
            total,
            customer_name: customer.customerName,
            email: customer.email
        }).catch(console.error);

        res.json({ ok: true, orderId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const postConfirmPayment = (req, res) => {
    const locale = req.locale;
    try {
        const intentId = String(req.body.intentId || "").trim();
        const code = String(req.body.code || "").trim();
        if (!intentId || code.length < 4) return res.status(400).json({ error: pick(locale, "Неверные данные", "Деректер қате") });

        const pi = db.prepare("SELECT id, otp_code, status, expires_at FROM payment_intents WHERE id = ?").get(intentId);
        if (!pi) return res.status(404).json({ error: pick(locale, "Платеж не найден", "Төлем табылмады") });
        if (new Date(pi.expires_at).getTime() < Date.now()) return res.status(400).json({ error: pick(locale, "Сессия оплаты истекла", "Төлем сессиясы аяқталды") });
        if (String(pi.status) === "authorized" || String(pi.status) === "captured") return res.json({ ok: true });
        if (String(pi.status) !== "requires_action") return res.status(400).json({ error: pick(locale, "Неверный статус платежа", "Төлем мәртебесі қате") });
        if (String(pi.otp_code) !== code) return res.status(400).json({ error: pick(locale, "Неверный код", "Код қате") });

        db.prepare("UPDATE payment_intents SET status = 'authorized', authorized_at = CURRENT_TIMESTAMP WHERE id = ?").run(intentId);
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ error: pick(locale, "Ошибка сервера", "Сервер қатесі") });
    }
};

export const getOrderConfirmation = (req, res) => {
    const { id } = req.params;
    const data = getOrderWithItems(id);
    if (!data) return res.redirect('/');
    res.render('order-confirmation', { 
        title: pick(req.locale, "Заказ подтвержден", "Тапсырыс расталды"),
        order: data.order,
        items: data.items,
        formatKzt,
        pick
    });
};

export const postCustomOrder = (req, res) => {
    const locale = req.locale;
    try {
        if (!req.user) {
            return res.status(401).json({
                error: pick(locale, "Требуется вход в аккаунт", "Аккаунтқа кіру қажет")
            });
        }
        if (req.user.role === "admin") {
            return res.status(403).json({ error: pick(locale, "Доступ запрещен", "Қол жеткізу тыйым салынған") });
        }

        const { error, value } = customOrderSchema.validate(req.body, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const insert = db.prepare(`
            INSERT INTO custom_orders (user_id, customer_name, phone, email, city, specs_json, status)
            VALUES (@user_id, @customer_name, @phone, @email, @city, @specs_json, @status)
        `);

        const result = insert.run({
            user_id: req.user.id,
            customer_name: value.customerName.trim(),
            phone: value.phone.trim(),
            email: (value.email || "").trim(),
            city: value.city.trim(),
            specs_json: JSON.stringify({
                stringCount: value.stringCount,
                handedness: value.handedness,
                scaleLength: value.scaleLength,
                woodType: value.woodType,
                bodyStyle: value.bodyStyle,
                decoration: value.decoration,
                finish: value.finish,
                caseIncluded: value.caseIncluded,
                deadline: value.deadline,
                budget: value.budget,
                contactMethod: value.contactMethod,
                notes: value.notes || ""
            }),
            status: "new"
        });

        const id = Number(result.lastInsertRowid);

        NotificationService.notifyNewOrder({
            id,
            total: value.budget,
            customer_name: value.customerName,
            email: value.email,
            type: "custom_order"
        }).catch(() => {});

        return res.json({
            ok: true,
            id,
            message: pick(locale, "Заявка отправлена. Мастер свяжется с вами в ближайшее время.", "Өтінім жіберілді. Шебер жақын арада сізбен байланысады.")
        });
    } catch (e) {
        return res.status(500).json({ error: pick(locale, "Ошибка сервера", "Сервер қатесі") });
    }
};
