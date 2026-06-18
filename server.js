import 'dotenv/config';
import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import { getSessionUser } from './lib/auth.js';
import { pick } from './lib/i18n.js';

// Импорт контроллеров
import { getHome } from './controllers/homeController.js';
import { getCatalog } from './controllers/catalogController.js';
import { getLogin, postLogin, postLogout, getRegister, postRegister } from './controllers/authController.js';
import { getAccount, postToggleFavorite, postAddPaymentMethod, postDeletePaymentMethod, postSetDefaultPaymentMethod } from './controllers/accountController.js';
import { getProduct } from './controllers/productController.js';
import { getCheckout, postOrder, getOrderConfirmation, postCustomOrder, postConfirmPayment } from './controllers/orderController.js';
import { getTracking } from './controllers/trackingController.js';
import { getAdminProducts, getEditProduct, postSaveProduct, postDeleteProduct, getAdminOrders, getAdminOrder, postUpdateOrder, postDeleteOrder, getAdminCustomOrders, postUpdateCustomOrder, postDeleteCustomOrder, getAdminUsers, getAdminEditUser, postAdminSaveUser, postAdminDeleteUser, postAdminUpload } from './controllers/adminController.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Безопасность
app.use(helmet({
    contentSecurityPolicy: false, // Отключаем для простоты работы с внешними изображениями
}));

// Настройка EJS
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Middleware
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'aspap-default-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
    }
}));

// Global Middleware для i18n и User
app.use(async (req, res, next) => {
    try {
        const locale = req.cookies.NEXT_LOCALE || 'ru';
        req.locale = locale;
        
        const token = req.cookies.dh_session;
        req.user = token ? getSessionUser(token) : null;
        
        res.locals.locale = locale;
        res.locals.user = req.user;
        res.locals.pick = pick;
        res.locals.path = req.path;
        res.locals.query = req.query;
        res.locals.cartCount = 0; // Можно добавить логику получения из сессии если нужно
        
        next();
    } catch (error) {
        next(error);
    }
});

// Middleware для защиты админки
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).render('error', { 
        title: '403', 
        message: pick(req.locale, 'Доступ запрещен', 'Қол жеткізу тыйым салынған')
    });
};

// Роуты
app.get('/', getHome);
app.get('/catalog', getCatalog);
app.get('/cart', (req, res) => {
    if (req.user?.role === 'admin') return res.redirect('/admin/orders');
    return res.render('cart', { title: pick(req.locale, 'Корзина', 'Себет') });
});
app.get('/login', getLogin);
app.post('/login', postLogin);
app.get('/register', getRegister);
app.post('/register', postRegister);
app.post('/api/auth/logout', postLogout);
app.get('/admin', isAdmin, (req, res) => res.redirect('/admin/orders'));
app.get('/account', getAccount);
app.post('/api/favorites/toggle', postToggleFavorite);
app.post('/api/account/payment-methods', postAddPaymentMethod);
app.post('/api/account/payment-methods/:id/delete', postDeletePaymentMethod);
app.post('/api/account/payment-methods/:id/default', postSetDefaultPaymentMethod);
app.get('/product/:id', getProduct);
app.get('/checkout', getCheckout);
app.post('/api/orders', postOrder);
app.post('/api/payments/confirm', postConfirmPayment);
app.post('/api/custom-orders', postCustomOrder);
app.get('/order-confirmation/:id', getOrderConfirmation);
app.get('/tracking', getTracking);
app.get('/workshop', (req, res) => res.render('workshop', { title: pick(req.locale, 'Мастерская', 'Шеберхана') }));

// Админка
app.get('/admin/products', isAdmin, getAdminProducts);
app.get('/admin/products/:id', isAdmin, getEditProduct);
app.post('/admin/products/save', isAdmin, postSaveProduct);
app.post('/admin/products/delete', isAdmin, postDeleteProduct);
app.get('/admin/orders', isAdmin, getAdminOrders);
app.get('/admin/orders/:id', isAdmin, getAdminOrder);
app.post('/admin/orders/update', isAdmin, postUpdateOrder);
app.post('/admin/orders/:id/delete', isAdmin, postDeleteOrder);
app.get('/admin/custom-orders', isAdmin, getAdminCustomOrders);
app.post('/admin/custom-orders/update', isAdmin, postUpdateCustomOrder);
app.post('/admin/custom-orders/:id/delete', isAdmin, postDeleteCustomOrder);
app.get('/admin/users', isAdmin, getAdminUsers);
app.get('/admin/users/:id', isAdmin, getAdminEditUser);
app.post('/admin/users/save', isAdmin, postAdminSaveUser);
app.post('/admin/users/:id/delete', isAdmin, postAdminDeleteUser);
app.post('/admin/uploads', isAdmin, postAdminUpload);

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    const status = err.status || 500;
    res.status(status).render('error', {
        title: status,
        message: process.env.NODE_ENV === 'production'
            ? pick(req.locale, 'Что-то пошло не так...', 'Бір нәрсе дұрыс болмады...')
            : err.message
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
