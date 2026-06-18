import { getProductById } from '../lib/catalog.js';
import { formatKzt } from '../lib/money.js';
import { pick } from '../lib/i18n.js';

function parseGallery(product) {
    try {
        const arr = JSON.parse(product?.images_json || "[]");
        if (Array.isArray(arr) && arr.length) {
            return arr.filter(Boolean);
        }
    } catch {}
    if (product?.image) return [product.image];
    return [];
}

export const getProduct = (req, res) => {
    const { id } = req.params;
    const product = getProductById(Number(id), req.locale);

    if (!product) {
        return res.status(404).render('404', { title: 'Not Found' });
    }

    const gallery = parseGallery(product);

    res.render('product', {
        title: product.name,
        product,
        gallery,
        formatKzt,
        pick
    });
};
