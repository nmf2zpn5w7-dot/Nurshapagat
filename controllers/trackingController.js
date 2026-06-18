import { getProductById } from '../lib/catalog.js';
import { buildTrackingSteps, getTrackingOrder } from '../lib/orders.js';
import { formatKzt } from '../lib/money.js';
import { pick } from '../lib/i18n.js';

function getDeliveryDate(locale) {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

export const getTracking = (req, res) => {
    const locale = req.locale;
    const { code, contact } = req.query;

    const data = code && contact ? getTrackingOrder({ code, contact }) : null;
    const first = data?.items?.[0];
    const product = first ? getProductById(first.product_id, locale) : null;
    const steps = buildTrackingSteps(data?.order?.status || "new", locale);
    const current = steps.find((step) => step.current) || steps[0];

    res.render('tracking', {
        title: pick(locale, "Отслеживание заказа", "Тапсырысты бақылау"),
        data,
        code: code || "",
        contact: contact || "",
        product,
        first,
        steps,
        current,
        deliveryDate: getDeliveryDate(locale),
        formatKzt,
        pick
    });
};
