import Joi from 'joi';

// Валидация логина
export const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Введите корректный email',
        'any.required': 'Email обязателен'
    }),
    password: Joi.string().min(5).required().messages({
        'string.min': 'Пароль должен быть не менее 5 символов',
        'any.required': 'Пароль обязателен'
    })
});

// Валидация регистрации
export const registerSchema = Joi.object({
    fullName: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Имя слишком короткое',
        'any.required': 'ФИО обязательно'
    }),
    email: Joi.string().email().required().messages({
        'string.email': 'Введите корректный email'
    }),
    phone: Joi.string().pattern(/^\+7\s?\(7(00|01|02|05|06|07|08|47|71|75|76|77|78)\)\s?\d{3}-\d{2}-\d{2}$/).required().messages({
        'string.pattern.base': 'Введите номер в формате +7 (7xx) xxx-xx-xx'
    }),
    city: Joi.string().required(),
    address: Joi.string().required(),
    password: Joi.string().min(8).required().messages({
        'string.min': 'Пароль должен быть не менее 8 символов'
    })
});

// Валидация заказа
export const orderSchema = Joi.object({
    customer: Joi.object({
        customerName: Joi.string().min(2).required(),
        phone: Joi.string().pattern(/^\+7\s?\(7(00|01|02|05|06|07|08|47|71|75|76|77|78)\)\s?\d{3}-\d{2}-\d{2}$/).required(),
        email: Joi.string().email().required(),
        city: Joi.string().required(),
        address: Joi.string().required(),
        comment: Joi.string().allow('', null)
    }).required(),
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
            qty: Joi.number().min(1).required()
        })
    ).min(1).required(),
    checkout: Joi.object({
        deliveryMethod: Joi.string().valid('express', 'standard', 'pickup').required(),
        paymentMethod: Joi.string().valid('card', 'kaspi_qr', 'kaspi_red', 'installments').required()
    }).required(),
    payment: Joi.object({
        intentId: Joi.string().min(10).max(80),
        paymentMethodId: Joi.number().integer().positive(),
        cardNumber: Joi.string().min(12).max(23),
        expMonth: Joi.number().integer().min(1).max(12),
        expYear: Joi.number().integer().min(2024).max(2100),
        cvc: Joi.string().min(3).max(4),
        holderName: Joi.string().max(120).allow('', null),
        saveCard: Joi.boolean()
    }).optional()
});

export const customOrderSchema = Joi.object({
    customerName: Joi.string().min(2).max(120).required(),
    phone: Joi.string().pattern(/^\+7\s?\(7(00|01|02|05|06|07|08|47|71|75|76|77|78)\)\s?\d{3}-\d{2}-\d{2}$/).required(),
    email: Joi.string().email().allow('', null),
    city: Joi.string().min(2).max(80).required(),
    stringCount: Joi.string().valid('2', '3').required(),
    handedness: Joi.string().valid('right', 'left').required(),
    scaleLength: Joi.string().valid('standard', 'short', 'long').required(),
    woodType: Joi.string().min(2).max(80).required(),
    bodyStyle: Joi.string().min(2).max(80).required(),
    decoration: Joi.string().min(2).max(80).required(),
    finish: Joi.string().min(2).max(80).required(),
    caseIncluded: Joi.string().valid('yes', 'no').required(),
    deadline: Joi.string().valid('no_rush', '1m', '2m', '3m').required(),
    budget: Joi.number().integer().min(50000).max(5000000).required(),
    notes: Joi.string().max(2000).allow('', null),
    contactMethod: Joi.string().valid('phone', 'whatsapp', 'email').required()
});
