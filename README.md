# Tudors Studio

Сервис поиска и бронирования объектов с 360-туром. Сейчас проект разделен на `frontend (Next.js)` и `backend (Express)`, при этом Prisma и PostgreSQL остаются общей базой данных.

## Что уже есть

- `Next.js` frontend в `app/`.
- Отдельный backend-сервис в `backend/`.
- Переиспользуемые React-компоненты для тура и формы бронирования.
- Настоящий `Pannellum`-viewer для equirectangular 360 панорам.
- Публичный API через backend:
  - `GET /api/venues`
  - `POST /api/booking-requests`
  - `POST /api/waitlist`
- Общие типы и демо-данные в `lib/`.
- Prisma-схема в `prisma/schema.prisma`.
- Публичные ассеты для демо в `public/assets/`.
- Подробные документы по архитектуре и съемке.

## Структура

```text
app/
  globals.css
  layout.tsx
  page.tsx
backend/
  src/
components/
  booking-form.tsx
  tour-explorer.tsx
lib/
  data.ts
  prisma.ts
  types.ts
  validation.ts
prisma/
  schema.prisma
public/
  assets/
```

## Как запустить

### 1. Установи зависимости

```bash
npm install
cd backend && npm install
```

### 2. Подготовь env

Frontend читает `.env.local`, Prisma использует `.env`, backend может читать как корневые env, так и `backend/.env`.

```bash
cp .env.example .env
cp .env.example .env.local
cp backend/.env.example backend/.env
```

Проверь, что в корне и в backend стоят наши текущие значения:

```env
DATABASE_URL="postgresql://firdavs_usmanov@localhost:5432/tudors_booking?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000"
API_BASE_URL="http://localhost:4000"
BACKEND_PORT="4000"
FRONTEND_ORIGIN="http://localhost:3000"
ADMIN_AUTH_SECRET="local-demo-secret"
```

### 3. Если уже есть PostgreSQL, подготовь Prisma

```bash
npm run db:generate
npm run db:push
```

### 4. Запусти frontend и backend отдельно

Терминал 1:

```bash
npm run dev:frontend
```

Терминал 2:

```bash
npm run dev:backend
```

После этого:

- frontend: `http://localhost:3000`
- backend: `http://localhost:4000`
- health-check backend: `http://localhost:4000/health`

## Что готово для следующего шага

- Вынести демо-данные из `lib/data.ts` в Prisma и API.
- Подключить реальное сохранение заявок через `prisma.bookingRequest.create`.
- Добавить сущности доступности и слотов бронирования.
- Подменить demo panorama URLs на свои реальные 360-фото.
- Перейти с single equirectangular на multires tiles для больших туров.
- Подключить object storage и CDN для реальных 360-панорам.

## Базовые процессы, которые уже стоит закладывать

- `submitted -> hold_pending -> confirmed / expired` для обычной брони.
- `waitlist_joined -> promoted -> confirmed` для занятых столов и зон.
- Hold слота на 30 минут после заявки, чтобы менеджер или клиент успел подтвердить бронь.
- SLA первого ответа до 10 минут для горячих заявок.
- Уведомления по очереди ожидания и по изменению статуса заявки.
- Следующий production-шаг: писать эти статусы в БД, а не только возвращать через API.

## Как заменить примеры на реальные 360-файлы

Сейчас в `lib/data.ts` сцены уже описываются в формате, подходящем для реального 360-viewer:

- `panoramaUrl`
- `initialPitch`
- `initialYaw`
- `initialHfov`
- `hotspots[].pitch`
- `hotspots[].yaw`

Чтобы добавить настоящий объект:

1. Загрузи equirectangular pano в storage или `public/`.
2. Замени `panoramaUrl` у сцены.
3. Включи временно `hotSpotDebug` в viewer, чтобы снять координаты.
4. Заполни `pitch / yaw` для переходов и столов.
5. Если панорама тяжелая, переходи на multires.

## Ближайший production roadmap

### Этап 2.1

- Реальная запись заявок в БД.
- Админка для заявок.
- SEO-страницы площадок.
- Детальная страница объекта.

### Этап 2.2

- Календарь доступности.
- Цены по датам и слотам.
- Telegram/SMS/Email уведомления.
- Предоплата.

### Этап 2.3

- Кабинеты партнера и менеджера.
- Загрузка туров из админки.
- Версионирование сцен и хотспотов.
- Медиа-пайплайн с очередями.

## Документы

- Архитектура и масштабирование: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Инструкция по съемке: [PHOTOGRAPHY_GUIDE.md](./PHOTOGRAPHY_GUIDE.md)

## Важно

Старые файлы `index.html`, `styles.css` и `app.js` оставлены как reference MVP, но основной путь теперь через `Next.js`.
