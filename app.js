// ==========================================================================
// FIREBASE 12.15.0
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch }
  from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const _fbApp = initializeApp({
  apiKey: "AIzaSyAxV7HqiF3IEDY5SnHgBBWLvbgc8xqJ3rg",
  authDomain: "trucklocate-2e5ee.firebaseapp.com",
  projectId: "trucklocate-2e5ee",
  storageBucket: "trucklocate-2e5ee.firebasestorage.app",
  messagingSenderId: "419821613849",
  appId: "1:419821613849:web:c13b6339e6c0ae284bcb88"
});
const _db = getFirestore(_fbApp);
const _col = collection(_db, "vendors");

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================

let vendors = [];
let currentUser = null;
let clientSearchCoords = { lat: 48.8566, lng: 2.3522 };
let clientDistanceMax = 10;
let selectedDay = "";
let searchHomeMarker = null;
let clientMarkersList = [];
let clientMap = null, modalMap = null, modalMarker = null, activeModalDay = null;

const DAYS_OF_WEEK = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function _cache() { localStorage.setItem("foodtruck_vendors", JSON.stringify(vendors)); }

async function initDatabase() {
  try {
    const snap = await getDocs(_col);
    if (snap.empty) {
      vendors = window.INITIAL_VENDORS || [];
      for (const v of vendors) await setDoc(doc(_db, "vendors", v.id), v);
    } else {
      vendors = snap.docs.map(d => {
        const v = d.data();
        v.schedule = migrateSchedule(v.schedule || {});
        return v;
      });
    }
    _cache();
    console.log("[FB] Chargé", vendors.length, "vendors");
  } catch(e) {
    console.warn("[FB] fallback local:", e);
    const s = localStorage.getItem("foodtruck_vendors");
    vendors = s ? JSON.parse(s) : (window.INITIAL_VENDORS || []);
  }
}

function listenVendors() {
  onSnapshot(_col, snap => {
    vendors = snap.docs.map(d => d.data());
    _cache();
    if (clientMap && document.getElementById("view-client")?.classList.contains("active")) renderClientResults();
    if (document.getElementById("view-admin")?.classList.contains("active")) renderAdminVendors();
  }, e => console.warn("[FB] snapshot:", e));
}

async function saveVendor(v) {
  try { await setDoc(doc(_db, "vendors", v.id), v); _cache(); }
  catch(e) { console.warn("[FB] saveVendor:", e); }
}

async function saveVendors() {
  try {
    const b = writeBatch(_db);
    vendors.forEach(v => b.set(doc(_db, "vendors", v.id), v));
    await b.commit(); _cache();
  } catch(e) { console.warn("[FB] saveVendors:", e); }
}

async function deleteVendorFromDB(id) {
  try { await deleteDoc(doc(_db, "vendors", id)); _cache(); }
  catch(e) { console.warn("[FB] delete:", e); }
}

// Get day name in French
function getCurrentFrenchDay() {
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const today = new Date().getDay();
  return days[today];
}

// Distance Calculation using Haversine Formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Custom Leaflet Icons using DivIcon (Emoji based, very modern & failsafe)
const getFoodtruckIcon = () => L.divIcon({
  html: `<div style="background-color: #f59e0b; border: 2px solid #fff; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.4); font-size: 18px; transition: transform 0.2s;">🚚</div>`,
  className: 'custom-truck-icon',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17]
});

const getHomeIcon = () => L.divIcon({
  html: `<div style="background-color: #ef4444; border: 2px solid #fff; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.4); font-size: 18px;">🏠</div>`,
  className: 'custom-home-icon',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17]
});

const getPinIcon = () => L.divIcon({
  html: `<div style="background-color: #10b981; border: 2px solid #fff; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4); font-size: 18px;">📍</div>`,
  className: 'custom-pin-icon',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

// Toast notification helper
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.className = `toast-notification ${type} active`;
  
  setTimeout(() => {
    toast.className = "toast-notification";
  }, 4000);
}

// ==========================================================================
// MAP INITIALIZATION
// ==========================================================================

function initClientMap() {
  if (clientMap) return;

  // Force la hauteur du conteneur — height:0 en CSS car flex ne propage pas
  const container = document.querySelector(".map-container");
  const main = document.querySelector("main");
  if (container && container.getBoundingClientRect().height === 0) {
    const h = main ? main.getBoundingClientRect().height : (window.innerHeight - 82);
    container.style.height = h + "px";
  }

  clientMap = L.map("leaflet-map", {
    zoomControl: false
  }).setView([clientSearchCoords.lat, clientSearchCoords.lng], 13);

  L.control.zoom({ position: 'bottomright' }).addTo(clientMap);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(clientMap);

  clientMap.on("click", (e) => {
    setClientSearchLocation(e.latlng.lat, e.latlng.lng, "Position sélectionnée sur la carte");
  });

  setTimeout(() => { if (clientMap) clientMap.invalidateSize(); }, 100);
}

function initModalMap() {
  if (modalMap) return;

  modalMap = L.map("modal-map").setView([46.2276, 2.2137], 6); // Centered on France

  // Standard OpenStreetMap theme for vendor positioning
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(modalMap);

  // Click to drop marker
  modalMap.on("click", (e) => {
    updateModalMarker(e.latlng.lat, e.latlng.lng);
  });
}

function updateModalMarker(lat, lng) {
  if (modalMarker) {
    modalMarker.setLatLng([lat, lng]);
  } else {
    modalMarker = L.marker([lat, lng], { icon: getPinIcon(), draggable: true }).addTo(modalMap);
    modalMarker.on("dragend", () => {
      const pos = modalMarker.getLatLng();
      reverseGeocodeModal(pos.lat, pos.lng);
    });
  }
  reverseGeocodeModal(lat, lng);
}

// Reverse Geocode for Modal Marker
async function reverseGeocodeModal(lat, lng) {
  document.getElementById("modal-lat").value = lat.toFixed(6);
  document.getElementById("modal-lng").value = lng.toFixed(6);
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    if (res.ok) {
      const data = await res.json();
      document.getElementById("modal-address").value = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      
      // Extract city from address details
      let city = "";
      if (data.address) {
        city = data.address.city || data.address.town || data.address.village || data.address.municipality || "";
      }
      document.getElementById("modal-city").value = city;
    }
  } catch (err) {
    console.error("Geocoding failed", err);
    document.getElementById("modal-address").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById("modal-city").value = "";
  }
}

// Set client home search location
function setClientSearchLocation(lat, lng, addressText) {
  clientSearchCoords = { lat, lng };
  document.getElementById("search-input").value = addressText || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  if (searchHomeMarker) {
    searchHomeMarker.setLatLng([lat, lng]);
  } else {
    searchHomeMarker = L.marker([lat, lng], { icon: getHomeIcon(), zIndexOffset: 1000 }).addTo(clientMap);
  }

  clientMap.setView([lat, lng], 13);
  renderClientResults();
}

// ==========================================================================
// CLIENT VIEW LOGIC
// ==========================================================================

// Handle search form submission
async function handleClientSearch(e) {
  if (e) e.preventDefault();
  const query = document.getElementById("search-input").value.trim();
  if (!query) return;

  const searchBtn = document.getElementById("search-btn");
  searchBtn.innerText = "🔍...";
  searchBtn.disabled = true;

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const results = await res.json();
      if (results && results.length > 0) {
        const item = results[0];
        setClientSearchLocation(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
        showToast(`Position trouvée : ${item.name || "Adresse"}`);
      } else {
        showToast("Aucun endroit trouvé en France avec ce nom.", "error");
      }
    } else {
      showToast("Service de recherche indisponible.", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Erreur lors de la recherche.", "error");
  } finally {
    searchBtn.innerText = "Rechercher";
    searchBtn.disabled = false;
  }
}

// Set selected day chip
function selectClientDay(dayName) {
  selectedDay = dayName;
  document.querySelectorAll(".day-chip").forEach(chip => {
    if (chip.dataset.day === dayName) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
  renderClientResults();
}

// Render trucks in list and markers on map
function renderClientResults() {
  // Clear previous markers
  clientMarkersList.forEach(marker => clientMap.removeLayer(marker));
  clientMarkersList = [];

  const listContainer = document.getElementById("truck-list");
  listContainer.innerHTML = "";

  // Get active foodtrucks for the selected day within max distance
  const activeTrucks = [];

  vendors.forEach(vendor => {
    const daySchedule = vendor.schedule[selectedDay];
    if (daySchedule && daySchedule.active) {
      const slots = daySchedule.slots || [];
      slots.forEach((slot, slotIndex) => {
        if (!slot.lat || !slot.lng) return;
        const distance = calculateDistance(
          clientSearchCoords.lat,
          clientSearchCoords.lng,
          slot.lat,
          slot.lng
        );
        if (distance <= clientDistanceMax) {
          activeTrucks.push({
            vendor,
            schedule: slot,
            slotIndex,
            distance
          });
        }
      });
    }
  });

  // Sort by distance
  activeTrucks.sort((a, b) => a.distance - b.distance);

  // Update header text
  document.getElementById("results-count").innerText = `${activeTrucks.length} foodtruck(s) à moins de ${clientDistanceMax} km`;

  if (activeTrucks.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.95rem;">
        Aucun foodtruck ouvert ce jour dans un rayon de ${clientDistanceMax} km.
        <br><br>
        <span style="color: var(--primary); font-weight: 600;">Astuce :</span> Essayez d'augmenter le rayon ou de sélectionner un autre jour d'ouverture.
      </div>
    `;
    return;
  }

  // Create markers and list cards
  activeTrucks.forEach(item => {
    const { vendor, schedule, distance } = item;

    // Create marker
    const marker = L.marker([schedule.lat, schedule.lng], { icon: getFoodtruckIcon() })
      .addTo(clientMap);
    
    // Popup template
    const slotLabel = item.slotIndex === 1 ? '🌙 Soir' : '☀️ Midi';
    const popupContent = `
      <div class="popup-container">
        <div class="popup-title">${vendor.name}</div>
        <div style="font-size:0.75rem;color:#f59e0b;font-weight:700;margin-bottom:0.25rem;">${slotLabel}</div>
        <div class="popup-address">📍 <strong>${schedule.city || ""}</strong><br>${schedule.address || ""}</div>
        <div class="popup-hours">🕒 ${schedule.openTime} - ${schedule.closeTime}</div>
        <button class="popup-btn" onclick="openTruckDetailModal('${vendor.id}')">Voir la Carte & Infos</button>
      </div>
    `;
    marker.bindPopup(popupContent);
    clientMarkersList.push(marker);

    // ✅ Aperçu des 2 premiers plats pour la card
    let menuPreviewHtml = "";
    if (vendor.menu && vendor.menu.length > 0) {
      const previewItems = vendor.menu.slice(0, 2);
      menuPreviewHtml = `
        <div style="margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 0.5rem;">
          ${previewItems.map(p => `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; padding: 0.2rem 0; color: var(--text-secondary);">
              <span>🍽️ ${p.name}</span>
              <span style="font-weight: 700; color: var(--primary); white-space: nowrap; margin-left: 0.5rem;">${p.price.toFixed(2)} €</span>
            </div>
          `).join("")}
          ${vendor.menu.length > 2 ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">+ ${vendor.menu.length - 2} autre(s) plat(s)…</div>` : ""}
        </div>
      `;
    }

    // ✅ Téléphone affiché sur la card si disponible
    let phoneHtml = "";
    if (vendor.phone) {
      const cleaned = vendor.phone.replace(/\s/g, "");
      phoneHtml = `
        <a href="tel:${cleaned}" onclick="event.stopPropagation()" style="
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: var(--primary); color: #000; font-weight: 700;
          padding: 0.45rem 0.9rem; border-radius: 2rem; text-decoration: none;
          font-size: 0.82rem; margin-top: 0.6rem;
        ">📞 ${vendor.phone}</a>
      `;
    }

    // ✅ Lien externe affiché sur la card si disponible
    let linkHtml = "";
    if (vendor.link) {
      const label = vendor.link.includes("facebook")  ? "Facebook"
                  : vendor.link.includes("instagram") ? "Instagram"
                  : vendor.link.includes("tiktok")    ? "TikTok"
                  : "Site web";
      linkHtml = `
        <a href="${vendor.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: rgba(255,255,255,0.08); color: var(--text-primary); font-weight: 600;
          padding: 0.45rem 0.9rem; border-radius: 2rem; text-decoration: none;
          font-size: 0.82rem; margin-top: 0.4rem; border: 1px solid rgba(255,255,255,0.12);
        ">🔗 ${label}</a>
      `;
    }

    // Create card element
    const card = document.createElement("div");
    card.className = "truck-card";
    card.style.cursor = "pointer";
    card.innerHTML = `
      <div class="truck-card-image" style="background-image: url('${vendor.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'}')">
        <span class="truck-distance-tag">${distance.toFixed(1)} km</span>
      </div>
      <div class="truck-card-content">
        <h3 class="truck-card-title">${vendor.name}</h3>
        <div style="font-size: 0.85rem; color: var(--primary); font-weight: 600; margin-bottom: 0.25rem;">
          📍 ${schedule.city || ""}${schedule.city && schedule.address ? " - " : ""}${schedule.address || ""}
        </div>
        <p class="truck-card-desc">${vendor.description || "Aucune description disponible."}</p>
        ${menuPreviewHtml}
        <div class="truck-card-meta" style="margin-top: 0.6rem;">
          <span class="truck-status">
            <span class="status-dot open"></span>
            Ouvert : ${schedule.openTime} - ${schedule.closeTime}
          </span>
          <span style="font-weight: 600; color: var(--primary);">${vendor.menu.length} plats</span>
        </div>
        ${phoneHtml}
        ${linkHtml}
      </div>
    `;

    // ✅ Clic sur la card : centre la carte ET ouvre directement la modal de détail
    card.addEventListener("click", (e) => {
      if (e.target.tagName === 'A') return; // Ne pas déclencher si clic sur le lien tel:
      clientMap.setView([schedule.lat, schedule.lng], 15);
      marker.openPopup();
      openTruckDetailModal(vendor.id);
    });

    listContainer.appendChild(card);
  });

  // Attache le listener hide/show header après rendu
  if (window.attachHeaderHideListener) window.attachHeaderHideListener();
}

// Toggle carte sur mobile
window.toggleMobileMap = function() {
  if (window.innerWidth > 768) return;

  const mapContainer = document.querySelector(".map-container");
  const sidebar      = document.querySelector(".sidebar");
  const btn          = document.getElementById("map-toggle-btn");
  if (!mapContainer || !sidebar) return;

  const isVisible = mapContainer.classList.contains("map-visible");

  if (isVisible) {
    // Cacher la carte
    mapContainer.classList.remove("map-visible");
    sidebar.classList.remove("map-visible-sibling");
    btn.innerHTML = "🗺️ Voir sur la carte";
  } else {
    // Afficher la carte
    mapContainer.classList.add("map-visible");
    sidebar.classList.add("map-visible-sibling");
    btn.innerHTML = "📋 Voir la liste";
    // Forcer Leaflet à recalculer sa taille
    setTimeout(() => {
      if (clientMap) clientMap.invalidateSize();
    }, 50);
  }
};

// Client Detail Modal
window.openTruckDetailModal = function(vendorId) {
  const vendor = vendors.find(v => v.id === vendorId);
  if (!vendor) return;

  document.getElementById("detail-title").innerText = vendor.name;
  document.getElementById("detail-image").style.backgroundImage = `url('${vendor.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'}')`;
  document.getElementById("detail-desc").innerText = vendor.description || "Aucune description.";

  // ✅ Téléphone cliquable dans la modal
  const phoneEl = document.getElementById("detail-phone");
  if (phoneEl) {
    if (vendor.phone) {
      const cleaned = vendor.phone.replace(/\s/g, "");
      phoneEl.innerHTML = `
        <a href="tel:${cleaned}" style="
          display: inline-flex; align-items: center; gap: 0.6rem;
          background: var(--primary); color: #000; font-weight: 700;
          padding: 0.65rem 1.4rem; border-radius: 2rem; text-decoration: none;
          font-size: 1.05rem; box-shadow: 0 4px 14px rgba(245,158,11,0.35);
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          📞 Appeler — ${vendor.phone}
        </a>
      `;
      phoneEl.style.display = "block";
    } else {
      phoneEl.innerHTML = "";
      phoneEl.style.display = "none";
    }
  }

  // ✅ Lien externe cliquable dans la modal
  const linkEl = document.getElementById("detail-link");
  if (linkEl) {
    if (vendor.link) {
      const label = vendor.link.includes("facebook")  ? "🔵 Voir sur Facebook"
                  : vendor.link.includes("instagram") ? "📸 Voir sur Instagram"
                  : vendor.link.includes("tiktok")    ? "🎵 Voir sur TikTok"
                  : "🌐 Visiter le site web";
      linkEl.innerHTML = `
        <a href="${vendor.link}" target="_blank" rel="noopener" style="
          display: inline-flex; align-items: center; gap: 0.6rem;
          background: rgba(255,255,255,0.07); color: var(--text-primary); font-weight: 700;
          padding: 0.65rem 1.4rem; border-radius: 2rem; text-decoration: none;
          font-size: 1rem; border: 1px solid rgba(255,255,255,0.15);
          transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.13)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">
          ${label}
        </a>
      `;
      linkEl.style.display = "block";
    } else {
      linkEl.innerHTML = "";
      linkEl.style.display = "none";
    }
  }
  const menuContainer = document.getElementById("detail-menu-list");
  menuContainer.innerHTML = "";
  if (!vendor.menu || vendor.menu.length === 0) {
    menuContainer.innerHTML = "<div style='color: var(--text-muted); font-size: 0.9rem;'>Aucun plat à la carte pour le moment.</div>";
  } else {
    vendor.menu.forEach(item => {
      const div = document.createElement("div");
      div.className = "detail-menu-item";
      div.innerHTML = `
        <div>
          <h4 style="font-weight: 700; color: var(--text-primary);">${item.name}</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">${item.description || ""}</p>
        </div>
        <span style="font-weight: 700; color: var(--primary); font-size: 1rem; white-space: nowrap;">${item.price.toFixed(2)} €</span>
      `;
      menuContainer.appendChild(div);
    });
  }

  // Schedule list
  const scheduleContainer = document.getElementById("detail-schedule-list");
  scheduleContainer.innerHTML = "";
  const currentDay = getCurrentFrenchDay();

  DAYS_OF_WEEK.forEach(day => {
    const sched = vendor.schedule[day];
    const isToday = day === currentDay;
    const row = document.createElement("div");
    row.className = `detail-schedule-row ${isToday ? 'today' : ''}`;

    if (!sched || !sched.active) {
      row.innerHTML = `
        <span>${day}${isToday ? ' <em style="color:var(--primary);font-size:0.78rem;">(Aujourd\'hui)</em>' : ''}</span>
        <span style="font-weight:600;color:var(--text-muted);">Fermé</span>
      `;
    } else {
      const slots = sched.slots || [];
      const slotsHTML = slots.map((slot, i) => {
        const t = slot.openTime && slot.closeTime ? `${slot.openTime} – ${slot.closeTime}` : "—";
        const loc = [slot.city, slot.address].filter(Boolean).join(", ");
        return `<div style="text-align:right;${i > 0 ? 'margin-top:0.35rem;padding-top:0.35rem;border-top:1px dashed rgba(255,255,255,0.08);' : ''}">
          ${slots.length > 1 ? `<span style="font-size:0.7rem;color:var(--primary);font-weight:700;">${i === 0 ? '☀️ Midi' : '🌙 Soir'} </span>` : ''}
          <span style="font-weight:600;">${t}</span>
          ${loc ? `<span style="display:block;font-size:0.75rem;color:var(--text-muted);max-width:160px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;" title="${loc}">📍 ${loc}</span>` : ''}
        </div>`;
      }).join("");
      row.innerHTML = `
        <span>${day}${isToday ? ' <em style="color:var(--primary);font-size:0.78rem;">(Aujourd\'hui)</em>' : ''}</span>
        <div>${slotsHTML}</div>
      `;
    }
    scheduleContainer.appendChild(row);
  });

  document.getElementById("detail-modal").classList.add("active");
};

window.closeDetailModal = function() {
  document.getElementById("detail-modal").classList.remove("active");
};

// ==========================================================================
// ADMIN DASHBOARD LOGIC
// ==========================================================================

function renderAdminVendors() {
  const tableBody = document.getElementById("admin-vendor-tbody");
  tableBody.innerHTML = "";

  if (vendors.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Aucun partenaire créé.</td></tr>`;
    return;
  }

  vendors.forEach(vendor => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-primary);">${vendor.name}</td>
      <td style="color: var(--text-secondary);">${vendor.ownerUsername}</td>
      <td style="color: var(--text-muted); font-size: 0.9rem;">${vendor.menu.length} plats</td>
      <td>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <input
            type="tel"
            id="admin-phone-${vendor.id}"
            value="${vendor.phone || ''}"
            placeholder="06 XX XX XX XX"
            style="
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 0.4rem;
              color: var(--text-primary);
              font-size: 0.85rem;
              padding: 0.35rem 0.6rem;
              width: 140px;
              outline: none;
              transition: border-color 0.2s;
            "
            onfocus="this.style.borderColor='var(--primary)'"
            onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
          >
          <button
            onclick="saveAdminPhone('${vendor.id}')"
            title="Enregistrer le numéro"
            style="
              background: var(--primary);
              border: none;
              border-radius: 0.4rem;
              color: #000;
              font-weight: 700;
              font-size: 0.8rem;
              padding: 0.35rem 0.6rem;
              cursor: pointer;
              white-space: nowrap;
              transition: opacity 0.2s;
            "
            onmouseover="this.style.opacity='0.8'"
            onmouseout="this.style.opacity='1'"
          >💾</button>
        </div>
      </td>
      <td>
        <button class="btn-icon-danger" onclick="deleteVendor('${vendor.id}')" title="Supprimer le partenaire">
          🗑️
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.saveAdminPhone = async function(vendorId) {
  const input = document.getElementById(`admin-phone-${vendorId}`);
  if (!input) return;

  const phone = input.value.trim();
  const vIndex = vendors.findIndex(v => v.id === vendorId);
  if (vIndex === -1) return;

  vendors[vIndex].phone = phone;
  await saveVendors();
  showToast(`Téléphone mis à jour : ${phone || "effacé"}`);
};

async function handleCreateVendor(e) {
  e.preventDefault();
  const name = document.getElementById("admin-v-name").value.trim();
  const username = document.getElementById("admin-v-username").value.trim().toLowerCase();
  const password = document.getElementById("admin-v-password").value.trim();

  if (!name || !username || !password) {
    showToast("Veuillez remplir tous les champs.", "error");
    return;
  }

  // Check if username already exists
  if (vendors.some(v => v.ownerUsername === username) || username === "admin") {
    showToast("Cet identifiant est déjà utilisé.", "error");
    return;
  }

  // Create new vendor object template
  const newVendor = {
    id: "v-" + Date.now(),
    name: name,
    description: "",
    image: "",
    phone: "",
    ownerUsername: username,
    ownerPassword: password,
    menu: [],
    schedule: {
      "Lundi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Mardi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Mercredi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Jeudi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Vendredi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Samedi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Dimanche": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" }
    }
  };

  vendors.push(newVendor);
  await saveVendor(newVendor);
  renderAdminVendors();
  showToast(`Partenaire "${name}" créé avec succès !`);
  
  // Reset form
  document.getElementById("admin-create-form").reset();
}

window.deleteVendor = async function(vendorId) {
  if (confirm("Êtes-vous sûr de vouloir supprimer ce partenaire ? Toutes ses données seront perdues.")) {
    vendors = vendors.filter(v => v.id !== vendorId);
    await deleteVendorFromDB(vendorId);
    renderAdminVendors();
    showToast("Partenaire supprimé avec succès.");
  }
};

// ==========================================================================
// IMPORT CSV PARTENAIRES
// ==========================================================================

function makeEmptySlot() {
  return { city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" };
}

function makeEmptySchedule() {
  const days = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  const s = {};
  days.forEach(d => { s[d] = { active: false, slots: [makeEmptySlot()] }; });
  return s;
}

// Migration ancien format (plat) vers nouveau format slots[]
function migrateSchedule(schedule) {
  const days = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  const migrated = {};
  days.forEach(d => {
    const old = schedule[d];
    if (!old) { migrated[d] = { active: false, slots: [makeEmptySlot()] }; return; }
    if (Array.isArray(old.slots)) { migrated[d] = old; return; }
    migrated[d] = {
      active: old.active || false,
      slots: [{
        city: old.city || "",
        address: old.address || "",
        lat: old.lat || 0,
        lng: old.lng || 0,
        openTime: old.openTime || "",
        closeTime: old.closeTime || ""
      }]
    };
  });
  return migrated;
}

// Parse CSV texte → tableau d'objets
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return { error: "Le fichier doit contenir un en-tête et au moins une ligne de données." };

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const required = ["name", "username", "password"];
  for (const r of required) {
    if (!headers.includes(r)) return { error: `Colonne obligatoire manquante : "${r}"` };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ""; });
    if (!row.name || !row.username || !row.password) continue; // ignorer lignes vides
    rows.push(row);
  }
  return { rows };
}

// Affiche la prévisualisation dans l'UI
window.handleCSVFile = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const result = parseCSV(evt.target.result);
    const previewBox = document.getElementById("csv-preview-box");
    const importBtn  = document.getElementById("csv-import-btn");

    if (result.error) {
      previewBox.innerHTML = `<div style="color:#ef4444;padding:1rem;">❌ ${result.error}</div>`;
      importBtn.style.display = "none";
      return;
    }

    // Détection doublons username
    const conflicts = result.rows.filter(r =>
      vendors.some(v => v.ownerUsername === r.username.toLowerCase()) || r.username.toLowerCase() === "admin"
    );

    let html = `
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.75rem;">
        ${result.rows.length} partenaire(s) détecté(s)${conflicts.length ? ` — <span style="color:#f59e0b;">⚠️ ${conflicts.length} doublon(s) ignoré(s)</span>` : " — ✅ aucun doublon"}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);">Statut</th>
            <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);">Nom</th>
            <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);">Username</th>
            <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);">Téléphone</th>
            <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);">Description</th>
          </tr>
        </thead>
        <tbody>
    `;

    result.rows.forEach(r => {
      const isDup = vendors.some(v => v.ownerUsername === r.username.toLowerCase()) || r.username.toLowerCase() === "admin";
      html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);opacity:${isDup ? '0.45' : '1'};">
          <td style="padding:0.4rem 0.5rem;">${isDup ? '⚠️ Doublon' : '✅ OK'}</td>
          <td style="padding:0.4rem 0.5rem;font-weight:600;color:var(--text-primary);">${r.name}</td>
          <td style="padding:0.4rem 0.5rem;color:var(--text-secondary);">${r.username}</td>
          <td style="padding:0.4rem 0.5rem;color:var(--text-secondary);">${r.phone || "—"}</td>
          <td style="padding:0.4rem 0.5rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.description || "—"}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    previewBox.innerHTML = html;

    // Stocker les rows valides pour import
    const validRows = result.rows.filter(r =>
      !vendors.some(v => v.ownerUsername === r.username.toLowerCase()) && r.username.toLowerCase() !== "admin"
    );
    previewBox.dataset.validRows = JSON.stringify(validRows);

    importBtn.style.display = validRows.length > 0 ? "flex" : "none";
    importBtn.innerText = `🚀 Importer ${validRows.length} partenaire(s) dans Firestore`;
  };
  reader.readAsText(file, "UTF-8");
};

window.launchCSVImport = async function() {
  const previewBox = document.getElementById("csv-preview-box");
  const importBtn  = document.getElementById("csv-import-btn");
  const validRows  = JSON.parse(previewBox.dataset.validRows || "[]");

  if (validRows.length === 0) {
    showToast("Aucune ligne valide à importer.", "error");
    return;
  }

  importBtn.disabled = true;
  importBtn.innerText = `⏳ Import en cours (0 / ${validRows.length})…`;

  let count = 0;
  const errors = [];

  for (const r of validRows) {
    try {
      const newVendor = {
        id: "v-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        name: r.name,
        description: r.description || "",
        image: r.image || "",
        phone: r.phone || "",
        link: r.link || "",
        ownerUsername: r.username.toLowerCase(),
        ownerPassword: r.password,
        menu: [],
        schedule: makeEmptySchedule()
      };
      vendors.push(newVendor);
      await saveVendor(newVendor);
      count++;
      importBtn.innerText = `⏳ Import en cours (${count} / ${validRows.length})…`;
    } catch (err) {
      errors.push(r.username);
      console.error("Import error:", r.username, err);
    }
  }

  renderAdminVendors();
  previewBox.innerHTML = `
    <div style="padding:1.25rem;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:0.75rem;text-align:center;">
      <div style="font-size:1.5rem;margin-bottom:0.5rem;">🎉</div>
      <div style="font-weight:700;color:#10b981;font-size:1rem;">${count} partenaire(s) importé(s) avec succès !</div>
      ${errors.length ? `<div style="color:#f59e0b;font-size:0.85rem;margin-top:0.5rem;">⚠️ ${errors.length} échec(s) : ${errors.join(", ")}</div>` : ""}
    </div>
  `;
  previewBox.dataset.validRows = "[]";
  importBtn.style.display = "none";
  document.getElementById("csv-file-input").value = "";
  showToast(`✅ ${count} partenaire(s) importé(s) dans Firestore !`);
};

// Génère et télécharge un CSV modèle
window.downloadCSVTemplate = function() {
  const header = "name,username,password,phone,description,link,image";
  const examples = [
    "Le Camion Gourmand,camion,pass123,0612345678,Burgers artisanaux maison,https://www.facebook.com/camion,",
    "Pizza Roma,pizzaroma,roma2024,0698765432,Pizzas napolitaines au feu de bois,,",
    "Tacos del Sol,tacosdelsol,tacos2024,0677123456,Tacos mexicains authentiques,https://www.instagram.com/tacosdelsol,"
  ];
  const csv = [header, ...examples].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "template_import_trucklocate.csv";
  a.click(); URL.revokeObjectURL(url);
};

// ==========================================================================
// VENDOR PORTAL LOGIC
// ==========================================================================

function handleVendorLogin(e) {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value.trim();

  // 1. Admin login check
  if (username === "admin" && password === "admin") {
    currentUser = "admin";
    updateAuthUI();
    showToast("Connexion Administrateur réussie.");
    switchTab("admin");
    return;
  }

  // 2. Vendor login check
  const vendor = vendors.find(v => v.ownerUsername === username && v.ownerPassword === password);
  if (vendor) {
    currentUser = vendor;
    updateAuthUI();
    showToast(`Bienvenue, ${vendor.name} !`);
    switchTab("vendor");
    renderVendorDashboard();
  } else {
    showToast("Identifiants incorrects.", "error");
  }
}

function updateAuthUI() {
  const userBadge = document.getElementById("user-badge-container");
  const loginTab = document.getElementById("tab-login");

  if (currentUser) {
    // Logged in
    let displayName = currentUser === "admin" ? "Administrateur" : currentUser.name;
    userBadge.innerHTML = `
      <span>Connecté : <strong style="color: var(--primary);">${displayName}</strong></span>
      <button class="logout-btn" onclick="logout()">Déconnexion</button>
    `;
    userBadge.style.display = "flex";
    loginTab.style.display = "none";
  } else {
    // Logged out
    userBadge.style.display = "none";
    loginTab.style.display = "flex";
  }
}

window.logout = function() {
  currentUser = null;
  updateAuthUI();
  showToast("Vous êtes déconnecté.");
  
  // Hide Admin/Vendor tabs dynamically in navigation if they shouldn't see it
  document.getElementById("tab-admin").style.display = "none";
  document.getElementById("tab-vendor").style.display = "none";

  switchTab("client");
};

function renderVendorDashboard() {
  if (!currentUser || currentUser === "admin") return;

  // Set Profile fields
  document.getElementById("v-profile-name").value = currentUser.name;
  document.getElementById("v-profile-desc").value = currentUser.description || "";
  document.getElementById("v-profile-image-url").value = currentUser.image || "";
  // ✅ Remplir le champ téléphone
  document.getElementById("v-profile-phone").value = currentUser.phone || "";
  document.getElementById("v-profile-link").value  = currentUser.link  || "";

  // Render Menu List
  renderVendorMenuList();

  // Render Schedule forms
  renderVendorScheduleList();
}

// ✅ Profile Save — inclut maintenant le téléphone
async function saveVendorProfile(e) {
  e.preventDefault();
  if (!currentUser || currentUser === "admin") return;

  const index = vendors.findIndex(v => v.id === currentUser.id);
  if (index === -1) return;

  vendors[index].name = document.getElementById("v-profile-name").value.trim();
  vendors[index].description = document.getElementById("v-profile-desc").value.trim();
  vendors[index].image = document.getElementById("v-profile-image-url").value.trim();
  // ✅ Sauvegarde du numéro de téléphone
  vendors[index].phone = document.getElementById("v-profile-phone").value.trim();
  vendors[index].link  = document.getElementById("v-profile-link").value.trim();

  // Update current user copy too
  currentUser = vendors[index];
  
  await saveVendors();
  updateAuthUI(); // Update logo text/badge if name changed
  showToast("Profil enregistré avec succès.");
}

// Profile Image File Selection (Base64 conversion)
function handleProfileImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    document.getElementById("v-profile-image-url").value = evt.target.result;
    showToast("Photo importée en mémoire (pensez à Enregistrer).");
  };
  reader.readAsDataURL(file);
}

// Menu Management
function renderVendorMenuList() {
  const container = document.getElementById("vendor-menu-list");
  container.innerHTML = "";

  if (currentUser.menu.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Aucun article à la carte. Ajoutez un plat ci-dessus !</div>`;
    return;
  }

  currentUser.menu.forEach(item => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "menu-list-item";
    itemDiv.innerHTML = `
      <div class="menu-list-info">
        <h4>${item.name}</h4>
        <p>${item.description || "Pas de description."}</p>
      </div>
      <div class="menu-list-price-action">
        <span class="menu-list-price">${item.price.toFixed(2)} €</span>
        <button class="btn-icon-danger" onclick="deleteMenuItem('${item.id}')" title="Supprimer">🗑️</button>
      </div>
    `;
    container.appendChild(itemDiv);
  });
}

async function handleAddMenuItem(e) {
  e.preventDefault();
  if (!currentUser || currentUser === "admin") return;

  const name = document.getElementById("new-menu-name").value.trim();
  const desc = document.getElementById("new-menu-desc").value.trim();
  const price = parseFloat(document.getElementById("new-menu-price").value);

  if (!name || isNaN(price) || price < 0) {
    showToast("Veuillez saisir un nom et un prix valide.", "error");
    return;
  }

  const newItem = {
    id: "m-" + Date.now(),
    name: name,
    description: desc,
    price: price
  };

  const index = vendors.findIndex(v => v.id === currentUser.id);
  if (index === -1) return;

  vendors[index].menu.push(newItem);
  currentUser = vendors[index];
  
  await saveVendors();
  renderVendorMenuList();
  showToast(`"${name}" ajouté au menu !`);

  // Clear form
  document.getElementById("vendor-menu-form").reset();
}

window.deleteMenuItem = async function(itemId) {
  if (!currentUser || currentUser === "admin") return;

  const index = vendors.findIndex(v => v.id === currentUser.id);
  if (index === -1) return;

  vendors[index].menu = vendors[index].menu.filter(item => item.id !== itemId);
  currentUser = vendors[index];

  await saveVendors();
  renderVendorMenuList();
  showToast("Article supprimé.");
};

// Schedule Management
function renderSlotHTML(day, slotIndex, slot) {
  const isSecond = slotIndex === 1;
  return `
    <div class="day-slot-block" id="slot-block-${day}-${slotIndex}" style="
      background: ${isSecond ? 'rgba(245,158,11,0.05)' : 'transparent'};
      border: 1px solid ${isSecond ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)'};
      border-radius: 0.75rem;
      padding: 1rem;
      margin-top: ${isSecond ? '0.75rem' : '0'};
    ">
      ${isSecond ? `<div style="font-size:0.78rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem;">🌙 Service du soir — Emplacement B</div>` : `<div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem;">☀️ Service du midi — Emplacement A</div>`}
      <div class="day-schedule-details">
        <div class="form-group">
          <label>Heure d'ouverture</label>
          <input type="time" class="form-control" id="sched-open-${day}-${slotIndex}"
            value="${slot.openTime || (isSecond ? '18:00' : '11:00')}"
            onchange="updateSlotTimes('${day}', ${slotIndex})">
        </div>
        <div class="form-group">
          <label>Heure de fermeture</label>
          <input type="time" class="form-control" id="sched-close-${day}-${slotIndex}"
            value="${slot.closeTime || (isSecond ? '23:00' : '14:30')}"
            onchange="updateSlotTimes('${day}', ${slotIndex})">
        </div>
      </div>
      <div class="day-schedule-location" style="margin-top:0.75rem;">
        <div style="display: flex; gap: 0.75rem; width: 100%;">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <label>Ville</label>
            <input type="text" class="form-control" id="sched-city-${day}-${slotIndex}"
              placeholder="Ex: Paris" value="${slot.city || ''}"
              onchange="updateSlotCity('${day}', ${slotIndex})">
          </div>
          <div class="form-group" style="flex: 1.5; margin-bottom: 0;">
            <label>Adresse</label>
            <input type="text" class="form-control" id="sched-addr-${day}-${slotIndex}"
              placeholder="Ex: 12 Place de la Mairie" value="${slot.address || ''}"
              onchange="updateSlotAddress('${day}', ${slotIndex})">
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
          <button type="button" class="btn-map-select" style="flex:1;justify-content:center;"
            onclick="openLocationPickerModalSlot('${day}', ${slotIndex})">
            🗺️ Positionner sur la carte
          </button>
          ${isSecond ? `<button type="button" onclick="removeSecondSlot('${day}')" style="
            background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
            color:#ef4444;border-radius:0.6rem;padding:0.45rem 0.75rem;
            font-size:0.82rem;font-weight:700;cursor:pointer;white-space:nowrap;
          ">✕ Supprimer</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderVendorScheduleList() {
  const container = document.getElementById("vendor-schedule-container");
  container.innerHTML = "";

  DAYS_OF_WEEK.forEach(day => {
    const s = currentUser.schedule[day] || { active: false, slots: [makeEmptySlot()] };
    const slots = s.slots || [makeEmptySlot()];

    const card = document.createElement("div");
    card.className = `day-schedule-card ${s.active ? 'active' : ''}`;
    card.id = `schedule-card-${day}`;

    const slotsHTML = slots.map((slot, i) => renderSlotHTML(day, i, slot)).join("");
    const hasSecondSlot = slots.length >= 2;

    card.innerHTML = `
      <div class="day-schedule-header">
        <span class="day-name">${day}</span>
        <label class="switch-container">
          <span class="switch-label">${s.active ? "Ouvert" : "Fermé"}</span>
          <span class="switch">
            <input type="checkbox" id="sched-active-${day}" ${s.active ? 'checked' : ''} onchange="toggleDayActive('${day}')">
            <span class="slider"></span>
          </span>
        </label>
      </div>
      <div id="sched-slots-${day}">
        ${slotsHTML}
      </div>
      ${s.active && !hasSecondSlot ? `
        <button type="button" onclick="addSecondSlot('${day}')" style="
          width:100%;margin-top:0.75rem;
          background:rgba(245,158,11,0.08);
          border:1px dashed rgba(245,158,11,0.4);
          color:var(--primary);font-weight:700;font-size:0.85rem;
          padding:0.6rem;border-radius:0.6rem;cursor:pointer;
          transition:background 0.2s;
        " id="add-slot-btn-${day}"
          onmouseover="this.style.background='rgba(245,158,11,0.15)'"
          onmouseout="this.style.background='rgba(245,158,11,0.08)'">
          ➕ Ajouter un 2ème service (soir / lieu B)
        </button>
      ` : ''}
    `;

    container.appendChild(card);
  });
}

// ---- Gestion toggle jour ----
window.toggleDayActive = async function(day) {
  if (!currentUser || currentUser === "admin") return;
  const active = document.getElementById(`sched-active-${day}`).checked;
  const card = document.getElementById(`schedule-card-${day}`);
  if (active) {
    card.classList.add("active");
    card.querySelector(".switch-label").innerText = "Ouvert";
  } else {
    card.classList.remove("active");
    card.querySelector(".switch-label").innerText = "Fermé";
  }
  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex !== -1) {
    vendors[vIndex].schedule[day].active = active;
    if (active && !vendors[vIndex].schedule[day].slots[0].openTime) {
      vendors[vIndex].schedule[day].slots[0].openTime = "11:30";
      vendors[vIndex].schedule[day].slots[0].closeTime = "14:30";
    }
    currentUser = vendors[vIndex];
    await saveVendors();
    renderVendorScheduleList();
  }
};

// ---- Mise à jour horaires par slot ----
window.updateSlotTimes = async function(day, slotIndex) {
  const openTime  = document.getElementById(`sched-open-${day}-${slotIndex}`).value;
  const closeTime = document.getElementById(`sched-close-${day}-${slotIndex}`).value;
  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex !== -1) {
    vendors[vIndex].schedule[day].slots[slotIndex].openTime  = openTime;
    vendors[vIndex].schedule[day].slots[slotIndex].closeTime = closeTime;
    currentUser = vendors[vIndex];
    await saveVendors();
  }
};

window.updateSlotCity = async function(day, slotIndex) {
  const city = document.getElementById(`sched-city-${day}-${slotIndex}`).value.trim();
  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex !== -1) {
    vendors[vIndex].schedule[day].slots[slotIndex].city = city;
    currentUser = vendors[vIndex];
    await saveVendors();
  }
};

window.updateSlotAddress = async function(day, slotIndex) {
  const addr = document.getElementById(`sched-addr-${day}-${slotIndex}`).value.trim();
  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex !== -1) {
    vendors[vIndex].schedule[day].slots[slotIndex].address = addr;
    currentUser = vendors[vIndex];
    await saveVendors();
  }
};

// ---- Ajouter / supprimer le 2ème slot ----
window.addSecondSlot = async function(day) {
  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex === -1) return;
  if (vendors[vIndex].schedule[day].slots.length >= 2) return;
  vendors[vIndex].schedule[day].slots.push({ ...makeEmptySlot(), openTime: "18:00", closeTime: "23:00" });
  currentUser = vendors[vIndex];
  await saveVendors();
  renderVendorScheduleList();
  showToast("2ème service ajouté !");
};

window.removeSecondSlot = async function(day) {
  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex === -1) return;
  vendors[vIndex].schedule[day].slots = [vendors[vIndex].schedule[day].slots[0]];
  currentUser = vendors[vIndex];
  await saveVendors();
  renderVendorScheduleList();
  showToast("2ème service supprimé.");
};

// ---- Modal positionnement carte (avec support slot index) ----
let activeModalSlotIndex = 0;

window.openLocationPickerModalSlot = function(day, slotIndex) {
  activeModalDay       = day;
  activeModalSlotIndex = slotIndex;

  const slot    = (currentUser.schedule[day].slots || [])[slotIndex] || makeEmptySlot();
  const overlay = document.getElementById("location-picker-modal");
  const label   = slotIndex === 1 ? `${day} — Service du soir (B)` : `${day} — Service du midi (A)`;
  document.getElementById("modal-day-name").innerText = label;
  overlay.classList.add("active");

  setTimeout(() => {
    initModalMap();
    modalMap.invalidateSize();
    if (slot.lat && slot.lng) {
      modalMap.setView([slot.lat, slot.lng], 15);
      updateModalMarker(slot.lat, slot.lng);
      document.getElementById("modal-address").value = slot.address || "";
      document.getElementById("modal-city").value    = slot.city    || "";
    } else {
      let fallbackCoords = [46.2276, 2.2137];
      let fallbackZoom   = 6;
      for (const d of DAYS_OF_WEEK) {
        const s0 = (currentUser.schedule[d]?.slots || [])[0];
        if (s0?.lat) { fallbackCoords = [s0.lat, s0.lng]; fallbackZoom = 14; break; }
      }
      modalMap.setView(fallbackCoords, fallbackZoom);
      if (modalMarker) { modalMap.removeLayer(modalMarker); modalMarker = null; }
      document.getElementById("modal-lat").value     = "";
      document.getElementById("modal-lng").value     = "";
      document.getElementById("modal-address").value = "";
      document.getElementById("modal-city").value    = "";
    }
  }, 100);
};

// Garde la compatibilité avec l'ancien appel sans slotIndex
window.openLocationPickerModal = function(day) {
  window.openLocationPickerModalSlot(day, 0);
};

window.closeLocationModal = function() {
  document.getElementById("location-picker-modal").classList.remove("active");
  activeModalDay       = null;
  activeModalSlotIndex = 0;
};

// Confirmation position depuis modal
window.confirmModalLocation = async function() {
  if (!activeModalDay || !currentUser) return;
  const latVal  = parseFloat(document.getElementById("modal-lat").value);
  const lngVal  = parseFloat(document.getElementById("modal-lng").value);
  const addrVal = document.getElementById("modal-address").value.trim();
  const cityVal = document.getElementById("modal-city").value.trim();

  if (isNaN(latVal) || isNaN(lngVal)) {
    showToast("Veuillez sélectionner un point sur la carte.", "error");
    return;
  }

  const vIndex = vendors.findIndex(v => v.id === currentUser.id);
  if (vIndex !== -1) {
    const slot = vendors[vIndex].schedule[activeModalDay].slots[activeModalSlotIndex];
    slot.lat     = latVal;
    slot.lng     = lngVal;
    slot.address = addrVal;
    slot.city    = cityVal;
    currentUser = vendors[vIndex];
    await saveVendors();
    // Mise à jour champs DOM
    const addrEl = document.getElementById(`sched-addr-${activeModalDay}-${activeModalSlotIndex}`);
    const cityEl = document.getElementById(`sched-city-${activeModalDay}-${activeModalSlotIndex}`);
    if (addrEl) addrEl.value = addrVal;
    if (cityEl) cityEl.value = cityVal;
    showToast(`Position enregistrée — ${activeModalDay} (service ${activeModalSlotIndex + 1}) !`);
    closeLocationModal();
  }
};

// Search address inside Modal Map
window.searchModalAddress = async function() {
  const query = document.getElementById("modal-search-input").value.trim();
  if (!query) return;

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const results = await res.json();
      if (results && results.length > 0) {
        const item = results[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        modalMap.setView([lat, lng], 15);
        updateModalMarker(lat, lng);
        document.getElementById("modal-address").value = item.display_name;
      } else {
        showToast("Aucun résultat trouvé pour cette recherche.", "error");
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Erreur lors de la recherche.", "error");
  }
};

// ==========================================================================
// TABS & VIEW CONTROL
// ==========================================================================

window.switchTab = function(tabName) {
  // Réaffiche le header à chaque changement d'onglet
  const header = document.querySelector("header");
  if (header) header.classList.remove("header-hidden");
  document.body.classList.remove("header-is-hidden");
  window.dispatchEvent(new Event("tabChanged"));

  // Hide all panels
  document.querySelectorAll(".view-panel").forEach(panel => panel.classList.remove("active"));
  
  // Set tab buttons inactive
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

  // Check login restrictions
  if (tabName === "admin" && currentUser !== "admin") {
    tabName = "login";
  }
  if (tabName === "vendor" && (!currentUser || currentUser === "admin")) {
    tabName = "login";
  }

  // Update tabs showing in navigation dynamically
  const tabAdmin = document.getElementById("tab-admin");
  const tabVendor = document.getElementById("tab-vendor");
  
  if (currentUser === "admin") {
    tabAdmin.style.display = "flex";
    tabVendor.style.display = "none";
  } else if (currentUser) {
    tabAdmin.style.display = "none";
    tabVendor.style.display = "flex";
  } else {
    tabAdmin.style.display = "none";
    tabVendor.style.display = "none";
  }

  // Activate specific tab
  if (tabName === "client") {
    document.getElementById("view-client").classList.add("active");
    document.getElementById("tab-client").classList.add("active");
    
    // Invalidate Leaflet map size (crucial since it was hidden)
    setTimeout(() => {
      initClientMap();
      clientMap.invalidateSize();
      renderClientResults();
    }, 100);

  } else if (tabName === "login") {
    document.getElementById("view-login").classList.add("active");
    document.getElementById("tab-login").classList.add("active");

  } else if (tabName === "vendor") {
    document.getElementById("view-vendor").classList.add("active");
    document.getElementById("tab-vendor").classList.add("active");
    renderVendorDashboard();

  } else if (tabName === "admin") {
    document.getElementById("view-admin").classList.add("active");
    document.getElementById("tab-admin").classList.add("active");
    renderAdminVendors();
    initAdminSlotsField();

  } else if (tabName === "partner") {
    document.getElementById("view-partner").classList.add("active");
    document.getElementById("tab-partner").classList.add("active");
    initPartnerCounter();
  }
};

// ==========================================================================
// DEVENIR PARTENAIRE
// ==========================================================================

const PARTNER_SLOTS_TOTAL = 100;

// Lecture depuis localStorage (valeur par défaut : 28)
function getSlotsTaken() {
  const stored = localStorage.getItem("partner_slots_taken");
  return stored !== null ? parseInt(stored) : 28;
}

function saveSlotsTaken(value) {
  localStorage.setItem("partner_slots_taken", String(value));
}

function initPartnerCounter() {
  const taken = getSlotsTaken();
  const remaining = Math.max(0, PARTNER_SLOTS_TOTAL - taken);
  const pct = Math.min(100, (taken / PARTNER_SLOTS_TOTAL) * 100);

  const digitEl = document.getElementById("partner-slots-remaining");
  const barEl   = document.getElementById("partner-bar-fill");

  if (digitEl) digitEl.innerText = remaining;
  if (barEl) setTimeout(() => { barEl.style.width = pct + "%"; }, 120);
}

// --- Fonctions admin du compteur ---

function adminSyncSlotPreview() {
  const input = document.getElementById("admin-slots-taken");
  if (!input) return;
  let val = parseInt(input.value) || 0;
  val = Math.max(0, Math.min(100, val));
  input.value = val;
  const previewEl = document.getElementById("admin-slots-remaining-preview");
  if (previewEl) previewEl.innerText = Math.max(0, PARTNER_SLOTS_TOTAL - val);
}

window.adminSlotIncrement = function() {
  const input = document.getElementById("admin-slots-taken");
  if (!input) return;
  input.value = Math.min(100, (parseInt(input.value) || 0) + 1);
  adminSyncSlotPreview();
};

window.adminSlotDecrement = function() {
  const input = document.getElementById("admin-slots-taken");
  if (!input) return;
  input.value = Math.max(0, (parseInt(input.value) || 0) - 1);
  adminSyncSlotPreview();
};

window.adminSaveSlots = async function() {
  const input = document.getElementById("admin-slots-taken");
  if (!input) return;
  const val = Math.max(0, Math.min(100, parseInt(input.value) || 0));
  input.value = val;
  saveSlotsTaken(val);
  adminSyncSlotPreview();
  showToast(`Compteur mis à jour : ${PARTNER_SLOTS_TOTAL - val} place(s) restante(s) affichées.`);
};

// Initialise le champ admin avec la valeur stockée
function initAdminSlotsField() {
  const input = document.getElementById("admin-slots-taken");
  if (!input) return;
  input.value = getSlotsTaken();
  adminSyncSlotPreview();
  input.addEventListener("input", adminSyncSlotPreview);
}

window.handlePartnerRequest = async function(e) {
  e.preventDefault();

  const btn = document.getElementById("partner-submit-btn");
  btn.disabled = true;
  btn.innerText = "⏳ Envoi en cours...";

  const taken     = getSlotsTaken();
  const remaining = Math.max(0, PARTNER_SLOTS_TOTAL - taken);

  const templateParams = {
    truck_name : document.getElementById("partner-truck-name").value.trim(),
    owner_name : document.getElementById("partner-owner-name").value.trim(),
    reply_to   : document.getElementById("partner-email").value.trim(),
    phone      : document.getElementById("partner-phone").value.trim(),
    city       : document.getElementById("partner-city").value.trim(),
    cuisine    : document.getElementById("partner-cuisine").value.trim() || "Non précisé",
    message    : document.getElementById("partner-message").value.trim() || "Aucun message.",
    offer      : remaining > 0
                   ? `ACCÈS GRATUIT (place fondateur — ${remaining} place(s) restante(s))`
                   : "Offre Standard — 30 €/an",
  };

  try {
    // ⚠️  Remplacez les trois valeurs ci-dessous par vos identifiants EmailJS
    //     Créez votre compte gratuit sur https://www.emailjs.com
    //     Service ID  → emailjs.com > Email Services > votre service Gmail
    //     Template ID → emailjs.com > Email Templates > votre template
    //     Public Key  → emailjs.com > Account > Public Key
    await emailjs.send(
      "service_abc123",
      "template_xyz456",
      templateParams
    );

    // ✅ Succès
    document.getElementById("partner-contact-form").style.display = "none";
    document.getElementById("partner-success-msg").style.display  = "block";
    showToast("🎉 Demande envoyée avec succès !");

  } catch (err) {
    console.error("EmailJS error:", err);
    showToast("❌ Erreur lors de l'envoi. Réessayez ou contactez minio.berger@gmail.com", "error");
    btn.disabled  = false;
    btn.innerText = "🚀 Envoyer ma demande de partenariat";
  }
};


// ==========================================================================
// PWA — Service Worker & Bannière d'installation
// ==========================================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then((reg) => {
        console.log("[PWA] Service Worker enregistré :", reg.scope);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showToast("🔄 Mise à jour disponible — rechargez la page !", "info");
            }
          });
        });
      })
      .catch((err) => console.warn("[PWA] Échec enregistrement SW :", err));
  });
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(() => showInstallBanner(), 3000);
});

function showInstallBanner() {
  if (document.getElementById("pwa-install-banner")) return;

  const banner = document.createElement("div");
  banner.id = "pwa-install-banner";
  banner.innerHTML = `
    <div style="
      position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);
      background:#1a1d27;border:1px solid rgba(245,158,11,0.4);
      border-radius:1rem;padding:1rem 1.25rem;
      display:flex;align-items:center;gap:1rem;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      z-index:9999;max-width:360px;width:calc(100vw - 2rem);
      animation:slideUpBanner 0.4s cubic-bezier(0.4,0,0.2,1);
    ">
      <div style="font-size:2rem;">🚚</div>
      <div style="flex:1;">
        <div style="font-weight:700;color:#f1f5f9;font-size:0.95rem;">Installer TruckLocate</div>
        <div style="font-size:0.78rem;color:#94a3b8;margin-top:0.1rem;">Accès rapide depuis votre écran d'accueil</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.4rem;">
        <button id="pwa-install-btn" style="
          background:#f59e0b;color:#000;border:none;
          border-radius:0.5rem;padding:0.4rem 0.8rem;font-weight:700;
          font-size:0.8rem;cursor:pointer;white-space:nowrap;
        ">Installer</button>
        <button id="pwa-dismiss-btn" style="
          background:transparent;color:#64748b;border:none;
          font-size:0.75rem;cursor:pointer;text-decoration:underline;
        ">Plus tard</button>
      </div>
    </div>
    <style>
      @keyframes slideUpBanner {
        from{opacity:0;transform:translateX(-50%) translateY(20px);}
        to{opacity:1;transform:translateX(-50%) translateY(0);}
      }
    </style>
  `;
  document.body.appendChild(banner);

  document.getElementById("pwa-install-btn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") showToast("🎉 TruckLocate installé sur votre appareil !");
    deferredInstallPrompt = null;
    banner.remove();
  });

  document.getElementById("pwa-dismiss-btn").addEventListener("click", () => banner.remove());
}

window.addEventListener("appinstalled", () => {
  const b = document.getElementById("pwa-install-banner");
  if (b) b.remove();
  deferredInstallPrompt = null;
});

// ==========================================================================
// HEADER AUTO-HIDE AU SCROLL — mobile uniquement
// ==========================================================================

(function() {
  let lastY = 0;
  const THRESHOLD = 30;
  const header = document.querySelector("header") || document.getElementsByTagName("header")[0];

  function handleScroll(e) {
    if (window.innerWidth > 768) return;
    const el = e.target;
    const y = el.scrollTop;

    if (y > lastY && y > THRESHOLD) {
      header.style.transform = "translateY(-100%)";
      header.style.opacity = "0";
      header.style.pointerEvents = "none";
    } else if (y < lastY - 5 || y <= THRESHOLD) {
      header.style.transform = "";
      header.style.opacity = "";
      header.style.pointerEvents = "";
    }
    lastY = y;
  }

  // Délégation : on écoute tous les scrolls sur document et on filtre .results-section
  document.addEventListener("scroll", function(e) {
    if (e.target && e.target.classList && e.target.classList.contains("results-section")) {
      handleScroll(e);
    }
  }, true); // capture phase pour attraper les scrolls sur éléments enfants

  // Réaffiche le header au changement d'onglet
  window.addEventListener("tabChanged", () => {
    if (!header) return;
    header.style.transform = "";
    header.style.opacity = "";
    header.style.pointerEvents = "";
    lastY = 0;
  });
})();

// ==========================================================================
// INITIALISATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
  await initDatabase();
  listenVendors();
  
  // Set selected day to current day on page load
  selectedDay = getCurrentFrenchDay();
  
  // Create day chips
  const chipsContainer = document.getElementById("day-chips");
  chipsContainer.innerHTML = "";
  
  DAYS_OF_WEEK.forEach(day => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `day-chip ${day === selectedDay ? 'active' : ''}`;
    chip.dataset.day = day;
    chip.innerText = day;
    chip.addEventListener("click", () => selectClientDay(day));
    chipsContainer.appendChild(chip);
  });

  // Wire up event listeners
  document.getElementById("client-search-form").addEventListener("submit", handleClientSearch);
  document.getElementById("vendor-login-form").addEventListener("submit", handleVendorLogin);
  document.getElementById("vendor-profile-form").addEventListener("submit", saveVendorProfile);
  document.getElementById("vendor-image-upload").addEventListener("change", handleProfileImageUpload);
  document.getElementById("vendor-menu-form").addEventListener("submit", handleAddMenuItem);
  document.getElementById("admin-create-form").addEventListener("submit", handleCreateVendor);

  // Range Slider text feedback
  const rangeSlider = document.getElementById("distance-slider");
  const distanceValue = document.getElementById("distance-value");
  
  rangeSlider.addEventListener("input", (e) => {
    clientDistanceMax = parseInt(e.target.value);
    distanceValue.innerText = `${clientDistanceMax} km`;
    renderClientResults();
  });

  // Auth UI setup
  updateAuthUI();

  // Load default Client view
  switchTab("client");
});

// ==========================================================================
// SWIPE HIDE — header + search-section sur mobile
// ==========================================================================
(function () {
  let startY = 0;
  let hidden = false;

  function els() {
    return {
      header: document.querySelector("header"),
      search: document.querySelector(".search-section"),
      btn:    document.getElementById("map-toggle-btn")
    };
  }

  // Mesure la hauteur réelle du bloc avant de l'animer
  function getHeight(el) {
    return el.getBoundingClientRect().height;
  }

  function hideUI() {
    if (hidden) return;
    hidden = true;
    const { header, search, btn } = els();

    // Header — glisse vers le haut
    if (header) {
      header.style.transition    = "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease";
      header.style.transform     = "translateY(-100%)";
      header.style.opacity       = "0";
      header.style.pointerEvents = "none";
    }

    // Search section — se replie vers le haut en douceur
    if (search) {
      const h = getHeight(search);
      // On fixe d'abord la hauteur courante pour que la transition parte d'une valeur définie
      search.style.maxHeight  = h + "px";
      search.style.overflow   = "hidden";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          search.style.transition = "max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, padding 0.4s ease";
          search.style.maxHeight  = "0";
          search.style.opacity    = "0";
          search.style.padding    = "0";
        });
      });

      setTimeout(() => { if (hidden && search) search.style.display = "none"; }, 420);
    }

    // Bouton carte
    if (btn) {
      btn.style.transition    = "opacity 0.3s ease";
      btn.style.opacity       = "0";
      btn.style.pointerEvents = "none";
    }
  }

  function showUI() {
    if (!hidden) return;
    hidden = false;
    const { header, search, btn } = els();

    // Header — redescend
    if (header) {
      header.style.transition    = "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease";
      header.style.transform     = "";
      header.style.opacity       = "";
      header.style.pointerEvents = "";
    }

    // Search section — se déplie vers le bas
    if (search) {
      search.style.display    = "flex";
      search.style.overflow   = "hidden";
      search.style.maxHeight  = "0";
      search.style.opacity    = "0";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          search.style.transition = "max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, padding 0.4s ease";
          search.style.maxHeight  = "400px"; // valeur max généreuse
          search.style.opacity    = "";
          search.style.padding    = "";
        });
      });

      setTimeout(() => {
        if (!hidden && search) {
          search.style.maxHeight = "";
          search.style.overflow  = "";
          search.style.transition = "";
        }
      }, 420);
    }

    // Bouton carte
    if (btn) {
      btn.style.transition    = "opacity 0.3s ease";
      btn.style.opacity       = "";
      btn.style.pointerEvents = "";
    }
  }

  document.addEventListener("touchstart", (e) => {
    if (window.innerWidth > 768) return;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (window.innerWidth > 768) return;
    const diff = startY - e.changedTouches[0].clientY;
    if (diff > 40)  hideUI();
    if (diff < -30) showUI();
  }, { passive: true });

  window.addEventListener("tabChanged", () => { if (hidden) showUI(); });
})();
