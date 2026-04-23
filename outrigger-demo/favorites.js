(function () {
  'use strict';

  var STORAGE_KEY = 'outrigger_fav_demo';

  // ── State ─────────────────────────────────────────────────────────────────

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { items: {} }; }
    catch (e) { return { items: {} }; }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ── Badge ─────────────────────────────────────────────────────────────────

  function updateBadge() {
    var count = Object.keys(loadState().items).length;
    document.querySelectorAll('[data-bs-target="#favoritesOffcanvas"]').forEach(function (btn) {
      var badge = btn.querySelector('.fav-nav-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'fav-nav-badge';
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  function toggleFavorite(btn, id, name, imgSrc, url) {
    var state = loadState();
    if (state.items[id]) {
      delete state.items[id];
      btn.classList.remove('fav-active');
    } else {
      state.items[id] = { id: id, name: name, imgSrc: imgSrc, url: url, savedAt: Date.now() };
      btn.classList.add('fav-active');
    }
    saveState(state);
    updateBadge();
    renderOffcanvas();
  }

  // ── Offcanvas renderer ────────────────────────────────────────────────────

  function renderOffcanvas() {
    var body = document.querySelector('#favoritesOffcanvas .offcanvas-body');
    if (!body) return;
    var state = loadState();
    var items = Object.values(state.items);

    if (items.length === 0) {
      body.innerHTML =
        '<div class="fav-empty">' +
          '<svg viewBox="0 0 24 24" width="52" height="52" style="margin-bottom:14px">' +
            '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#ccc" stroke-width="1.5"/>' +
          '</svg>' +
          '<p class="fav-empty-text">Tap the heart on any property, room, or offer to save it here.</p>' +
        '</div>';
      return;
    }

    body.innerHTML =
      '<div class="fav-list">' +
      items.map(function (item) {
        var imgHtml = item.imgSrc
          ? '<img src="' + escHtml(item.imgSrc) + '" class="fav-item-img" alt="">'
          : '<div class="fav-item-img fav-item-img--empty"></div>';
        return (
          '<div class="fav-item">' +
            imgHtml +
            '<div class="fav-item-info"><div class="fav-item-name">' + escHtml(item.name) + '</div></div>' +
            '<button class="fav-item-remove" aria-label="Remove" data-remove-id="' + escHtml(item.id) + '">' +
              '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
            '</button>' +
          '</div>'
        );
      }).join('') +
      '</div>';

    body.querySelectorAll('[data-remove-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeFavorite(btn.dataset.removeId); });
    });
  }

  function removeFavorite(id) {
    var state = loadState();
    delete state.items[id];
    saveState(state);
    var btn = document.querySelector('.fav-heart-btn[data-fav-id="' + id + '"]');
    if (btn) btn.classList.remove('fav-active');
    updateBadge();
    renderOffcanvas();
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Heart injection helpers ───────────────────────────────────────────────

  function makeHeart(id, name, imgSrc, url) {
    var btn = document.createElement('button');
    btn.className = 'fav-heart-btn';
    btn.setAttribute('aria-label', 'Save to favorites');
    btn.dataset.favId = id;
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path class="heart-path" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>' +
      '</svg>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(btn, id, name, imgSrc, url);
    });
    return btn;
  }

  function getFirstImg(card) {
    var img = card.querySelector('.carousel-item.active img') || card.querySelector('.carousel-item img') || card.querySelector('img');
    return img ? img.getAttribute('src') : '';
  }

  // ── Inject: homepage property cards ──────────────────────────────────────

  function injectPropertyHearts() {
    document.querySelectorAll('.card[property_id]').forEach(function (card) {
      var id = 'property-' + card.getAttribute('property_id');
      var name = card.getAttribute('property_name') || 'Resort';
      var imgSrc = getFirstImg(card);
      var link = card.querySelector('a.card-title, a.card-view-property');
      var url = link ? link.href : '#';
      var slider = card.querySelector('.card-simplified-slider');
      if (!slider) return;
      slider.style.position = 'relative';
      slider.appendChild(makeHeart(id, name, imgSrc, url));
    });
  }

  // ── Inject: room cards ────────────────────────────────────────────────────

  function injectRoomHearts() {
    document.querySelectorAll('.card.loaded[data-room-id]').forEach(function (card) {
      var rawId = card.getAttribute('data-room-id') || '';
      var id = 'room-' + rawId.replace(/[^a-z0-9]/gi, '-');
      var name = card.getAttribute('room_type_name') || rawId || 'Room';
      var imgSrc = getFirstImg(card);
      var link = card.querySelector('a.card-view-property, a.card-title');
      var url = link ? link.href : '#';
      var slider = card.querySelector('.card-simplified-slider');
      if (!slider) return;
      slider.style.position = 'relative';
      slider.appendChild(makeHeart(id, name, imgSrc, url));
    });
  }

  // ── Inject: offer cards ───────────────────────────────────────────────────

  function injectOfferHearts() {
    document.querySelectorAll('.card.swiper-slide:not(.promo-card):not(.card-image-overlay)').forEach(function (card, i) {
      var titleEl = card.querySelector('.card-title, span.card-title');
      var name = titleEl ? titleEl.textContent.trim() : ('Offer ' + (i + 1));
      var id = 'offer-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
      var imgSrc = getFirstImg(card);
      // Offer cards have img as a direct child; inject heart into card itself
      card.style.position = 'relative';
      card.appendChild(makeHeart(id, name, imgSrc, '#'));
    });
  }

  // ── Restore saved hearts ──────────────────────────────────────────────────

  function restoreHearts() {
    var saved = loadState().items;
    document.querySelectorAll('.fav-heart-btn').forEach(function (btn) {
      if (saved[btn.dataset.favId]) btn.classList.add('fav-active');
    });
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = [
      /* Heart button */
      '.fav-heart-btn{position:absolute;top:10px;right:10px;z-index:30;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.88);backdrop-filter:blur(4px);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:transform .2s,background .2s;box-shadow:0 2px 8px rgba(0,0,0,.2);}',
      '.fav-heart-btn:hover{transform:scale(1.1);background:#fff;}',
      '.fav-heart-btn:active{transform:scale(.94);}',
      '.fav-heart-btn svg{width:18px;height:18px;}',
      '.fav-heart-btn .heart-path{fill:none;stroke:#555;stroke-width:1.5;transition:fill .25s,stroke .25s;}',
      '.fav-heart-btn.fav-active .heart-path{fill:#E04F5F;stroke:#E04F5F;animation:favHeartPop .35s ease;}',
      '@keyframes favHeartPop{0%{transform:scale(1)}40%{transform:scale(1.35)}70%{transform:scale(.9)}100%{transform:scale(1)}}',
      /* Badge */
      '.fav-nav-badge{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;background:#E04F5F;color:#fff;font-size:10px;font-weight:700;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;line-height:1;pointer-events:none;}',
      /* Offcanvas content */
      '.fav-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:70px 24px;text-align:center;}',
      '.fav-empty-text{color:#999;font-size:14px;line-height:1.5;max-width:220px;margin:0;}',
      '.fav-list{padding:8px 0;}',
      '.fav-item{display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid #f0ede8;}',
      '.fav-item-img{width:68px;height:50px;object-fit:cover;border-radius:6px;flex-shrink:0;}',
      '.fav-item-img--empty{background:#e8e5de;}',
      '.fav-item-info{flex:1;min-width:0;}',
      '.fav-item-name{font-size:13px;font-weight:500;color:#1a1a1a;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
      '.fav-item-remove{width:28px;height:28px;border:none;background:transparent;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;color:#bbb;transition:color .15s,background .15s;}',
      '.fav-item-remove:hover{color:#E04F5F;background:#fef2f2;}',
      /* Demo nav bar */
      '.demo-nav-bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;gap:2px;background:#1a1a1a;border-radius:40px;padding:4px;box-shadow:0 4px 20px rgba(0,0,0,.35);}',
      '.demo-nav-bar a{color:#fff;font-size:12px;font-weight:600;text-decoration:none;padding:7px 16px;border-radius:36px;white-space:nowrap;transition:background .15s;letter-spacing:.02em;}',
      '.demo-nav-bar a:hover{background:rgba(255,255,255,.12);}',
      '.demo-nav-bar a.active{background:rgba(255,255,255,.18);}'
    ].join('');
    document.head.appendChild(style);
  }

  // ── Demo nav bar ──────────────────────────────────────────────────────────

  function injectDemoNav(activePage) {
    var nav = document.createElement('div');
    nav.className = 'demo-nav-bar';
    var pages = [
      { href: 'index.html', label: 'Resorts' },
      { href: 'rooms.html', label: 'Rooms & Suites' },
      { href: 'offers.html', label: 'Offers' }
    ];
    nav.innerHTML = pages.map(function (p) {
      var cls = p.href === activePage ? ' class="active"' : '';
      return '<a href="' + p.href + '"' + cls + '>' + p.label + '</a>';
    }).join('');
    document.body.appendChild(nav);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();

    var path = window.location.pathname;
    var page = path.split('/').pop() || 'index.html';
    injectDemoNav(page);

    if (document.querySelector('.card[property_id]')) injectPropertyHearts();
    if (document.querySelector('.card.loaded[data-room-id]')) injectRoomHearts();
    if (document.querySelector('.card.swiper-slide:not(.promo-card):not(.card-image-overlay) .card-title')) injectOfferHearts();

    restoreHearts();
    updateBadge();

    var offcanvas = document.getElementById('favoritesOffcanvas');
    if (offcanvas) {
      offcanvas.addEventListener('show.bs.offcanvas', renderOffcanvas);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
