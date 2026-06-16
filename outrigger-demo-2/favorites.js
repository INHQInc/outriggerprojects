"use strict";

// ═══════════════════════════════════════════════════════════════
// OUTRIGGER FAVORITES — Full-Featured Demo Script
// Injects: CSS, modal HTML, tray, toast, heart buttons, all logic
// ═══════════════════════════════════════════════════════════════

// ── Hide blue rooms carousel hero on rooms.html ────────────────
var roomsSlider = document.querySelector(".room-and-suites-slider.card-slider"); if (roomsSlider) roomsSlider.style.display = "none";

// ── Rewrite logo links to point to /demo-2/ ────────────────
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('a.header-logo-dark-bg, a.header-logo-light-bg').forEach(function(a) { a.href = '/demo-2/'; });
  // Also catch any other outrigger.com logo links
  document.querySelectorAll('a[href*="outrigger.com"] img.header-logo').forEach(function(img) { img.parentElement.href = '/demo-2/'; });
  // Tag rooms pages so room-card CSS overrides only apply there (not homepage)
  if (window.location.pathname.indexOf('rooms') !== -1) {
    document.body.classList.add('fav-rooms-page');
  }
});

// ── CSS is now in favorites.css (loaded via <link> in each HTML) ─

// ── Inject modal HTML ───────────────────────────────────────────
var wrapper = document.createElement("div");
wrapper.id = "fav-injected-elements";
wrapper.innerHTML = `<!-- Email Capture -->
<div class="modal-overlay" id="emailModal">
    <div class="modal-overlay__bg" onclick="closeModal('emailModal')"></div>
    <div class="modal-card">
        <button class="modal-card__close" onclick="closeModal('emailModal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <div class="modal-card__logo"><img src="https://www.outrigger.com/globalassets/outrigger/images/logo/outrigger-logo-only-sig-blue-rgb.svg" alt="Outrigger" style="height:50px;width:auto;"></div>
        <!-- Tab toggle -->
        <div class="modal-card__tabs">
            <button class="modal-card__tab active" id="tabNewUser" onclick="switchModalTab('new')">Sign Up</button>
            <button class="modal-card__tab" id="tabReturning" onclick="switchModalTab('returning')">Sign In</button>
        </div>
        <!-- Panel 1: New user signup -->
        <div class="modal-card__panel" id="panelNew">
            <h2>Save your favorites</h2>
            <p>Enter your email to save favorites and access them on any device.</p>
            <input type="email" id="emailInput" placeholder="Enter your email address">
            <p class="modal-card__error" id="emailErr">Please enter a valid email address</p>
            <div class="modal-card__field-group" id="tcGroup">
                <div class="modal-card__checkbox"><input type="checkbox" id="tcCheck"><label for="tcCheck">Agree to our Terms &amp; Conditions</label></div>
                <p class="modal-card__error" id="tcErr">Please agree to Terms &amp; Conditions</p>
            </div>
            <div class="modal-card__field-group" id="recapGroup">
                <div class="modal-card__recaptcha"><div class="recaptcha-box" id="recaptchaBox" onclick="this.classList.toggle('checked')"><div class="check"></div><span>I'm not a robot</span><span style="margin-left:auto;font-size:10px;color:#999;">reCAPTCHA</span></div></div>
                <p class="modal-card__error" id="recapErr">Please complete the reCAPTCHA</p>
            </div>
            <button class="modal-card__submit" onclick="submitEmail()">Save &amp; Continue &rsaquo;</button>
            <button class="modal-card__cancel" onclick="closeModal('emailModal')">Cancel</button>
        </div>
        <!-- Panel 2: Returning user -->
        <div class="modal-card__panel" id="panelReturning" style="display:none;">
            <h2>Access your favorites</h2>
            <p>If you have an email on file with us, enter it below and we&rsquo;ll send you a link to your saved collections.</p>
            <input type="email" id="returningEmailInput" placeholder="Enter your email address">
            <p class="modal-card__error" id="returningEmailErr">Please enter a valid email address</p>
            <button class="modal-card__submit" onclick="sendMagicLink()">Send Me a Link &rsaquo;</button>
            <button class="modal-card__cancel" onclick="closeModal('emailModal')">Cancel</button>
        </div>
    </div>
</div>

<!-- Save to Trip -->
<div class="modal-overlay trip-modal" id="tripModal">
    <div class="modal-overlay__bg" onclick="closeModal('tripModal')"></div>
    <div class="modal-card">
        <button class="modal-card__close" onclick="closeModal('tripModal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <h2>Save to a collection</h2>
        <div class="trip-list" id="tripList"></div>
        <div class="create-trip-form" id="createTripForm">
            <input type="text" id="newTripName" placeholder="e.g. Summer Hawaii 2026 Collection">
            <div class="create-trip-form__actions">
                <button class="create-trip-form__save" onclick="createTrip()">Create</button>
                <button class="create-trip-form__cancel" onclick="hideCreateTrip()">Cancel</button>
            </div>
        </div>
        <button class="trip-modal__create" onclick="showCreateTrip()">
            <div class="trip-modal__create-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
            <span>Create new collection</span>
        </button>
        <button class="trip-modal__save" id="tripSaveBtn" onclick="saveToTrip()" disabled>Done</button>
    </div>
</div>

<!-- Rename Trip -->
<div class="modal-overlay rename-modal" id="renameModal">
    <div class="modal-overlay__bg" onclick="closeModal('renameModal')"></div>
    <div class="modal-card">
        <button class="modal-card__close" onclick="closeModal('renameModal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <h2>Rename collection</h2>
        <input type="text" id="renameInput">
        <button class="rename-modal__save" onclick="confirmRename()">Save</button>
    </div>
</div>

<!-- Create Collection -->
<div class="modal-overlay create-collection-modal" id="createCollectionModal">
    <div class="modal-overlay__bg" onclick="closeModal('createCollectionModal')"></div>
    <div class="modal-card">
        <button class="modal-card__close" onclick="closeModal('createCollectionModal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <h2>New collection</h2>
        <div class="create-row">
            <input type="text" id="createCollectionInput" placeholder="e.g. Summer Hawaii 2026">
            <button onclick="confirmCreateCollection()">Create</button>
        </div>
    </div>
</div>

<!-- Confirm Delete -->
<div class="modal-overlay confirm-modal" id="deleteModal">
    <div class="modal-overlay__bg" onclick="closeModal('deleteModal')"></div>
    <div class="modal-card">
        <button class="modal-card__close" onclick="closeModal('deleteModal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <h2>Delete collection?</h2>
        <p id="deleteMsg">This will remove the collection and all its saved items. This can't be undone.</p>
        <div class="confirm-modal__btns">
            <button class="confirm-modal__delete" onclick="confirmDelete()">Delete</button>
            <button class="confirm-modal__cancel" onclick="closeModal('deleteModal')">Cancel</button>
        </div>
    </div>
</div>

<!-- Favorites Tray -->
<div class="fav-tray__backdrop" id="trayBackdrop" onclick="closeTray()"></div>
<div class="fav-tray" id="favTray">
    <div class="fav-tray__header">
        <div class="fav-tray__header-left">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 28 28" fill="none" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="22" height="16" rx="2"/><path d="M10 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M14 18.5l-2.5-2.3a1.8 1.8 0 0 1 0-2.6 1.8 1.8 0 0 1 2.5 0l0 0a1.8 1.8 0 0 1 2.5 0 1.8 1.8 0 0 1 0 2.6L14 18.5z" fill="#1a1a1a" stroke="none"/></svg>
            <span class="fav-tray__header-title">Trip Planner</span>
            <span class="fav-tray__badge" id="trayBadge" style="display:none;">0</span>
        </div>
        <button class="fav-tray__close" onclick="closeTray()"><svg width="20" height="20" viewBox="0 0 28 28"><path d="M3.6 22.9L22.9 3.6M3.6 3.6L22.9 22.9" stroke="black" stroke-width="2"/></svg></button>
    </div>
    <div class="fav-tray__body" id="trayBody"></div>
    <div class="fav-tray__footer" id="trayFooter" style="display:none;">
        <button class="fav-tray__footer-btn" onclick="switchView('view-favorites')">View All Favorites</button>
    </div>
</div>

<!-- Toast -->
<div class="toast-msg" id="toast"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span id="toastText"></span></div>`;
document.body.appendChild(wrapper);

// ── Inject heart buttons onto existing Outrigger cards ──────────
function injectHeartsOnCards() {
  var heartSVG = '<svg viewBox="0 0 24 24"><path class="heart-outline" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  // Property cards (homepage)
  document.querySelectorAll(".card[property_id]").forEach(function(card) {
    if (card.querySelector(".favorite-btn")) return;
    if(card.querySelector("[room_type_name]")||card.querySelector(".card-body[room_type_name]"))return;
    var slider = card.querySelector(".card-simplified-slider");
    if (!slider) return;
    slider.style.position = "relative";
    var propId = card.getAttribute("property_id");
    var propName = card.getAttribute("property_name") || "Resort";
    var img = card.querySelector(".carousel-item.active img, .carousel-item img, img");
    var imgSrc = img ? (img.getAttribute("data-local-src") || img.src) : "";
    var descEl = card.querySelector(".card-text");
    var desc = descEl ? descEl.textContent.trim() : "";
    var link = card.querySelector("a.card-title, a.card-view-property, a[href]");
    var url = link ? link.href : "#";
    var btn = document.createElement("button");
    btn.className = "favorite-btn";
    btn.setAttribute("data-id", "property-" + propId);
    btn.setAttribute("data-type", "Resort");
    btn.setAttribute("data-name", propName);
    btn.setAttribute("data-sub", "Oahu, Hawaii");
    btn.setAttribute("data-img", imgSrc);
    btn.setAttribute("data-desc", desc);
    btn.setAttribute("data-hotel-url", url);
    btn.setAttribute("data-hotel-code", propId);
    btn.setAttribute("onclick", "onHeartClick(this)");
    btn.innerHTML = heartSVG;
    slider.appendChild(btn);
  });

  // Room cards (rooms page)
  var pageResortName = "";
  var h1El = document.querySelector("h1");
  if (h1El) pageResortName = h1El.textContent.trim();
  document.querySelectorAll(".card[data-room-id]").forEach(function(card) {
    if (card.querySelector(".favorite-btn")) return;
    if (card.classList.contains("promo-card")) return;
    var slider = card.querySelector(".card-simplified-slider");
    if (!slider) { slider = card; }
    slider.style.position = "relative";
    var roomId = card.getAttribute("data-room-id") || "";
    var roomName = card.getAttribute("room_type_name") || (card.querySelector("[room_type_name]") ? card.querySelector("[room_type_name]").getAttribute("room_type_name") : "") || card.getAttribute("data-room-id") || "Room";
    var resortName = card.getAttribute("property_name") || card.closest("[property_name]")?.getAttribute("property_name") || (card.querySelector("[property_name]") ? card.querySelector("[property_name]").getAttribute("property_name") : "") || pageResortName || "";
    var img = card.querySelector(".carousel-item.active img, .carousel-item img, img");
    var imgSrc = img ? (img.getAttribute("data-local-src") || img.src) : "";
    var link = card.querySelector("a.card-title, a.card-view-property, a[href]");
    var url = link ? link.href : "#";
    var btn = document.createElement("button");
    btn.className = "favorite-btn";
    var descEl = card.querySelector(".card-text");
    var desc = descEl ? descEl.textContent.trim() : "";
    btn.setAttribute("data-id", "room-" + roomId.replace(/[^a-z0-9]/gi, "-"));
    btn.setAttribute("data-type", "Room");
    btn.setAttribute("data-name", roomName);
    btn.setAttribute("data-sub", resortName);
    btn.setAttribute("data-img", imgSrc);
    btn.setAttribute("data-desc", desc);
    btn.setAttribute("data-room-url", url);
    btn.setAttribute("data-room-code", roomId);
    btn.setAttribute("onclick", "onHeartClick(this)");
    btn.innerHTML = heartSVG;
    slider.appendChild(btn);
  });

  // Suite room cards (cards with room_type_name inside nested elements)
  document.querySelectorAll(".card.swiper-slide:not([data-room-id])").forEach(function(card){
    if(card.querySelector(".favorite-btn"))return;
    var rb=card.querySelector("[room_type_name]")||card.querySelector(".card-body[room_type_name]");
    if(!rb)return;
    var sl=card.querySelector(".card-simplified-slider");
    if(!sl)return;
    sl.style.position="relative";
    var roomId=rb.getAttribute("room_type_name")||"suite-"+(Math.random()*1e6|0);
    card.setAttribute("data-room-id",roomId);
    var img=card.querySelector(".carousel-item.active img, .carousel-item img, img");
    var imgSrc=img?(img.getAttribute("data-local-src")||img.src):"";
    var descEl=card.querySelector(".card-text");
    var desc=descEl?descEl.textContent.trim():"";
    var link=card.querySelector("a.card-title, a[href]");
    var url=link?link.href:"#";
    var btn=document.createElement("button");
    btn.className="favorite-btn";
    btn.setAttribute("data-id","room-"+roomId.replace(/[^a-z0-9]/gi,"-"));
    btn.setAttribute("data-type","Room");
    btn.setAttribute("data-name",roomId);
    btn.setAttribute("data-sub",pageResortName||"");
    btn.setAttribute("data-img",imgSrc);
    btn.setAttribute("data-desc",desc);
    btn.setAttribute("data-room-url",url);
    btn.setAttribute("data-room-code",roomId);
    btn.setAttribute("onclick","onHeartClick(this)");
    btn.innerHTML=heartSVG;
    var _st=JSON.parse(localStorage.getItem('outrigger_proto_state')||"{}");var trips=(_st.trips||[]);
    var isFav=trips.some(function(t){return t.items&&t.items.some(function(it){return it.id==="room-"+roomId.replace(/[^a-z0-9]/gi,"-");});});
    if(isFav)btn.classList.add("is-favorited");
    sl.appendChild(btn);
  });

    // Offer cards (offers page + homepage offer sliders)
  var offerSel = ".card.swiper-slide:not([property_id]):not([data-room-id])";
  document.querySelectorAll(offerSel).forEach(function(card, i) {
    if (card.querySelector(".favorite-btn")) return;
    if(card.closest('.food-and-drinks-slider')||card.closest('.related-articles-slider'))return;
    if(card.classList.contains('promo-card'))return;
    // Real outrigger offer card markup uses three fields:
    //   .card-title  → eyebrow / discount line ("Save up to 25%")
    //   .card-value  → title ("Book direct for the best rates")
    //   .card-text   → resort name ("at OUTRIGGER Reef Waikiki...")
    // We capture all three so the favorites tile can mirror the live card.
    var eyebrowEl = card.querySelector(".card-title, span.card-title");
    if (!eyebrowEl) return;
    var name = eyebrowEl.textContent.trim();
    if (!name) return;
    var id = "offer-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
    var slider = card.querySelector(".card-simplified-slider");
    var container = slider || card;
    container.style.position = "relative";
    var img = card.querySelector("img");
    var imgSrc = img ? img.src : "";
    var titleEl = card.querySelector(".card-value");
    var title = titleEl ? titleEl.textContent.trim() : "";
    var resortEl = card.querySelector(".card-text");
    var resortName = resortEl ? resortEl.textContent.trim() : "";
    var link = card.querySelector("a[href]");
    var url = link ? link.href : "#";
    var btn = document.createElement("button");
    btn.className = "favorite-btn";
    btn.setAttribute("data-id", id);
    btn.setAttribute("data-type", "Offer");
    btn.setAttribute("data-name", name);
    btn.setAttribute("data-sub", "Special Offers");
    btn.setAttribute("data-img", imgSrc);
    btn.setAttribute("data-title", title);
    btn.setAttribute("data-resort-name", resortName);
    btn.setAttribute("data-offer-url", url);
    btn.setAttribute("onclick", "onHeartClick(this)");
    btn.innerHTML = heartSVG;
    container.appendChild(btn);
  });
}

// ── Demo navigation bar ─────────────────────────────────────────
function injectDemoNav() {
  if (document.querySelector(".demo-nav-bar")) return;
  var page = window.location.pathname.split("/").pop() || "index.html";
  var pages = [
    { href: "index.html", label: "Resorts" },
    { href: "rooms.html", label: "Rooms & Suites" },
    { href: "offers.html", label: "Offers" }
  ];
  var nav = document.createElement("div");
  nav.className = "demo-nav-bar";
  nav.innerHTML = pages.map(function(p) {
    var isActive = p.href === page;
    return '<a href="' + p.href + '"' + (isActive ? ' class="active"' : '') + '>' + p.label + '</a>';
  }).join("") +
  '<div class="demo-sep"></div>' +
  '<button onclick="toggleTray()">Tray<span id="favDemoCount" style="opacity:.65;font-weight:500;"></span></button>' +
  '<button onclick="resetAll()">Reset</button>';
  document.body.appendChild(nav);
}

// ── MAIN JS LOGIC (from prototype) ──────────────────────────────

// ============================
// STATE
// ============================
let state = {
    hasRIID: false,
    email: '',
    trips: [
        { id: 'trip-1', name: 'My Favorites', items: [] }
    ],
    pendingBtn: null,
    selectedTripId: null,
    renamingTripId: null,
    deletingTripId: null,
    deletingItemId: null,
    currentTripView: null // for detail view
};

// ============================
// PERSISTENCE (localStorage)
// ============================
function saveState() {
    try {
        var data = { hasRIID: state.hasRIID, email: state.email, trips: state.trips };
        localStorage.setItem('outrigger_proto_state', JSON.stringify(data));
    } catch(e) {}
}
function loadState() {
    try {
        var raw = localStorage.getItem('outrigger_proto_state');
        if (!raw) return;
        var data = JSON.parse(raw);
        if (data.hasRIID !== undefined) state.hasRIID = data.hasRIID;
        if (data.email) state.email = data.email;
        if (data.trips && Array.isArray(data.trips)) state.trips = data.trips;
        // Re-apply heart states from loaded data
        var savedIds = {};
        state.trips.forEach(function(t) { t.items.forEach(function(i) { savedIds[i.id] = true; }); });
        document.querySelectorAll('.favorite-btn[data-id]').forEach(function(btn) {
            if (savedIds[btn.dataset.id]) btn.classList.add('is-favorited');
        });
        syncUI();
    } catch(e) {}
}

// ============================
// HEART CLICK
// ============================
function onHeartClick(btn) {
    const id = btn.dataset.id;
    if (btn.classList.contains('is-favorited')) {
        // UNFAVORITE: remove from all trips.
        // Cascade: if removing a Resort, also remove every Room
        // saved under that resort (i.e. item.sub === resort.name).
        var cascadeResortName = null;
        state.trips.forEach(function(t) {
            var found = t.items.find(function(i) { return i.id === id; });
            if (found && found.type === 'Resort') cascadeResortName = found.name;
        });
        state.trips.forEach(function(t) { t.items = t.items.filter(function(i) { return i.id !== id; }); });
        if (cascadeResortName) {
            state.trips.forEach(function(t) {
                t.items = t.items.filter(function(i) {
                    return !(i.type === 'Room' && i.sub === cascadeResortName);
                });
            });
        }
        btn.classList.remove('is-favorited');
        toast('Removed from favorites');
    } else {
        if (!state.hasRIID) {
            state.pendingBtn = btn;
            openModal('emailModal');
        } else {
            state.pendingBtn = btn;
            openTripModal();
        }
    }
    syncUI();
}

// ============================
// EMAIL MODAL
// ============================
function submitEmail() {
    const email = document.getElementById('emailInput').value;
    const tc = document.getElementById('tcCheck').checked;
    const recap = document.getElementById('recaptchaBox').classList.contains('checked');
    var emailBad = !email || !email.includes('@');
    var tcBad = !tc;
    var recapBad = !recap;
    document.getElementById('emailErr').classList.toggle('show', emailBad);
    document.getElementById('tcErr').classList.toggle('show', tcBad);
    document.getElementById('tcGroup').classList.toggle('has-error', tcBad);
    document.getElementById('recapErr').classList.toggle('show', recapBad);
    document.getElementById('recapGroup').classList.toggle('has-error', recapBad);
    if (emailBad || tcBad || recapBad) return;

    state.hasRIID = true;
    state.email = email;

    // Show thank-you confirmation inside the modal
    var modalCard = document.querySelector('#emailModal .modal-card');
    modalCard.innerHTML = '<button class="modal-card__close" onclick="closeModal(\'emailModal\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '<div class="modal-card__logo"><img src="https://www.outrigger.com/globalassets/outrigger/images/logo/outrigger-logo-only-sig-blue-rgb.svg" alt="Outrigger" style="height:50px;width:auto;"></div>' +
        '<h2>You\'re all set!</h2>' +
        '<p style="margin-bottom:8px;">Thank you for signing up. Your favorites will be saved and accessible on any device.</p>' +
        '<div style="font-size:13px;color:#666;margin-bottom:24px;">Signed in as <strong>' + email + '</strong></div>' +
        '<button class="modal-card__submit" onclick="closeEmailAndContinue()">Continue &rsaquo;</button>';

    syncUI();
}

function closeEmailAndContinue() {
    closeModal('emailModal');
    toast('Email confirmed! You can now save favorites.');
    // If tray is open, refresh it to show the signed-up empty state
    if (document.getElementById('favTray').classList.contains('open')) {
        renderTray();
    }
    if (state.pendingBtn) {
        setTimeout(function() { openTripModal(); }, 400);
    }
}

function switchModalTab(tab) {
    document.getElementById('tabNewUser').classList.toggle('active', tab === 'new');
    document.getElementById('tabReturning').classList.toggle('active', tab === 'returning');
    document.getElementById('panelNew').style.display = tab === 'new' ? '' : 'none';
    document.getElementById('panelReturning').style.display = tab === 'returning' ? '' : 'none';
    // Clear errors
    document.querySelectorAll('.modal-card__error').forEach(function(e) { e.classList.remove('show'); });
    document.querySelectorAll('.modal-card__field-group').forEach(function(e) { e.classList.remove('has-error'); });
}

function sendMagicLink() {
    var email = document.getElementById('returningEmailInput').value;
    var emailBad = !email || !email.includes('@');
    document.getElementById('returningEmailErr').classList.toggle('show', emailBad);
    if (emailBad) return;

    // Show sent confirmation in the returning panel
    var panel = document.getElementById('panelReturning');
    panel.innerHTML = '<div class="modal-card__sent-confirmation">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>' +
        '<h3>Check your email</h3>' +
        '<p>We sent a link to <strong>' + email + '</strong></p>' +
        '<p style="margin-top:4px;">Click the link to access your saved collections.</p>' +
        '<div style="margin-top:16px;padding:12px 16px;background:#f0ede6;border-radius:8px;font-size:12px;color:#666;text-align:left;">' +
        '<strong style="color:#1a1a1a;">Preview (prototype only):</strong><br>' +
        'outrigger.com/favorites?RIID=' + btoa(email).substring(0,12) + '...' +
        '</div></div>' +
        '<button class="modal-card__submit" style="margin-top:16px;" onclick="closeModal(\'emailModal\')">Done</button>';
}

// ============================
// TRIP PICKER MODAL
// ============================
function openTripModal() {
    state.selectedTripId = state.trips.length > 0 ? state.trips[0].id : null;
    renderTripList();
    openModal('tripModal');
    document.getElementById('tripSaveBtn').disabled = state.selectedTripId === null;
}

function renderTripList() {
    const list = document.getElementById('tripList');
    list.innerHTML = state.trips.map(t => {
        const imgSrc = t.items.length > 0 ? t.items[0].img : '';
        const sel = t.id === state.selectedTripId ? ' selected' : '';
        return '<div class="trip-list__item' + sel + '" onclick="selectTrip(\'' + t.id + '\')">' +
            (imgSrc ? '<img class="trip-list__item-img" src="' + imgSrc + '">' : '<div class="trip-list__item-img" style="background:#f0ede6;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="#c0392b" stroke="none" style="width:36px;height:36px;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>') +
            '<div class="trip-list__item-info"><div class="trip-list__item-name">' + t.name + '</div><div class="trip-list__item-count">' + t.items.length + ' saved</div></div>' +
            '<div class="trip-list__item-check"></div></div>';
    }).join('');
}

function selectTrip(id) {
    state.selectedTripId = id;
    renderTripList();
    document.getElementById('tripSaveBtn').disabled = false;
}

function saveToTrip() {
    if (!state.selectedTripId || !state.pendingBtn) return;
    const btn = state.pendingBtn;
    const trip = state.trips.find(t => t.id === state.selectedTripId);
    var cardEl=btn.closest(".card")||btn.closest(".card-simplified-slider")?.closest(".card")||btn.parentElement?.closest(".card");
    var cardHTML="";
    if(cardEl){var cl=cardEl.cloneNode(true);cl.querySelectorAll(".favorite-btn").forEach(function(b){b.remove();});cardHTML=cl.outerHTML;}
    const item = {
        id: btn.dataset.id,
        type: btn.dataset.type,
        hotelCode: btn.dataset.hotelCode || null,
        roomCode: btn.dataset.roomCode || null,
        offerCode: btn.dataset.offerCode || null,
        itemCode: btn.dataset.roomCode || btn.dataset.hotelCode || btn.dataset.offerCode || btn.dataset.id,
        name: btn.dataset.name,
        sub: btn.dataset.sub,
        img: btn.dataset.img,
        desc: btn.dataset.desc || null,
        // Offer-specific (mirror real outrigger offer card structure)
        title: btn.dataset.title || null,
        resortName: btn.dataset.resortName || null,
        hotelUrl: btn.dataset.hotelUrl || null,
        roomUrl: btn.dataset.roomUrl || null,
        offerUrl: btn.dataset.offerUrl || null,
      cardHTML: cardHTML
    };
    if (!trip.items.find(i => i.id === item.id)) trip.items.push(item);
    btn.classList.add('is-favorited');
    state.pendingBtn = null;
    closeModal('tripModal');
    toast('Saved to "' + trip.name + '"');
    syncUI();
}

function showCreateTrip() {
    document.getElementById('createTripForm').classList.add('show');
    document.getElementById('newTripName').focus();
}
function hideCreateTrip() {
    document.getElementById('createTripForm').classList.remove('show');
    document.getElementById('newTripName').value = '';
}
function createTrip() {
    const name = document.getElementById('newTripName').value.trim();
    if (!name) return;
    const id = 'trip-' + Date.now();
    state.trips.push({ id, name, items: [] });
    hideCreateTrip();
    state.selectedTripId = id;
    renderTripList();
    document.getElementById('tripSaveBtn').disabled = false;
    toast('Collection "' + name + '" created');
}

// ============================
// FAVORITES PAGE
// ============================
function renderFavoritesPage() {
    const el = document.getElementById('favOverlayBody') || document.getElementById('view-favorites');
    if (state.currentTripView) {
        renderTripDetail(el);
    } else {
        renderTripsGrid(el);
    }
}

function renderTripsGrid(el) {
    if (!el) { el = document.getElementById('favOverlayBody'); if (!el) return; }
    const totalItems = state.trips.reduce((s, t) => s + t.items.length, 0);
    let html = '<div class="fav-page"><div class="fav-page__header"><div><h1 class="fav-page__title">My Favorites</h1><div class="fav-page__subtitle">' + state.trips.length + ' collection' + (state.trips.length !== 1 ? 's' : '') + ' &middot; ' + totalItems + ' Saved Items</div></div></div>';
    html += '<div class="trips-grid">';
    state.trips.forEach(t => {
        const imgs = t.items.slice(0, 4);
        html += '<div class="trip-card" onclick="viewTrip(\'' + t.id + '\')">';
        html += '<div class="trip-card__images">';
        for (let i = 0; i < 4; i++) {
            if (imgs[i]) {
                html += '<img src="' + imgs[i].img + '" alt="">';
            } else {
                html += '<div class="placeholder"><svg viewBox="0 0 24 24" fill="#c0392b" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>';
            }
        }
        html += '</div><div class="trip-card__body"><div class="trip-card__name">' + t.name + '</div><div class="trip-card__meta">' + t.items.length + ' saved</div>';
        html += '<div class="trip-card__actions"><button class="trip-card__action-btn" onclick="event.stopPropagation();renameTrip(\'' + t.id + '\')">Rename</button><button class="trip-card__action-btn danger" onclick="event.stopPropagation();deleteTrip(\'' + t.id + '\')">Delete</button></div>';
        html += '</div></div>';
    });
    // Create trip card
    html += '<div class="trip-card--create" onclick="createTripFromPage()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Create new collection</span></div>';
    html += '</div></div>';
    el.innerHTML = html;
}

function renderTripDetail(el) {
    if (!el) { el = document.getElementById('favOverlayBody'); if (!el) return; }
    const trip = state.trips.find(t => t.id === state.currentTripView);
    if (!trip) { state.currentTripView = null; renderTripsGrid(el); return; }
    let html = '<div class="fav-page">';
    html += '<button class="trip-detail__back" onclick="backToTrips()">Back to all collections</button>';
    html += '<div class="trip-detail__header"><div><h1 class="trip-detail__name">' + trip.name + '</h1></div>';
    html += '<div class="trip-detail__actions"><button class="trip-detail__action" onclick="renameTrip(\'' + trip.id + '\')">Rename</button><button class="trip-detail__action danger" onclick="deleteTrip(\'' + trip.id + '\')">Delete collection</button></div></div>';

    if (trip.items.length === 0) {
        html += '<div class="trip-detail__empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><h3>No items yet</h3><p>Browse resorts and rooms, then tap the heart icon to save items to this collection.</p></div>';
    } else {
        /* Destination-first grouping: Destination → Resort → Rooms, Offers at the end.
           Resort items carry sub=destination (e.g. "Oahu, Hawaii").
           Room items carry sub=resortName (e.g. "OUTRIGGER Reef Waikiki Beach Resort").
           Two-pass: first index resorts so rooms can find their destination. */
        var offerItems = [];
        var destMap = {};
        var destOrder = [];

        var resortUrlsMap = {
            'OUTRIGGER Reef Waikiki Beach Resort': 'https://www.outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort',
            'OUTRIGGER Waik\u012Bk\u012B Paradise Hotel': 'https://www.outrigger.com/hawaii/oahu/outrigger-waikiki-paradise-hotel',
            'OUTRIGGER Waikiki Beach Resort': 'https://www.outrigger.com/hawaii/oahu/outrigger-waikiki-beach-resort'
        };
        var resortImgMap = {
            'OUTRIGGER Reef Waikiki Beach Resort': 'https://www.outrigger.com/AdaptiveImages/optimizely/753dec1f-a09b-42b5-85f5-44a03e3c5b4a/outrigger-reef-waikiki-beach-resort-coral-reef-penthouse-2-bedroom-suite-11.jpg?quality=100&width=700&height=393&stamp=cf85c663435ead22a0f47d4bec2162a1466a4886&format=webp',
            'OUTRIGGER Waikiki Beach Resort': 'https://www.outrigger.com/AdaptiveImages/optimizely/b1c81086-a2b1-46b2-96c8-064a18400d6f/outrigger-waikiki-beach-resort-exterior-1.jpg?quality=100&width=700&height=391&stamp=3d81afea29f058bbf289dade28b1b2355b22d0b3&format=webp',
            'OUTRIGGER Waikīkī Paradise Hotel': 'https://www.outrigger.com/AdaptiveImages/optimizely/27cfc36f-efb3-4d16-a2f6-b796fa863261/ohana-waikiki-east-pool-lifestyle-20.jpg?quality=100&width=700&height=467&stamp=b175cee916f8da0f9b787960bb02d471546f2979&format=webp'
        };
        var resortDescMap = {
            'OUTRIGGER Reef Waikiki Beach Resort': 'Home of authentic Hawaiian music & culture. A contemporary beachfront retreat just steps from the sand.',
            'OUTRIGGER Waikiki Beach Resort': 'An iconic beachfront resort on the sands of Waikiki with legendary views of Diamond Head.',
            'OUTRIGGER Waikīkī Paradise Hotel': 'A modern oasis in the heart of Waikiki, steps from world-class shopping, dining, and the beach.'
        };
        /* Title text for known offers — scraped from offers.html .card-value.
           Used as fallback for older favorited offers that don't have
           offer.title set (saved before the scraper captured it). */
        var offerTitleMap = {
            'Save up to 25%': 'Book direct for the best rates',
            'Ocean views on sale': 'Save more when you book our best views',
            'Limited Time Never-Ending Summer!': 'No resort charge & more!',
            'Stay longer and save': 'Longer-stay packages to enjoy our iconic destinations without rushing'
        };
        /* Resort line — scraped from offers.html .card-text. Fallback only. */
        var offerResortMap = {
            'Save up to 25%': 'at OUTRIGGER Reef Waikiki Beach Resort',
            'Ocean views on sale': 'at OUTRIGGER Reef Waikiki Beach Resort',
            'Limited Time Never-Ending Summer!': 'at OUTRIGGER Reef Waikiki Beach Resort',
            'Stay longer and save': 'at OUTRIGGER Reef Waikiki Beach Resort'
        };
        var roomDescMap = {
            'Oceanfront Suite': 'Unforgettable sunrises and sunsets with dramatic views of Diamond Head and the Pacific Ocean.',
            'Diamond Head Oceanfront': 'Soak in sweeping views of the Pacific from your private lanai in a space designed for effortless comfort and island ease.',
            'Coral Reef Penthouse Suite': 'Enjoy the ultimate Waikiki experience in this penthouse suite with two bedrooms, a private elevator and lanai with an unbeatable view of iconic Diamond Head.',
            'Club 1 Bedroom Oceanfront Suite': 'A vacation haven where the sky meets the sea.',
            'Grand Navigator Suite': 'Luxurious and spacious with breathtaking views of Waikiki Beach and Diamond Head.'
        };
        /* Maps resort name → destination label, used when the resort itself isn't favorited */
        var resortToDestMap = {
            'OUTRIGGER Reef Waikiki Beach Resort': 'Oahu, Hawaii',
            'OUTRIGGER Waik\u012Bk\u012B Paradise Hotel': 'Oahu, Hawaii',
            'OUTRIGGER Waikiki Beach Resort': 'Oahu, Hawaii'
        };

        var ensureDest = function(dest) {
            if (!destMap[dest]) { destMap[dest] = { resorts: {}, resortOrder: [] }; destOrder.push(dest); }
        };
        var ensureResort = function(dest, resortName) {
            ensureDest(dest);
            if (!destMap[dest].resorts[resortName]) {
                destMap[dest].resorts[resortName] = { resortItem: null, rooms: [] };
                destMap[dest].resortOrder.push(resortName);
            }
        };

        /* Pass 1: index resorts and offers.
           Prefer the canonical destination from resortToDestMap so previously
           saved items with stale `sub` (e.g. plain "Hawaii") get re-grouped
           under the right island. */
        trip.items.forEach(function(item) {
            if (item.type === 'Offer') {
                offerItems.push(item);
            } else if (item.type === 'Resort') {
                var dest = resortToDestMap[item.name] || item.sub || 'Hawaii';
                ensureResort(dest, item.name);
                destMap[dest].resorts[item.name].resortItem = item;
            }
        });

        /* Pass 2: rooms — resorts now indexed so we can find their destination */
        trip.items.forEach(function(item) {
            if (item.type === 'Room') {
                var resortName = item.sub || 'Unknown Resort';
                var dest = null;
                for (var di = 0; di < destOrder.length; di++) {
                    if (destMap[destOrder[di]].resorts[resortName]) { dest = destOrder[di]; break; }
                }
                if (!dest) dest = resortToDestMap[resortName] || resortName;
                ensureResort(dest, resortName);
                destMap[dest].resorts[resortName].rooms.push(item);
            }
        });

        var heartSVG = '<svg viewBox="0 0 24 24"><path class="heart-outline" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
        var renderItemCard = function(item, tripId, url) {
    if(item.cardHTML){
      var h='<div class="fav-cloned-card" style="position:relative;">';
      h+=item.cardHTML;
      h+='<div class="fav-cloned-card__overlay" style="position:absolute;top:8px;right:8px;display:flex;gap:6px;z-index:10;">';
      h+='<button class="favorite-btn is-favorited" onclick="removeItemFromTrip(\''+tripId+'\',\''+item.id+'\')" style="position:static;">'+heartSVG+'</button>';
      h+='</div>';
      h+='<button class="fav-item-card__remove" onclick="removeItemFromTrip(\''+tripId+'\',\''+item.id+'\')" style="display:block;margin:4px auto 0;padding:6px 12px;background:none;border:none;color:#999;font-size:12px;cursor:pointer;font-family:var(--ff-body);">Remove</button>';
      h+='</div>';
      return h;
    }
            var h = '<div class="fav-item-card' + (item.type === 'Resort' ? ' fav-item-card--resort' : '') + '">';
            h += '<div class="fav-item-card__img-wrap"><img class="fav-item-card__img" src="' + item.img + '"><span class="fav-item-card__type">' + item.type + '</span>';
            h += '<button class="favorite-btn is-favorited" onclick="removeItemFromTrip(\'' + tripId + '\',\'' + item.id + '\')">' + heartSVG + '</button></div>';
            h += '<div class="fav-item-card__body"><div class="fav-item-card__title"><a href="' + url + '" target="_blank" style="color:inherit;text-decoration:none;">' + item.name + '</a></div>';
            h += '<div class="fav-item-card__cta"><a href="' + url + '" target="_blank" class="fav-item-card__book">Book Now &rsaquo;</a>';
            h += '<button class="fav-item-card__remove" onclick="removeItemFromTrip(\'' + tripId + '\',\'' + item.id + '\')">Remove</button></div></div></div>';
            return h;
        };
        /* Resort card for a resort that exists structurally but isn't favorited yet.
           White bg, outline heart. Clicking the heart adds it to the collection. */
        var renderUnfavoritedResortCard = function(resortName, img, url, tripId, destName) {
            /* encodeURIComponent avoids double-quote/single-quote conflicts in onclick attr */
            var info = encodeURIComponent(JSON.stringify({ name: resortName, img: img, url: url, dest: destName }));
            var h = '<div class="fav-item-card fav-item-card--resort-unfav">';
            h += '<div class="fav-item-card__img-wrap"><img class="fav-item-card__img" src="' + img + '"><span class="fav-item-card__type">Resort</span>';
            h += '<button class="favorite-btn" title="Save resort" onclick="addResortToFavorites(\'' + tripId + '\',\'' + info + '\')">' + heartSVG + '</button></div>';
            h += '<div class="fav-item-card__body"><div class="fav-item-card__title"><a href="' + url + '" target="_blank" style="color:inherit;text-decoration:none;">' + resortName + '</a></div>';
            h += '<div class="fav-item-card__cta"><a href="' + url + '" target="_blank" class="fav-item-card__book">Book Now &rsaquo;</a></div></div></div>';
            return h;
        };

        /* ---- Render destination groups (banner + rail hierarchy) ---- */
        destOrder.forEach(function(dest) {
            var destData = destMap[dest];
            var totalItems = 0;
            destData.resortOrder.forEach(function(rn) {
                var rg = destData.resorts[rn];
                if (rg.resortItem) totalItems++;
                totalItems += rg.rooms.length;
            });

            /* Destination header */
            html += '<div class="fav-dest-header"><div class="fav-dest-header__name">' + dest + '</div>';
            html += '<div class="fav-dest-header__count">' + totalItems + ' saved</div></div>';

            destData.resortOrder.forEach(function(resortName) {
                var rg = destData.resorts[resortName];
                var isFavorited = !!rg.resortItem;
                var resortUrl = (rg.resortItem && rg.resortItem.hotelUrl) || (rg.rooms.length > 0 ? rg.rooms[0].hotelUrl : null) || resortUrlsMap[resortName] || '#';
                var resortImg = (rg.resortItem && rg.resortItem.img) || resortImgMap[resortName] || (rg.rooms.length > 0 ? rg.rooms[0].img : '');
                var resortDesc = (rg.resortItem && rg.resortItem.desc) || resortDescMap[resortName] || '';
                var resortEyebrow = (resortToDestMap[resortName] || dest || 'Hawaii');

                /* Reused rooms-page grid: 3 cols, resort card spans 2, rooms wrap */
                html += '<div class="fav-collection-rooms">';

                /* Resort card — rooms.html .promo-card pattern, spans 2 cols */
                html += '<div class="card card-image-overlay promo-card fav-resort-card">';
                html += '<div class="card-body" style="background-image:url(\'' + resortImg + '\');">';
                html += '<div class="card-slider-eyebrow">' + resortEyebrow.toUpperCase() + '</div>';
                html += '<div class="card-title">' + resortName + '</div>';
                if (resortDesc) {
                    html += '<div class="card-text"><p>' + resortDesc + '</p></div>';
                }
                html += '<div class="card-cta-info">';
                html += '<a href="' + resortUrl + '" target="_blank" class="button">Book Now <span class="icon-arrow"><svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m4.5,3.49174l4,4l-4,4" stroke="#ffffff" stroke-width="2"></path></svg></span></a>';
                html += '</div></div>';
                /* Heart overlay on the resort card */
                if (isFavorited) {
                    html += '<button class="favorite-btn is-favorited fav-overlay-heart" onclick="removeItemFromTrip(\'' + trip.id + '\',\'' + rg.resortItem.id + '\')">' + heartSVG + '</button>';
                } else {
                    var info = encodeURIComponent(JSON.stringify({ name: resortName, img: resortImg, url: resortUrl, dest: resortToDestMap[resortName] || dest }));
                    html += '<button class="favorite-btn fav-overlay-heart" title="Save resort" onclick="addResortToFavorites(\'' + trip.id + '\',\'' + info + '\')">' + heartSVG + '</button>';
                }
                html += '</div>';

                /* Render all favorited rooms */
                rg.rooms.forEach(function(room) {
                    var roomUrl = room.roomUrl || room.hotelUrl || '#';
                    var roomDesc = room.desc || roomDescMap[room.name] || '';
                    /* Reused rooms-page .card.loaded markup — simplified slider with one image */
                    html += '<div class="card loaded">';
                    html += '<div class="card-simplified-slider">';
                    html += '<div class="carousel slide">';
                    html += '<div class="carousel-inner">';
                    html += '<div class="carousel-item active"><img class="d-block w-100" src="' + room.img + '" alt="' + room.name + '"></div>';
                    html += '</div></div></div>';
                    html += '<div class="card-body">';
                    html += '<a class="card-title" href="' + roomUrl + '" target="_blank"><span>' + room.name + '</span></a>';
                    if (roomDesc) html += '<div class="card-text">' + roomDesc + '</div>';
                    html += '<div class="card-cta-info">';
                    html += '<a href="' + roomUrl + '" target="_blank" class="button">Check Availability <span class="icon-arrow"><svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m4.5,3.49174l4,4l-4,4" stroke="#332926" stroke-width="2"></path></svg></span></a>';
                    html += '</div></div>';
                    /* Heart overlay */
                    html += '<button class="favorite-btn is-favorited fav-overlay-heart" onclick="removeItemFromTrip(\'' + trip.id + '\',\'' + room.id + '\')">' + heartSVG + '</button>';
                    html += '</div>';
                });

                /* Always-show search tile after the last room so the player can
                   add more rooms to this resort regardless of how many are
                   already favorited. */
                html += '<a class="fav-empty-room-tile" href="' + resortUrl + '" target="_blank">';
                html += '<div class="fav-empty-room-tile__inner">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="20" y2="20"/></svg>';
                html += '<div class="fav-empty-room-tile__label">Explore Rooms & Suites</div>';
                html += '</div></a>';

                html += '</div>'; /* close .fav-collection-rooms */
            });
        });

        /* ---- Offers section — separate gold accent area ---- */
        if (offerItems.length > 0) {
            html += '<div class="offers-section-header"><div class="offers-section-header__name">Offers</div></div>';
            html += '<div class="offers-grid">';
            offerItems.forEach(function(offer) {
                var offerUrl = offer.offerUrl || '#';
                // Mirror the real outrigger offer card on demo-2/index.html:
                //   <div class="card card-padding">
                //     <img>
                //     <div class="card-body">
                //       <a class="card-title"><span>eyebrow</span></a>
                //       <div class="card-value">title</div>
                //       <div class="card-text">resort line</div>
                //       <div class="card-cta-info"><a class="button">Check availability</a></div>
                //     </div>
                //   </div>
                // Outrigger main.css already styles this markup correctly.
                var eyebrow = offer.name || '';
                var title = offer.title || offerTitleMap[offer.name] || '';
                var resortLine = offer.resortName || offerResortMap[offer.name] || '';
                html += '<div class="card card-padding fav-offer-tile">';
                html += '<img src="' + offer.img + '" alt="">';
                html += '<button class="favorite-btn is-favorited fav-overlay-heart" onclick="removeItemFromTrip(\'' + trip.id + '\',\'' + offer.id + '\')">' + heartSVG + '</button>';
                html += '<div class="card-body">';
                if (eyebrow) html += '<a href="' + offerUrl + '" target="_blank" class="card-title"><span>' + eyebrow + '</span></a>';
                if (title) html += '<div class="card-value">' + title + '</div>';
                if (resortLine) html += '<div class="card-text">' + resortLine + '</div>';
                html += '<div class="card-cta-info">';
                html += '<a href="' + offerUrl + '" target="_blank" class="button">Check availability <span class="icon-arrow"><svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m4.5,3.49174l4,4l-4,4" stroke="#332926" stroke-width="2"></path></svg></span></a>';
                html += '</div></div></div>';
            });
            /* Always-show explore-offers tile after the last offer so
               the player can browse more offers from inside the collection. */
            html += '<a class="fav-empty-room-tile" href="https://www.outrigger.com/offers" target="_blank">';
            html += '<div class="fav-empty-room-tile__inner">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="20" y2="20"/></svg>';
            html += '<div class="fav-empty-room-tile__label">Explore Offers</div>';
            html += '</div></a>';
            html += '</div>';
        }
    }
    html += '</div>';
    el.innerHTML = html;
}

function viewTrip(id) { state.currentTripView = id; renderFavoritesPage(); }
function toggleRooms(railId, btn, count) {
    var wrap = document.getElementById(railId);
    if (!wrap) return;
    var isExpanded = wrap.classList.contains('room-rail-wrap--expanded');
    if (isExpanded) {
        wrap.classList.remove('room-rail-wrap--expanded');
        wrap.classList.add('room-rail-wrap--collapsed');
        btn.innerHTML = '<span class="resort-banner__toggle-chevron resort-banner__toggle-chevron--down">&#9650;</span> <span class="resort-banner__toggle-text">Show Rooms (' + count + ')</span>';
    } else {
        wrap.classList.remove('room-rail-wrap--collapsed');
        wrap.classList.add('room-rail-wrap--expanded');
        btn.innerHTML = '<span class="resort-banner__toggle-chevron resort-banner__toggle-chevron--up">&#9650;</span> <span class="resort-banner__toggle-text">Hide Rooms (' + count + ')</span>';
    }
}

function backToTrips() { state.currentTripView = null; renderFavoritesPage(); }

function addResortToFavorites(tripId, infoJson) {
    var info = JSON.parse(decodeURIComponent(infoJson));
    var trip = state.trips.find(function(t) { return t.id === tripId; });
    if (!trip) return;
    var already = trip.items.some(function(i) { return i.type === 'Resort' && i.name === info.name; });
    if (already) return;
    trip.items.push({ id: 'resort-' + Date.now(), type: 'Resort', name: info.name, sub: info.dest, img: info.img, hotelUrl: info.url });
    saveState();
    syncUI();
    renderFavoritesPage();
    toast('Saved "' + info.name + '"');
}

function removeItemFromTrip(tripId, itemId) {
    const trip = state.trips.find(t => t.id === tripId);
    if (trip) {
        // Cascade: if removing a Resort, also remove every Room
        // saved under that resort (i.e. item.sub === resort.name).
        var removed = trip.items.find(function(i) { return i.id === itemId; });
        var cascadeResortName = (removed && removed.type === 'Resort') ? removed.name : null;
        trip.items = trip.items.filter(function(i) { return i.id !== itemId; });
        if (cascadeResortName) {
            trip.items = trip.items.filter(function(i) {
                return !(i.type === 'Room' && i.sub === cascadeResortName);
            });
        }
    }
    // Also un-heart on the page
    const btn = document.querySelector('.favorite-btn[data-id="' + itemId + '"]');
    if (btn) btn.classList.remove('is-favorited');
    toast('Removed from "' + (trip ? trip.name : 'collection') + '"');
    syncUI();
    renderFavoritesPage();
}

function createTripFromPage() {
    document.getElementById('createCollectionInput').value = '';
    openModal('createCollectionModal');
    setTimeout(function() { document.getElementById('createCollectionInput').focus(); }, 100);
}
function confirmCreateCollection() {
    const name = document.getElementById('createCollectionInput').value.trim();
    if (!name) return;
    state.trips.push({ id: 'trip-' + Date.now(), name: name, items: [] });
    closeModal('createCollectionModal');
    toast('Collection "' + name + '" created');
    syncUI();
    renderFavoritesPage();
}

// ============================
// RENAME / DELETE TRIPS
// ============================
function renameTrip(id) {
    state.renamingTripId = id;
    const trip = state.trips.find(t => t.id === id);
    document.getElementById('renameInput').value = trip ? trip.name : '';
    openModal('renameModal');
    setTimeout(() => document.getElementById('renameInput').select(), 100);
}
function confirmRename() {
    const name = document.getElementById('renameInput').value.trim();
    if (!name) return;
    const trip = state.trips.find(t => t.id === state.renamingTripId);
    if (trip) trip.name = name;
    closeModal('renameModal');
    toast('Collection renamed');
    syncUI();
    renderFavoritesPage();
}
function deleteTrip(id) {
    state.deletingTripId = id;
    const trip = state.trips.find(t => t.id === id);
    document.getElementById('deleteMsg').textContent = 'Delete "' + (trip ? trip.name : '') + '"? All saved items in this trip will be removed.';
    openModal('deleteModal');
}
function confirmDelete() {
    if (state.deletingItemId) {
        // Deleting a single item
        state.deletingItemId = null;
    } else {
        // Deleting a trip
        const trip = state.trips.find(t => t.id === state.deletingTripId);
        if (trip) {
            trip.items.forEach(item => {
                const btn = document.querySelector('.favorite-btn[data-id="' + item.id + '"]');
                if (btn) btn.classList.remove('is-favorited');
            });
        }
        state.trips = state.trips.filter(t => t.id !== state.deletingTripId);
        if (state.currentTripView === state.deletingTripId) state.currentTripView = null;
    }
    closeModal('deleteModal');
    toast('Deleted');
    syncUI();
    renderFavoritesPage();
}

// ============================
// TRAY
// ============================
/* ── Mobile Navigation ── */
function openMobileNav() {
    document.getElementById('mobileNav').classList.add('open');
    document.getElementById('mobileNavBackdrop').classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeMobileNav() {
    document.getElementById('mobileNav').classList.remove('open');
    document.getElementById('mobileNavBackdrop').classList.remove('show');
    document.body.style.overflow = '';
}

function toggleTray() {
    const tray = document.getElementById('favTray');
    const bd = document.getElementById('trayBackdrop');
    if (tray.classList.contains('open')) { closeTray(); } else {
        tray.classList.add('open'); bd.classList.add('show');
        renderTray();
    }
}
function closeTray() {
    document.getElementById('favTray').classList.remove('open');
    document.getElementById('trayBackdrop').classList.remove('show');
}
function renderTray() {
    const body = document.getElementById('trayBody');
    const allItems = state.trips.flatMap(t => t.items.map(i => ({ ...i, tripName: t.name, tripId: t.id })));
    let html = '';

    /* ── SECTION 1: MY FAVORITES ── */
    html += '<div class="fav-tray__section-header"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> My Favorites</div>';

    if (!state.hasRIID) {
        /* ── STATE 1: Not signed up — entice them to create an account ── */
        html += '<div class="fav-tray__signup-cta">';
        html += '<div class="fav-tray__signup-icon"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0F4A5A" stroke-width="1.2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>';
        html += '<div class="fav-tray__signup-title">Save your dream getaway</div>';
        html += '<div class="fav-tray__signup-desc">Sign up to save your favorite resorts and rooms across devices. Build collections and plan your perfect beach escape.</div>';
        html += '<button class="fav-tray__signup-btn" onclick="openModal(\'emailModal\');">Sign Up to Save Favorites &rsaquo;</button>';
        html += '</div>';
    } else if (allItems.length === 0) {
        /* ── STATE 2: Signed up but no saved items ── */
        html += '<div class="fav-tray__empty-inline">';
        html += '<div class="fav-tray__empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>';
        html += '<div class="fav-tray__empty-text">You haven\'t saved any favorites yet. Browse resorts and rooms, then tap the heart icon to start building your collection.</div>';
        html += '</div>';
        html += '<button class="fav-tray__view-all-btn" onclick="switchView(\'view-favorites\');closeTray();">View All Favorites</button>';
    } else {
        /* ── STATE 3: Signed up with saved items — Collection cards (Option A) ── */
        var MAX_CARDS = 3;
        var visibleTrips = state.trips.slice(0, MAX_CARDS);
        var remainingCount = state.trips.length - MAX_CARDS;

        /* Render each collection as a mini-card with thumbnail strip */
        visibleTrips.forEach(function(t) {
            var onclick = "openCollection('" + t.id + "');";
            html += '<div class="fav-tray__card" onclick="' + onclick + '">';

            /* Thumbnail strip — show up to 3 images */
            html += '<div class="fav-tray__card-thumbs">';
            var thumbItems = t.items.slice(0, 3);
            var placeholderSVG = '<svg viewBox="0 0 24 24" fill="#c0392b" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
            if (thumbItems.length === 0) {
                /* Empty collection — 3 placeholders */
                for (var p = 0; p < 3; p++) {
                    html += '<div class="fav-tray__card-placeholder">' + placeholderSVG + '</div>';
                }
            } else {
                thumbItems.forEach(function(item) {
                    html += '<img src="' + item.img + '" alt="' + item.name + '">';
                });
                /* Fill remaining slots with placeholders */
                for (var p = thumbItems.length; p < 3; p++) {
                    html += '<div class="fav-tray__card-placeholder">' + placeholderSVG + '</div>';
                }
            }
            html += '</div>';

            /* Card body — name, count, chevron */
            html += '<div class="fav-tray__card-body">';
            html += '<div><div class="fav-tray__card-name">' + t.name + '</div>';
            html += '<div class="fav-tray__card-count">' + t.items.length + ' item' + (t.items.length !== 1 ? 's' : '') + ' saved</div></div>';
            html += '<svg class="fav-tray__card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
            html += '</div></div>';
        });

        /* "View X more collections" CTA if there are more than MAX_CARDS */
        if (remainingCount > 0) {
            html += '<button class="fav-tray__more-collections" onclick="switchView(\'view-favorites\');closeTray();">View ' + remainingCount + ' more collection' + (remainingCount !== 1 ? 's' : '') + ' &rsaquo;</button>';
        }

        html += '<button class="fav-tray__view-all-btn" onclick="switchView(\'view-favorites\');closeTray();">View All Favorites</button>';
    }

    /* ── SECTION 2: TRIP PLANNER QUIZ — warm bg shift ── */
    html += '<div class="fav-tray__quiz-section">';
    html += '<div class="fav-tray__section-header"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Trip Planner Quiz</div>';
    html += '<div class="fav-tray__quiz-cta">';
    html += '<a href="https://www.outrigger.com/travel-quiz" target="_blank" class="fav-tray__quiz-card">';
    html += '<div class="fav-tray__quiz-img"><img src="https://www.outrigger.com/AdaptiveImages/optimizely/35db8bff-1364-44e0-9423-ae0ddb4d9afd/outrigger-reef-waikiki-beach-resort-aerial-1.jpg?quality=100&width=700&height=424&stamp=0c4b71706d3f18532958ef295842c5a7ea0c991b&format=webp" alt="Travel Quiz"></div>';
    html += '<div class="fav-tray__quiz-content">';
    html += '<div class="fav-tray__quiz-eyebrow">OUTRIGGER TRAVEL QUIZ</div>';
    html += '<div class="fav-tray__quiz-title">Where should you go next?</div>';
    html += '<div class="fav-tray__quiz-desc">Take our quick, five-question quiz to see which tropical destination fits your travel dreams.</div>';
    html += '<div class="fav-tray__quiz-btn">Take the quiz &rsaquo;</div>';
    html += '</div></a></div>';
    html += '</div>';

    body.innerHTML = html;
    // Update footer and badge
    document.getElementById('trayFooter').style.display = 'none'; // Footer no longer needed, CTA is inline
    const total = allItems.length;
    const badge = document.getElementById('trayBadge');
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}
function removeTrayItem(tripId, itemId) {
    const trip = state.trips.find(t => t.id === tripId);
    if (trip) trip.items = trip.items.filter(i => i.id !== itemId);
    const btn = document.querySelector('.favorite-btn[data-id="' + itemId + '"]');
    if (btn) btn.classList.remove('is-favorited');
    renderTray();
    syncUI();
    toast('Removed');
}

// ============================
// UTILITIES
// ============================
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function switchView(id) {
  closeTray();
  if (id === "view-favorites") {
    showFavoritesOverlay();
  }
}

function syncUI() {
    var total = state.trips.reduce(function(s, t) { return s + t.items.length; }, 0);
    
    // Update tray badge
    var trayBadge = document.getElementById('trayBadge');
    if (trayBadge) {
        trayBadge.textContent = total;
        trayBadge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
    
    // Update demo nav count
    var demoCount = document.getElementById('favDemoCount');
    if (demoCount) demoCount.textContent = total > 0 ? ' (' + total + ')' : '';
    
    // Update header Trip Planner badge if it exists  
    var headerBadge = document.getElementById('headerBadge');
    if (headerBadge) {
        var prevCount = parseInt(headerBadge.textContent) || 0;
        headerBadge.textContent = total > 99 ? '99+' : total;
        headerBadge.classList.toggle('show', total > 0);
        if (total > prevCount && total > 0) {
            headerBadge.classList.remove('pop');
            void headerBadge.offsetWidth;
            headerBadge.classList.add('pop');
        }
    }
    
    // Inject badge onto Outrigger header Trip Planner button if not already there
    var tpBtn = document.querySelector('[data-bs-target="#favoritesOffcanvas"], .header-trip-planner, [aria-label*="Trip Planner"]');
    if (tpBtn && !tpBtn.querySelector('.fav-injected-badge')) {
        tpBtn.style.position = 'relative';
        tpBtn.style.overflow = 'visible';
        // Also fix overflow on parent containers up the chain
        var p = tpBtn.parentElement;
        while (p && p !== document.body) {
            var cs = getComputedStyle(p);
            if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow.includes('hidden')) {
                p.style.overflow = 'visible';
            }
            p = p.parentElement;
        }
        var b = document.createElement('span');
        b.className = 'fav-injected-badge';
        b.id = 'headerBadge';
        b.style.cssText = 'position:absolute;top:-6px;right:-8px;background:#E04F5F;color:#fff;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:none;align-items:center;justify-content:center;padding:0 5px;pointer-events:none;z-index:10;';
        tpBtn.appendChild(b);
        // Wire click to our tray
        tpBtn.removeAttribute('data-bs-toggle');
        tpBtn.removeAttribute('data-bs-target');
        tpBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggleTray(); });
    }
    var injBadge = document.querySelector('.fav-injected-badge');
    if (injBadge) {
        injBadge.textContent = total > 99 ? '99+' : total;
        injBadge.style.display = total > 0 ? 'flex' : 'none';
    }
    
    // Persist to localStorage
    saveState();
}

function toast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastText').textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function resetAll() {
    state.hasRIID = false;
    state.email = '';
    state.trips = [{ id: 'trip-1', name: 'My Favorites', items: [] }];
    state.currentTripView = null;
    document.querySelectorAll('.favorite-btn').forEach(b => b.classList.remove('is-favorited'));
    (document.getElementById('emailInput')||{}).value = '';
    var _tc = document.getElementById('tcCheck'); if(_tc) _tc.checked = false;
    var _rc = document.getElementById('recaptchaBox'); if(_rc) _rc.classList.remove('checked');
    try { localStorage.removeItem('outrigger_proto_state'); } catch(e) {}
    closeTray();
    syncUI();
    renderFavoritesPage();
    toast('Reset! Starting fresh as unknown user.');
}

// Init — restore saved state then update UI


// ── Init on page load ───────────────────────────────────────────

// ── Favorites Full Page (navigate to favorites.html) ──────────────────────
function openCollection(tripId) {
  closeTray();
  if (window.location.pathname.indexOf('favorites.html') !== -1) {
    state.currentTripView = tripId;
    renderFavoritesPage();
    return;
  }
  window.location.href = '/demo-2/favorites.html?trip=' + encodeURIComponent(tripId);
}

function showFavoritesOverlay() {
  // If we're already on favorites.html, just render in place
  if (window.location.pathname.indexOf('favorites.html') !== -1) {
    renderFavoritesPage();
    return;
  }
  // Navigate to the dedicated favorites page
  window.location.href = '/demo-2/favorites.html';
}

function closeFavoritesOverlay() {
  // Go back to previous page
  if (document.referrer && document.referrer.indexOf('/demo-2/') !== -1) {
    window.history.back();
  } else {
    window.location.href = '/demo-2/';
  }
}

// Monkey-patch renderFavoritesPage to target overlay body if overlay is open
var _origRenderFavoritesPage = typeof renderFavoritesPage === "function" ? renderFavoritesPage : null;


function initFavorites() {
  injectHeartsOnCards();
  document.querySelectorAll('.room-and-suites-slider .favorite-btn').forEach(function(b){b.remove();});
  injectDemoNav();
  loadState();
  syncUI();
  updateDemoCount();
  initPropertyCarouselArrows();
}

function initPropertyCarouselArrows() {
  var slider = document.querySelector('.destination-selection-slider');
  if (!slider) return;
  var wrapper = slider.querySelector('.swiper-wrapper');
  var nextBtn = slider.querySelector('.swiper-button-next');
  var prevBtn = slider.querySelector('.swiper-button-prev');
  if (!wrapper || !nextBtn) return;
  var slideW = 0;
  var firstSlide = slider.querySelector('.swiper-slide');
  if (firstSlide) slideW = firstSlide.offsetWidth + parseInt(getComputedStyle(firstSlide).marginRight || '0') + parseInt(getComputedStyle(firstSlide).marginLeft || '0');
  function updateArrows() {
    if (prevBtn) prevBtn.style.display = wrapper.scrollLeft > 10 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = (wrapper.scrollLeft + wrapper.clientWidth) >= (wrapper.scrollWidth - 10) ? 'none' : '';
  }
  nextBtn.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    wrapper.scrollLeft += (slideW || 500);
    setTimeout(updateArrows, 400);
  });
  if (prevBtn) {
    prevBtn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      wrapper.scrollLeft -= (slideW || 500);
      setTimeout(updateArrows, 400);
    });
  }
  wrapper.addEventListener('scroll', function() { setTimeout(updateArrows, 100); });
  updateArrows();
}

function updateDemoCount() {
  var total = state.trips.reduce(function(s, t) { return s + t.items.length; }, 0);
  var el = document.getElementById("favDemoCount");
  if (el) el.textContent = total > 0 ? " (" + total + ")" : "";
}

// syncUI already handles demo count updates

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFavorites);
} else {
  initFavorites();
}
// Also retry after load in case Outrigger JS rebuilds cards
window.addEventListener("load", function() {
  setTimeout(function() {
    injectHeartsOnCards();
    document.querySelectorAll('.room-and-suites-slider .favorite-btn').forEach(function(b){b.remove();});
    loadState();
    syncUI();
  }, 300);
});


