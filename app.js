const venues = [
  {
    id: "registan-hall",
    name: "Registan Event Hall",
    type: "Свадебный зал",
    city: "Ташкент",
    capacity: 450,
    price: "$2 800 / день",
    summary:
      "Премиальная площадка для свадеб и больших торжеств с полноценной сценой и отдельной welcome-зоной.",
    amenities: ["Сцена", "LED экран", "Парковка", "Кухня", "VIP-комната"],
    preview:
      "linear-gradient(135deg, rgba(61,32,16,0.35), rgba(204,141,84,0.18)), url('./assets/registan-lobby.svg')",
    scenes: [
      {
        id: "lobby",
        title: "Лобби",
        description: "Входная группа и welcome-зона для гостей.",
        image: "url('./assets/registan-lobby.svg')",
        hotspots: [
          { label: "Главный зал", target: "main-hall", x: 65, y: 53 },
          { label: "Сцена", target: "stage", x: 84, y: 48 }
        ]
      },
      {
        id: "main-hall",
        title: "Главный зал",
        description: "Основная посадка гостей и вид на центральную композицию.",
        image: "url('./assets/registan-main.svg')",
        hotspots: [
          { label: "Лобби", target: "lobby", x: 19, y: 54 },
          { label: "Сцена", target: "stage", x: 78, y: 46 }
        ]
      },
      {
        id: "stage",
        title: "Сцена",
        description: "Ракурс с акцентом на LED-экран, звук и зону ведущего.",
        image: "url('./assets/registan-stage.svg')",
        hotspots: [
          { label: "Главный зал", target: "main-hall", x: 22, y: 56 }
        ]
      }
    ]
  },
  {
    id: "silk-congress",
    name: "Silk Congress Center",
    type: "Конференц-зал",
    city: "Самарканд",
    capacity: 700,
    price: "$4 100 / день",
    summary:
      "Масштабное пространство для форумов, презентаций и корпоративных мероприятий с несколькими зонами входа.",
    amenities: ["Фойе", "Свет", "Синхронный перевод", "Кейтеринг", "Потоковая съемка"],
    preview:
      "linear-gradient(135deg, rgba(10,37,49,0.38), rgba(95,153,162,0.14)), url('./assets/silk-forum.svg')",
    scenes: [
      {
        id: "foyer",
        title: "Фойе",
        description: "Зона регистрации, кофе-брейка и networking.",
        image: "url('./assets/silk-foyer.svg')",
        hotspots: [
          { label: "Амфитеатр", target: "auditorium", x: 71, y: 50 }
        ]
      },
      {
        id: "auditorium",
        title: "Амфитеатр",
        description: "Главный зал для выступлений, презентаций и панельных дискуссий.",
        image: "url('./assets/silk-forum.svg')",
        hotspots: [
          { label: "Фойе", target: "foyer", x: 18, y: 56 },
          { label: "Сцена", target: "control", x: 80, y: 45 }
        ]
      },
      {
        id: "control",
        title: "Техническая позиция",
        description: "Обзор на сцену, проекторы, пульт и световое оборудование.",
        image: "url('./assets/silk-control.svg')",
        hotspots: [
          { label: "Амфитеатр", target: "auditorium", x: 30, y: 58 }
        ]
      }
    ]
  },
  {
    id: "bukhara-courtyard",
    name: "Bukhara Courtyard",
    type: "Бутик-локация",
    city: "Бухара",
    capacity: 160,
    price: "$1 900 / день",
    summary:
      "Атмосферное место для камерных свадеб, ужинов и фотосессий во внутреннем дворе.",
    amenities: ["Двор", "Терраса", "Декор", "Фотозона", "Гостиничные номера"],
    preview:
      "linear-gradient(135deg, rgba(78,44,18,0.42), rgba(191,146,102,0.16)), url('./assets/bukhara-yard.svg')",
    scenes: [
      {
        id: "yard",
        title: "Внутренний двор",
        description: "Главное пространство с посадкой под открытым небом.",
        image: "url('./assets/bukhara-yard.svg')",
        hotspots: [
          { label: "Терраса", target: "terrace", x: 76, y: 47 },
          { label: "Фотозона", target: "photozone", x: 28, y: 45 }
        ]
      },
      {
        id: "terrace",
        title: "Терраса",
        description: "Уютная зона для гостей с видом на весь двор.",
        image: "url('./assets/bukhara-terrace.svg')",
        hotspots: [{ label: "Двор", target: "yard", x: 22, y: 54 }]
      },
      {
        id: "photozone",
        title: "Фотозона",
        description: "Место для выездной регистрации и вечерней подсветки.",
        image: "url('./assets/bukhara-photozone.svg')",
        hotspots: [{ label: "Двор", target: "yard", x: 68, y: 53 }]
      }
    ]
  }
];

const state = {
  filter: "all",
  venueId: venues[0].id,
  sceneId: venues[0].scenes[0].id,
  dragStartX: null,
  backgroundOffset: 50
};

const venueGrid = document.querySelector("#venueGrid");
const venueFilter = document.querySelector("#venueFilter");
const bookingVenue = document.querySelector("#bookingVenue");
const panoramaFrame = document.querySelector("#panoramaFrame");
const panoramaTrack = document.querySelector("#panoramaTrack");
const hotspotLayer = document.querySelector("#hotspotLayer");
const sceneList = document.querySelector("#sceneList");
const tourTitle = document.querySelector("#tourTitle");
const sceneCounter = document.querySelector("#sceneCounter");
const venueName = document.querySelector("#venueName");
const venueSummary = document.querySelector("#venueSummary");
const venueFacts = document.querySelector("#venueFacts");
const sceneLabel = document.querySelector("#sceneLabel");
const prevSceneButton = document.querySelector("#prevSceneButton");
const nextSceneButton = document.querySelector("#nextSceneButton");
const formResult = document.querySelector("#formResult");
const bookingForm = document.querySelector("#bookingForm");

function getCurrentVenue() {
  return venues.find((venue) => venue.id === state.venueId);
}

function getCurrentScene() {
  const venue = getCurrentVenue();
  return venue.scenes.find((scene) => scene.id === state.sceneId);
}

function renderFilters() {
  const types = ["all", ...new Set(venues.map((venue) => venue.type))];
  venueFilter.innerHTML = types
    .map((type) => {
      const label = type === "all" ? "Все площадки" : type;
      return `<option value="${type}">${label}</option>`;
    })
    .join("");

  bookingVenue.innerHTML = venues
    .map((venue) => `<option value="${venue.name}">${venue.name}</option>`)
    .join("");
}

function renderVenueGrid() {
  const visibleVenues =
    state.filter === "all"
      ? venues
      : venues.filter((venue) => venue.type === state.filter);

  venueGrid.innerHTML = visibleVenues
    .map(
      (venue) => `
        <article class="venue-card ${venue.id === state.venueId ? "active" : ""}" data-venue-id="${venue.id}">
          <div class="venue-preview" style="background-image: ${venue.preview};"></div>
          <div class="venue-content">
            <div class="venue-meta">
              <span class="pill">${venue.type}</span>
              <span class="pill">${venue.city}</span>
            </div>
            <h3>${venue.name}</h3>
            <p>${venue.summary}</p>
            <div class="facts">
              <span class="fact">До ${venue.capacity} гостей</span>
              <span class="fact">${venue.price}</span>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderFacts(venue) {
  venueFacts.innerHTML = `
    <span class="fact">Вместимость: до ${venue.capacity}</span>
    <span class="fact">Стоимость: ${venue.price}</span>
    ${venue.amenities.map((item) => `<span class="fact">${item}</span>`).join("")}
  `;
}

function renderSceneList(venue) {
  sceneList.innerHTML = venue.scenes
    .map(
      (scene, index) => `
        <button class="scene-item ${scene.id === state.sceneId ? "active" : ""}" data-scene-id="${scene.id}" type="button">
          <strong>${index + 1}. ${scene.title}</strong>
          <span class="scene-meta">${scene.description}</span>
        </button>
      `
    )
    .join("");
}

function renderHotspots(scene) {
  hotspotLayer.innerHTML = scene.hotspots
    .map(
      (hotspot) => `
        <button class="hotspot" type="button" data-target-scene="${hotspot.target}" style="left:${hotspot.x}%; top:${hotspot.y}%;">
          <span class="hotspot-dot"></span>
          <span class="hotspot-label">${hotspot.label}</span>
        </button>
      `
    )
    .join("");
}

function renderTour() {
  const venue = getCurrentVenue();
  const scene = getCurrentScene();

  tourTitle.textContent = `${venue.name} / ${scene.title}`;
  sceneCounter.textContent = `${venue.scenes.findIndex((item) => item.id === scene.id) + 1} / ${venue.scenes.length}`;
  venueName.textContent = venue.name;
  venueSummary.textContent = venue.summary;
  sceneLabel.textContent = scene.description;
  panoramaTrack.style.backgroundImage = scene.image;
  panoramaTrack.style.backgroundPositionX = `${state.backgroundOffset}%`;

  renderFacts(venue);
  renderSceneList(venue);
  renderHotspots(scene);
  bookingVenue.value = venue.name;
}

function selectVenue(venueId) {
  const venue = venues.find((item) => item.id === venueId);
  state.venueId = venue.id;
  state.sceneId = venue.scenes[0].id;
  state.backgroundOffset = 50;
  renderVenueGrid();
  renderTour();
}

function selectScene(sceneId) {
  state.sceneId = sceneId;
  state.backgroundOffset = 50;
  renderTour();
}

function moveScene(direction) {
  const venue = getCurrentVenue();
  const currentIndex = venue.scenes.findIndex((scene) => scene.id === state.sceneId);
  const nextIndex = (currentIndex + direction + venue.scenes.length) % venue.scenes.length;
  selectScene(venue.scenes[nextIndex].id);
}

function handlePanStart(event) {
  state.dragStartX = event.clientX;
  panoramaFrame.classList.add("dragging");
}

function handlePanMove(event) {
  if (state.dragStartX === null) {
    return;
  }

  const delta = event.clientX - state.dragStartX;
  const nextOffset = Math.min(100, Math.max(0, state.backgroundOffset + delta * 0.08));
  panoramaTrack.style.backgroundPositionX = `${nextOffset}%`;
}

function handlePanEnd(event) {
  if (state.dragStartX === null) {
    return;
  }

  const delta = event.clientX - state.dragStartX;
  state.backgroundOffset = Math.min(100, Math.max(0, state.backgroundOffset + delta * 0.08));
  state.dragStartX = null;
  panoramaFrame.classList.remove("dragging");
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(bookingForm);
  const payload = Object.fromEntries(formData.entries());

  formResult.classList.add("success");
  formResult.innerHTML = `
    Заявка сохранена локально.<br />
    <strong>${payload.name}</strong>, площадка <strong>${payload.venue}</strong>,
    дата <strong>${payload.date}</strong>, гостей: <strong>${payload.guests}</strong>.<br />
    Следующий шаг для продакшна: отправка в API/CRM и блокировка слота в календаре.
  `;

  const history = JSON.parse(localStorage.getItem("tudors-booking-requests") || "[]");
  history.unshift({
    ...payload,
    createdAt: new Date().toISOString()
  });
  localStorage.setItem("tudors-booking-requests", JSON.stringify(history));
  bookingForm.reset();
  bookingVenue.value = getCurrentVenue().name;
}

venueFilter.addEventListener("change", (event) => {
  state.filter = event.target.value;
  renderVenueGrid();
});

venueGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-venue-id]");
  if (!card) {
    return;
  }

  selectVenue(card.dataset.venueId);
});

sceneList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scene-id]");
  if (!button) {
    return;
  }

  selectScene(button.dataset.sceneId);
});

hotspotLayer.addEventListener("click", (event) => {
  const hotspot = event.target.closest("[data-target-scene]");
  if (!hotspot) {
    return;
  }

  selectScene(hotspot.dataset.targetScene);
});

prevSceneButton.addEventListener("click", () => moveScene(-1));
nextSceneButton.addEventListener("click", () => moveScene(1));
bookingForm.addEventListener("submit", handleSubmit);

panoramaFrame.addEventListener("pointerdown", handlePanStart);
panoramaFrame.addEventListener("pointermove", handlePanMove);
panoramaFrame.addEventListener("pointerup", handlePanEnd);
panoramaFrame.addEventListener("pointerleave", handlePanEnd);

renderFilters();
renderVenueGrid();
renderTour();
