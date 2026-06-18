import { authenticateUser, createSession, getSessionCookieName, cookieOptions, localizeAuthError, deleteSession, createUser } from '../lib/auth.js';
import { pick } from '../lib/i18n.js';
import { loginSchema, registerSchema } from '../lib/validation.js';

export const getLogin = (req, res) => {
    res.render('login', { title: pick(req.locale, "Вход", "Кіру"), error: null });
};

export const postLogin = (req, res) => {
    const { email, password } = req.body;
    const locale = req.locale;

    const { error } = loginSchema.validate({ email, password });
    if (error) {
        return res.render('login', { 
            title: pick(locale, "Вход", "Кіру"), 
            error: error.details[0].message 
        });
    }

    const auth = authenticateUser({ email, password });
    if (!auth.ok) {
        return res.render('login', { 
            title: pick(locale, "Вход", "Кіру"), 
            error: localizeAuthError(auth.error, locale) 
        });
    }

    const session = createSession(auth.userId);
    res.cookie(getSessionCookieName(), session.token, cookieOptions(session.expiresAt));
    
    const nextPath = req.query.next || '/account';
    res.redirect(nextPath);
};

export const getRegister = (req, res) => {
    res.render('register', { title: pick(req.locale, "Регистрация", "Тіркелу"), error: null, form: {} });
};

export const postRegister = (req, res) => {
    const { fullName, email, phone, city, address, password } = req.body;
    const locale = req.locale;

    const { error } = registerSchema.validate(req.body);
    if (error) {
        return res.render('register', { 
            title: pick(locale, "Регистрация", "Тіркелу"), 
            error: error.details[0].message,
            form: req.body
        });
    }

    const created = createUser({ fullName, email, phone, city, address, password });
    if (!created.ok) {
        return res.render('register', { 
            title: pick(locale, "Регистрация", "Тіркелу"), 
            error: localizeAuthError(created.error, locale),
            form: req.body
        });
    }

    const session = createSession(created.userId);
    res.cookie(getSessionCookieName(), session.token, cookieOptions(session.expiresAt));
    res.redirect('/account');
};

export const postLogout = (req, res) => {
    const token = req.cookies[getSessionCookieName()];
    if (token) {
        deleteSession(token);
    }
    res.clearCookie(getSessionCookieName());
    res.redirect('/login');
};
