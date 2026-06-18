import { listFilters, listProducts } from '../lib/catalog.js';
import { formatKzt } from '../lib/money.js';
import { pick } from '../lib/i18n.js';
import { getAccountData } from '../lib/account.js';

function asArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
}

function tagByMaterial(material, locale) {
    if (material === "Береза" || material === "Қайың") return pick(locale, "Премиальная береза", "Премиум қайың");
    if (material === "Дуб" || material === "Емен") return pick(locale, "Дубовое основание", "Емен негізі");
    if (material === "Клён" || material === "Үйеңкі") return pick(locale, "Классический клен", "Классикалық үйеңкі");
    return material;
}

export const getCatalog = (req, res) => {
    const locale = req.locale;
    const { materials } = listFilters();
    
    const query = req.query.q || "";
    const sort = req.query.sort || "newest";

    const selectedMaterials = asArray(req.query.material).filter((value) => value && value !== "all");
    const selectedStyles = asArray(req.query.style).filter((value) => value && value !== "all");

    const allProducts = listProducts({
        search: query,
        sort,
        materials: selectedMaterials,
        badges: selectedStyles,
        locale
    });
    const data = req.user ? getAccountData(req.user.id, locale) : null;

    res.render('catalog', {
        title: pick(locale, "Каталог", "Каталог"),
        products: allProducts,
        materials,
        selectedMaterial: selectedMaterials[0] || "all",
        selectedStyle: selectedStyles[0] || "all",
        query,
        sort,
        formatKzt,
        tagByMaterial,
        pick,
        data
    });
};
