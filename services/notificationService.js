// Сервис уведомлений (Senior level abstraction)
export const NotificationService = {
    async sendEmail(to, subject, text) {
        // В реальном проекте здесь будет nodemailer или SendGrid
        console.log(`[Email Service] To: ${to}, Subject: ${subject}`);
        console.log(`[Email Content]: ${text}`);
        return true;
    },

    async notifyNewOrder(order) {
        const text = `Новый заказ DH-${String(order.id).padStart(4, '0')} на сумму ${order.total} ₸. Клиент: ${order.customer_name}`;
        await this.sendEmail(process.env.ADMIN_EMAIL || 'admin@aspap.kz', 'Новый заказ', text);
    },

    async notifyStatusUpdate(order, status) {
        const text = `Статус вашего заказа DH-${String(order.id).padStart(4, '0')} изменен на: ${status}`;
        await this.sendEmail(order.email, 'Обновление заказа', text);
    }
};

// Сервис платежей
export const PaymentService = {
    async createPaymentLink(orderId, amount) {
        // Имитация интеграции с платежным шлюзом (Kaspi/Stripe)
        console.log(`[Payment Service] Creating link for Order ${orderId}, Amount: ${amount}`);
        return `https://payment-gateway.com/pay?order=${orderId}&amount=${amount}`;
    }
};
