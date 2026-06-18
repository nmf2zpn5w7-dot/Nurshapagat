import { listProducts } from '../lib/catalog.js';
import { formatKzt } from '../lib/money.js';

export const getHome = (req, res) => {
    const featured = listProducts({ sort: "popular", locale: req.locale }).slice(0, 3);
    res.render('index', { 
        featured, 
        formatKzt,
        title: req.locale === 'kk' ? 'Басты бет' : 'Главная'
    });
};
