## Инструкция Aspap.kz 

## 1) На новом ноутбуке: подготовка
1) Установи **Node.js LTS** (важно):
- Скачай Node **22 LTS** или **20 LTS** с nodejs.org
- Установи как обычную программу

2) Установи **VS Code**.

## 2) На новом ноутбуке: открыть проект
1) Распакуй проект в папку, например:
- `Desktop/Aspap.kz`

2) Открой VS Code → **Open Folder…** → выбери папку `Aspap.kz`.


## 3) На новом ноутбуке: проверить версию Node
В VS Code открой **Terminal** и введи:

```bash
node -v
npm -v
```

- Если показывает `v20...` или `v22...` — всё ок
- Если показывает `v25...` (или другая “не LTS”) — удали Node и поставь LTS


## 4) Установка зависимостей (самое главное)
В терминале VS Code (путь должен быть внутри папки проекта) выполни:

```bash
npm install
```

Дождись окончания без ошибок.


## 5) Запуск проекта
Запуск в режиме разработки:

```bash
npm run dev
```

Должно появиться:
- `Server is running on http://localhost:8080`

Открой в браузере:
- http://localhost:8080


## 6) Если нужно “с нуля” заполнить базу демо-товарами
(делай только если нужно, иначе пропусти)

```bash
npm run db:seed
npm run dev
```

## 7) Вход в админку
- Вход: http://localhost:8080/login
- Логин: `admin@aspap.kz`
- Пароль: `admin12345`
- Админка: http://localhost:8080/admin

### Windows / Mac (универсально)
Останови сервер (Ctrl+C), затем:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Только Mac (если попросит инструменты сборки)
```bash
xcode-select --install
npm rebuild better-sqlite3 --build-from-source
npm run dev
