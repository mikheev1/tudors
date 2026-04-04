import type { ManagerBooking, Venue } from "@/lib/types";

export const venues: Venue[] = [
  {
    id: "registan-hall",
    companyId: "city-table",
    ownerManagerId: "mgr-city-1",
    name: "Registan Event Hall",
    vertical: "event-space",
    type: "Свадебный зал",
    city: "Ташкент",
    capacity: 450,
    price: "$2 800 / день",
    summary:
      "Премиальная площадка для свадеб и больших торжеств с полноценной сценой и welcome-зоной.",
    amenities: ["Сцена", "LED экран", "Парковка", "Кухня", "VIP-комната"],
    availability: "limited",
    timeTags: ["вечер", "сегодня", "выходные"],
    averageBookingLead: "2-4 недели",
    bookingSlots: ["10:00", "13:00", "16:00", "19:00", "22:00"],
    preview:
      "linear-gradient(135deg, rgba(61,32,16,0.35), rgba(204,141,84,0.18)), url('/assets/registan-lobby.svg')",
    scenes: [
      {
        id: "lobby",
        title: "Лобби",
        description: "Входная группа и welcome-зона для гостей.",
        image: "url('/assets/registan-lobby.svg')",
        panoramaUrl: "https://pannellum.org/images/alma.jpg",
        previewUrl: "/assets/registan-lobby.svg",
        initialPitch: 2.3,
        initialYaw: -135.4,
        initialHfov: 110,
        floorPlanLabel: "Вход / ресепшен",
        hotspots: [
          {
            id: "lobby-main",
            label: "Главный зал",
            kind: "scene",
            target: "main-hall",
            pitch: -3,
            yaw: 125,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "lobby-stage",
            label: "Сцена",
            kind: "scene",
            target: "stage",
            pitch: -7,
            yaw: 164,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "lobby-welcome-zone",
            label: "Welcome desk",
            kind: "zone",
            pitch: -8,
            yaw: -42,
            heading: "Welcome зона",
            status: "available",
            capacity: "До 40 гостей одновременно",
            deposit: "$250",
            minSpend: "$600",
            conditions: [
              "Подходит для регистрации гостей и фотозоны.",
              "Можно брендировать стойку и задник.",
              "Ранний доступ за 2 часа до события."
            ]
          }
        ]
      },
      {
        id: "main-hall",
        title: "Главный зал",
        description: "Основная посадка гостей и вид на центральную композицию.",
        image: "url('/assets/registan-main.svg')",
        panoramaUrl: "https://pannellum.org/images/bma-0.jpg",
        previewUrl: "/assets/registan-main.svg",
        initialPitch: -1.5,
        initialYaw: 8,
        initialHfov: 100,
        floorPlanLabel: "Основная посадка",
        hotspots: [
          {
            id: "hall-lobby",
            label: "Лобби",
            kind: "scene",
            target: "lobby",
            pitch: -1,
            yaw: 38,
            targetPitch: 2,
            targetYaw: -40
          },
          {
            id: "hall-stage",
            label: "Сцена",
            kind: "scene",
            target: "stage",
            pitch: -7,
            yaw: -150,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "hall-table-a1",
            label: "Стол A1",
            kind: "table",
            pitch: -18,
            yaw: -18,
            heading: "VIP стол A1",
            status: "available",
            capacity: "8-10 гостей",
            deposit: "$180",
            minSpend: "$900",
            conditions: [
              "Прямой вид на сцену и молодоженов.",
              "Персональное обслуживание официантом.",
              "Премиальная сервировка включена."
            ]
          },
          {
            id: "hall-table-b3",
            label: "Стол B3",
            kind: "table",
            pitch: -20,
            yaw: 9,
            heading: "Семейный стол B3",
            status: "limited",
            capacity: "6-8 гостей",
            deposit: "$120",
            minSpend: "$650",
            conditions: [
              "Остался один слот на ближайшие выходные.",
              "Предоплата 30% удерживает слот.",
              "Можно объединить с соседним столом."
            ]
          },
          {
            id: "hall-table-c2",
            label: "Стол C2",
            kind: "table",
            pitch: -17,
            yaw: 36,
            heading: "Панорамный стол C2",
            status: "waitlist",
            capacity: "10-12 гостей",
            deposit: "$200",
            minSpend: "$1 050",
            conditions: [
              "На популярные даты идет лист ожидания.",
              "При отмене подтверждение уходит первому в очереди.",
              "Можно оставить 2 резервные даты."
            ]
          }
        ]
      },
      {
        id: "stage",
        title: "Сцена",
        description: "Ракурс с акцентом на LED-экран и шоу-зону.",
        image: "url('/assets/registan-stage.svg')",
        panoramaUrl: "https://pannellum.org/images/bma-1.jpg",
        previewUrl: "/assets/registan-stage.svg",
        initialPitch: -2,
        initialYaw: 150,
        initialHfov: 105,
        floorPlanLabel: "Сцена / шоу-зона",
        hotspots: [
          {
            id: "stage-main-hall",
            label: "Главный зал",
            kind: "scene",
            target: "main-hall",
            pitch: -3,
            yaw: 32,
            targetPitch: -4,
            targetYaw: 25
          },
          {
            id: "stage-performance-zone",
            label: "Сцена Premium",
            kind: "zone",
            pitch: -10,
            yaw: 164,
            heading: "Сценический пакет Premium",
            status: "available",
            capacity: "До 12 артистов",
            deposit: "$400",
            minSpend: "$1 500",
            conditions: [
              "Включены LED-экран и базовый звук.",
              "Дополнительный свет рассчитывается отдельно.",
              "Монтаж возможен за день до мероприятия."
            ]
          }
        ]
      }
    ]
  },
  {
    id: "azure-lounge",
    companyId: "city-table",
    ownerManagerId: "mgr-city-2",
    name: "Azure Lounge",
    vertical: "restaurant",
    type: "Ресторан / lounge",
    city: "Ташкент",
    capacity: 120,
    price: "$65 / средний чек",
    summary: "Городской ресторан с 360-рассадкой, приватными столами и вечерними слотами.",
    amenities: ["Бар", "DJ", "Терраса", "Valet", "VIP кабинка"],
    availability: "available",
    timeTags: ["вечер", "ужин", "сегодня"],
    averageBookingLead: "1-2 дня",
    bookingSlots: ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"],
    preview:
      "linear-gradient(135deg, rgba(15,31,48,0.48), rgba(91,144,188,0.16)), url('/assets/silk-forum.svg')",
    scenes: [
      {
        id: "azure-main",
        title: "Главный зал",
        description: "Основная посадка и view на бар и сцену.",
        image: "url('/assets/silk-forum.svg')",
        panoramaUrl: "https://pannellum.org/images/from-tree.jpg",
        previewUrl: "/assets/silk-forum.svg",
        initialPitch: -1,
        initialYaw: 42,
        initialHfov: 105,
        floorPlanLabel: "Main dining",
        hotspots: [
          {
            id: "azure-bar",
            label: "Бар",
            kind: "scene",
            target: "azure-bar-scene",
            pitch: -2,
            yaw: 128,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "azure-table-7",
            label: "Стол 7",
            kind: "table",
            pitch: -16,
            yaw: 12,
            heading: "Table 7 near stage",
            status: "available",
            capacity: "2-4 гостя",
            deposit: "$40",
            minSpend: "$140",
            conditions: ["Лучший обзор сцены.", "Слот 2 часа.", "Подходит для birthday setup."]
          },
          {
            id: "azure-table-11",
            label: "Стол 11",
            kind: "table",
            pitch: -17,
            yaw: -28,
            heading: "Private table 11",
            status: "limited",
            capacity: "4-6 гостей",
            deposit: "$55",
            minSpend: "$220",
            conditions: ["Осталось два вечерних слота.", "Требуется hold на 30 минут."]
          }
        ]
      },
      {
        id: "azure-bar-scene",
        title: "Бар",
        description: "Барная линия и lounge seating.",
        image: "url('/assets/silk-foyer.svg')",
        panoramaUrl: "https://pannellum.org/images/alma-correlator-facility.jpg",
        previewUrl: "/assets/silk-foyer.svg",
        initialPitch: 0,
        initialYaw: -70,
        initialHfov: 108,
        floorPlanLabel: "Bar zone",
        hotspots: [
          {
            id: "azure-return-main",
            label: "Главный зал",
            kind: "scene",
            target: "azure-main",
            pitch: -1,
            yaw: 22,
            targetPitch: -1,
            targetYaw: 42
          },
          {
            id: "azure-bar-counter",
            label: "Барная стойка",
            kind: "zone",
            pitch: -13,
            yaw: -6,
            heading: "Counter reservation",
            status: "waitlist",
            capacity: "2 гостя",
            deposit: "$25",
            minSpend: "$100",
            conditions: ["Популярный слот после 20:00.", "При освобождении уведомление уходит сразу."]
          }
        ]
      }
    ]
  },
  {
    id: "silk-congress",
    companyId: "space-hub",
    ownerManagerId: "mgr-space-1",
    name: "Silk Congress Center",
    vertical: "event-space",
    type: "Конференц-зал",
    city: "Самарканд",
    capacity: 700,
    price: "$4 100 / день",
    summary: "Пространство для форумов, презентаций и корпоративных мероприятий.",
    amenities: ["Фойе", "Свет", "Синхронный перевод", "Кейтеринг", "Потоковая съемка"],
    availability: "available",
    timeTags: ["утро", "день", "будни"],
    averageBookingLead: "5-10 дней",
    bookingSlots: ["09:00", "12:00", "15:00", "18:00"],
    preview:
      "linear-gradient(135deg, rgba(10,37,49,0.38), rgba(95,153,162,0.14)), url('/assets/silk-forum.svg')",
    scenes: [
      {
        id: "foyer",
        title: "Фойе",
        description: "Зона регистрации, кофе-брейка и networking.",
        image: "url('/assets/silk-foyer.svg')",
        panoramaUrl: "https://pannellum.org/images/from-tree.jpg",
        previewUrl: "/assets/silk-foyer.svg",
        initialPitch: -2,
        initialYaw: 115,
        initialHfov: 110,
        floorPlanLabel: "Регистрация / кофе-брейк",
        hotspots: [
          {
            id: "foyer-auditorium",
            label: "Амфитеатр",
            kind: "scene",
            target: "auditorium",
            pitch: -2,
            yaw: 133,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "foyer-registration",
            label: "Стойка регистрации",
            kind: "zone",
            pitch: -12,
            yaw: -46,
            heading: "Регистрационный модуль",
            status: "available",
            capacity: "3 стойки / 600 гостей в час",
            deposit: "$150",
            minSpend: "$500",
            conditions: [
              "Подходит для B2B-мероприятий и форумов.",
              "Есть возможность брендирования.",
              "Можно добавить QR check-in."
            ]
          }
        ]
      },
      {
        id: "auditorium",
        title: "Амфитеатр",
        description: "Главный зал для выступлений, презентаций и панельных дискуссий.",
        image: "url('/assets/silk-forum.svg')",
        panoramaUrl: "https://pannellum.org/images/alma-correlator-facility.jpg",
        previewUrl: "/assets/silk-forum.svg",
        initialPitch: 0,
        initialYaw: 12,
        initialHfov: 105,
        floorPlanLabel: "Основной форум-холл",
        hotspots: [
          {
            id: "auditorium-foyer",
            label: "Фойе",
            kind: "scene",
            target: "foyer",
            pitch: -4,
            yaw: 48,
            targetPitch: -1,
            targetYaw: 110
          },
          {
            id: "auditorium-control",
            label: "Сцена",
            kind: "scene",
            target: "control",
            pitch: -3,
            yaw: -146,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "auditorium-front-row",
            label: "Front Row",
            kind: "zone",
            pitch: -17,
            yaw: 4,
            heading: "Пакет Front Row",
            status: "limited",
            capacity: "20 VIP мест",
            deposit: "$600",
            minSpend: "$2 400",
            conditions: [
              "Используется для форума, пресс-зоны или спонсоров.",
              "Включает выделенный вход и branding spots."
            ]
          }
        ]
      },
      {
        id: "control",
        title: "Техническая позиция",
        description: "Обзор на сцену, проекторы, пульт и свет.",
        image: "url('/assets/silk-control.svg')",
        panoramaUrl: "https://pannellum.org/images/tocopilla.jpg",
        previewUrl: "/assets/silk-control.svg",
        initialPitch: 1,
        initialYaw: -90,
        initialHfov: 108,
        floorPlanLabel: "Техконтроль",
        hotspots: [
          {
            id: "control-auditorium",
            label: "Амфитеатр",
            kind: "scene",
            target: "auditorium",
            pitch: -5,
            yaw: 34,
            targetPitch: -2,
            targetYaw: 12
          }
        ]
      }
    ]
  },
  {
    id: "skyline-residence",
    companyId: "prime-stay",
    ownerManagerId: "mgr-stay-1",
    name: "Skyline Residence 27",
    vertical: "apartment",
    type: "Аренда квартиры",
    city: "Ташкент",
    capacity: 6,
    price: "$180 / ночь",
    summary: "Дизайнерская квартира для short stay с self check-in и обзором по комнатам в 360.",
    amenities: ["2 спальни", "Self check-in", "Кухня", "Wi-Fi", "Вид на город"],
    availability: "available",
    timeTags: ["сегодня", "ночь", "weekend"],
    averageBookingLead: "в день обращения",
    bookingSlots: ["10:00", "13:00", "16:00", "19:00", "22:00"],
    preview:
      "linear-gradient(135deg, rgba(24,24,31,0.45), rgba(139,152,181,0.16)), url('/assets/bukhara-terrace.svg')",
    scenes: [
      {
        id: "apt-living",
        title: "Гостиная",
        description: "Основная зона с диваном, кухней и панорамными окнами.",
        image: "url('/assets/bukhara-terrace.svg')",
        panoramaUrl: "https://pannellum.org/images/alma.jpg",
        previewUrl: "/assets/bukhara-terrace.svg",
        initialPitch: 0,
        initialYaw: 52,
        initialHfov: 108,
        floorPlanLabel: "Living room",
        hotspots: [
          {
            id: "apt-bedroom",
            label: "Спальня",
            kind: "scene",
            target: "apt-bedroom-scene",
            pitch: -2,
            yaw: 124,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "apt-book-whole",
            label: "Апартамент целиком",
            kind: "zone",
            pitch: -15,
            yaw: -8,
            heading: "Full apartment stay",
            status: "available",
            capacity: "До 6 гостей",
            deposit: "$50",
            minSpend: "$180 / ночь",
            conditions: ["Self check-in доступен.", "Минимум 1 ночь.", "Late checkout по запросу."]
          }
        ]
      },
      {
        id: "apt-bedroom-scene",
        title: "Master bedroom",
        description: "Главная спальня и storage-зона.",
        image: "url('/assets/bukhara-photozone.svg')",
        panoramaUrl: "https://pannellum.org/images/alma-correlator-facility.jpg",
        previewUrl: "/assets/bukhara-photozone.svg",
        initialPitch: -1,
        initialYaw: 18,
        initialHfov: 104,
        floorPlanLabel: "Bedroom",
        hotspots: [
          {
            id: "apt-return-living",
            label: "Гостиная",
            kind: "scene",
            target: "apt-living",
            pitch: -3,
            yaw: -118,
            targetPitch: 0,
            targetYaw: 52
          }
        ]
      }
    ]
  },
  {
    id: "bukhara-courtyard",
    companyId: "city-table",
    ownerManagerId: "mgr-city-2",
    name: "Bukhara Courtyard",
    vertical: "villa",
    type: "Бутик-локация",
    city: "Бухара",
    capacity: 160,
    price: "$1 900 / день",
    summary: "Атмосферное место для камерных свадеб, ужинов и фотосессий во внутреннем дворе.",
    amenities: ["Двор", "Терраса", "Декор", "Фотозона", "Гостевые номера"],
    availability: "busy",
    timeTags: ["вечер", "закат", "суббота"],
    averageBookingLead: "3-5 недель",
    bookingSlots: ["11:00", "14:00", "17:00", "20:00"],
    preview:
      "linear-gradient(135deg, rgba(78,44,18,0.42), rgba(191,146,102,0.16)), url('/assets/bukhara-yard.svg')",
    scenes: [
      {
        id: "yard",
        title: "Внутренний двор",
        description: "Главное пространство с посадкой под открытым небом.",
        image: "url('/assets/bukhara-yard.svg')",
        panoramaUrl: "https://pannellum.org/images/alma.jpg",
        previewUrl: "/assets/bukhara-yard.svg",
        initialPitch: -1,
        initialYaw: 82,
        initialHfov: 110,
        floorPlanLabel: "Центральный двор",
        hotspots: [
          {
            id: "yard-terrace",
            label: "Терраса",
            kind: "scene",
            target: "terrace",
            pitch: -3,
            yaw: 152,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "yard-photozone",
            label: "Фотозона",
            kind: "scene",
            target: "photozone",
            pitch: -5,
            yaw: -84,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "yard-table-sunset",
            label: "Sunset table",
            kind: "table",
            pitch: -19,
            yaw: 12,
            heading: "Sunset Table",
            status: "available",
            capacity: "4-6 гостей",
            deposit: "$90",
            minSpend: "$320",
            conditions: [
              "Лучший ракурс на закат и внутренний двор.",
              "Подходит для ужина и фотосессии.",
              "Доступно бронирование на 2 часа."
            ]
          }
        ]
      },
      {
        id: "terrace",
        title: "Терраса",
        description: "Уютная зона для гостей с видом на весь двор.",
        image: "url('/assets/bukhara-terrace.svg')",
        panoramaUrl: "https://pannellum.org/images/alma.jpg",
        previewUrl: "/assets/bukhara-terrace.svg",
        initialPitch: -4,
        initialYaw: 36,
        initialHfov: 108,
        floorPlanLabel: "Терраса",
        hotspots: [
          {
            id: "terrace-yard",
            label: "Двор",
            kind: "scene",
            target: "yard",
            pitch: -3,
            yaw: -128,
            targetPitch: -2,
            targetYaw: 92
          }
        ]
      },
      {
        id: "photozone",
        title: "Фотозона",
        description: "Место для выездной регистрации и вечерней подсветки.",
        image: "url('/assets/bukhara-photozone.svg')",
        panoramaUrl: "https://pannellum.org/images/alma-correlator-facility.jpg",
        previewUrl: "/assets/bukhara-photozone.svg",
        initialPitch: 0,
        initialYaw: -42,
        initialHfov: 108,
        floorPlanLabel: "Фотозона",
        hotspots: [
          {
            id: "photozone-yard",
            label: "Двор",
            kind: "scene",
            target: "yard",
            pitch: -2,
            yaw: 118,
            targetPitch: -1,
            targetYaw: 78
          },
          {
            id: "photozone-ceremony",
            label: "Ceremony spot",
            kind: "zone",
            pitch: -15,
            yaw: -4,
            heading: "Ceremony Spot",
            status: "waitlist",
            capacity: "До 30 гостей standing",
            deposit: "$130",
            minSpend: "$480",
            conditions: [
              "Популярен под выездную регистрацию.",
              "Вечерняя подсветка включена в пакет.",
              "По субботам доступен только лист ожидания."
            ]
          }
        ]
      }
    ]
  },
  {
    id: "district-office",
    companyId: "space-hub",
    ownerManagerId: "mgr-space-1",
    name: "District Office Loft",
    vertical: "office",
    type: "Коммерческое помещение",
    city: "Ташкент",
    capacity: 40,
    price: "$1 200 / месяц",
    summary: "Готовое офисное помещение с open-space, переговорной и быстрым просмотром по 360.",
    amenities: ["Open-space", "Meeting room", "Кухня", "Паркинг", "24/7 access"],
    availability: "limited",
    timeTags: ["будни", "день", "сегодня"],
    averageBookingLead: "3-7 дней",
    bookingSlots: ["09:00", "11:00", "13:00", "15:00", "17:00"],
    preview:
      "linear-gradient(135deg, rgba(33,35,41,0.45), rgba(121,129,143,0.16)), url('/assets/registan-main.svg')",
    scenes: [
      {
        id: "office-open-space",
        title: "Open space",
        description: "Основная рабочая зона для команды и гостей.",
        image: "url('/assets/registan-main.svg')",
        panoramaUrl: "https://pannellum.org/images/bma-0.jpg",
        previewUrl: "/assets/registan-main.svg",
        initialPitch: -1,
        initialYaw: 14,
        initialHfov: 102,
        floorPlanLabel: "Open-space",
        hotspots: [
          {
            id: "office-meeting",
            label: "Meeting room",
            kind: "scene",
            target: "office-meeting-room",
            pitch: -2,
            yaw: 142,
            targetPitch: "same",
            targetYaw: "same"
          },
          {
            id: "office-rent",
            label: "Аренда блока",
            kind: "zone",
            pitch: -16,
            yaw: 18,
            heading: "Open-space lease",
            status: "limited",
            capacity: "24 рабочих места",
            deposit: "$600",
            minSpend: "$1 200 / месяц",
            conditions: ["Договор от 3 месяцев.", "Мебель включена.", "Интернет и сервисный сбор отдельно."]
          }
        ]
      },
      {
        id: "office-meeting-room",
        title: "Meeting room",
        description: "Переговорная и small team zone.",
        image: "url('/assets/registan-stage.svg')",
        panoramaUrl: "https://pannellum.org/images/bma-1.jpg",
        previewUrl: "/assets/registan-stage.svg",
        initialPitch: 0,
        initialYaw: -36,
        initialHfov: 104,
        floorPlanLabel: "Meeting room",
        hotspots: [
          {
            id: "office-return-open",
            label: "Open space",
            kind: "scene",
            target: "office-open-space",
            pitch: -3,
            yaw: -126,
            targetPitch: -1,
            targetYaw: 14
          }
        ]
      }
    ]
  }
];

export const managerBookings: ManagerBooking[] = [
  {
    id: "REQ-1048",
    companyId: "city-table",
    customerName: "Aziza M.",
    phone: "+998 90 701 44 22",
    venueName: "Azure Lounge",
    vertical: "restaurant",
    placeLabel: "Table 7 near stage",
    dateLabel: "24 марта, 20:00",
    guestsLabel: "4 гостя",
    amountLabel: "$140 min spend",
    sourceLabel: "360 booking",
    managerNote: "Клиент просил birthday setup и быстрый callback.",
    status: "new",
    archived: false
  },
  {
    id: "REQ-1042",
    companyId: "prime-stay",
    customerName: "Bekzod A.",
    phone: "+998 90 514 00 10",
    venueName: "Skyline Residence 27",
    vertical: "apartment",
    placeLabel: "Full apartment stay",
    dateLabel: "25 марта, 15:00 check-in",
    guestsLabel: "2 гостя",
    amountLabel: "$180 / ночь",
    sourceLabel: "Direct site",
    managerNote: "Готов подтвердить сразу при наличии.",
    status: "hold_pending",
    archived: false
  },
  {
    id: "REQ-1039",
    companyId: "city-table",
    customerName: "Madina K.",
    phone: "+998 91 220 11 06",
    venueName: "Registan Event Hall",
    vertical: "event-space",
    placeLabel: "VIP стол A1",
    dateLabel: "29 марта, 18:30",
    guestsLabel: "10 гостей",
    amountLabel: "$900 min spend",
    sourceLabel: "Manager hold",
    managerNote: "Ожидает финальное подтверждение и счет.",
    status: "confirmed",
    archived: false
  },
  {
    id: "REQ-1032",
    companyId: "city-table",
    customerName: "Javlon T.",
    phone: "+998 93 100 88 44",
    venueName: "Bukhara Courtyard",
    vertical: "villa",
    placeLabel: "Ceremony Spot",
    dateLabel: "5 апреля, 19:00",
    guestsLabel: "26 гостей",
    amountLabel: "$480 package",
    sourceLabel: "Waitlist",
    managerNote: "Нужен пуш при освобождении субботнего слота.",
    status: "waitlist",
    archived: false
  },
  {
    id: "REQ-1027",
    companyId: "space-hub",
    customerName: "Iroda S.",
    phone: "+998 90 700 50 50",
    venueName: "District Office Loft",
    vertical: "office",
    placeLabel: "Open-space lease",
    dateLabel: "С 1 апреля",
    guestsLabel: "24 рабочих места",
    amountLabel: "$1 200 / месяц",
    sourceLabel: "Sales lead",
    managerNote: "Просили договор и планировку.",
    status: "declined",
    archived: false
  }
];

export function getVenueTypes(): string[] {
  return [...new Set(venues.map((venue) => venue.type))];
}

export function getVenueVerticals() {
  return [...new Set(venues.map((venue) => venue.vertical))];
}

export function getVenueById(venueId: string): Venue | undefined {
  return venues.find((venue) => venue.id === venueId);
}
