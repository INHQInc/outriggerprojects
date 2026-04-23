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

  // ── Image preservation ────────────────────────────────────────────────────
  // Outrigger's JS replaces local img srcs with broken CDN paths. The early
  // MutationObserver in <head> catches attribute-changed images (65 non-card
  // images). For carousel imgs that are DOM-replaced fresh with CDN paths, we
  // fetch the HTML source and restore by matching property_id + slide index.

  function preserveImages() {
    document.querySelectorAll('img[src]').forEach(function (img) {
      var src = img.getAttribute('src');
      if (src && !img.hasAttribute('data-local-src') && src.indexOf('/AdaptiveImages') === -1) {
        img.setAttribute('data-local-src', src);
      }
    });
  }

  function restoreBrokenImages() {
    document.querySelectorAll('img[data-local-src]').forEach(function (img) {
      var local = img.getAttribute('data-local-src');
      if (local && img.naturalWidth === 0) {
        img.src = local;
      }
    });
  }

  // Fetch the saved HTML, extract original local srcs by slide index, apply to DOM.
  function fixCarouselImagesBySource() {
    fetch(window.location.pathname)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');

        // Property card carousel images
        document.querySelectorAll('.card[property_id] img[data-bs-slide-to]').forEach(function (liveImg) {
          if (liveImg.naturalWidth !== 0) return;
          var card = liveImg.closest('[property_id]');
          var propId = card && card.getAttribute('property_id');
          var slideTo = liveImg.getAttribute('data-bs-slide-to');
          if (!propId) return;
          var srcCard = doc.querySelector('[property_id="' + propId + '"]');
          var srcImg = srcCard && srcCard.querySelector('img[data-bs-slide-to="' + slideTo + '"]');
          var localSrc = srcImg && srcImg.getAttribute('src');
          if (localSrc && localSrc.indexOf('/AdaptiveImages') === -1) {
            liveImg.src = localSrc;
          }
        });

        // Room card carousel images
        document.querySelectorAll('.card[data-room-id] img[data-bs-slide-to]').forEach(function (liveImg) {
          if (liveImg.naturalWidth !== 0) return;
          var card = liveImg.closest('[data-room-id]');
          var roomId = card && card.getAttribute('data-room-id');
          var slideTo = liveImg.getAttribute('data-bs-slide-to');
          if (!roomId) return;
          var srcCard = doc.querySelector('[data-room-id="' + CSS.escape(roomId) + '"]');
          var srcImg = srcCard && srcCard.querySelector('img[data-bs-slide-to="' + slideTo + '"]');
          var localSrc = srcImg && srcImg.getAttribute('src');
          if (localSrc && localSrc.indexOf('/AdaptiveImages') === -1) {
            liveImg.src = localSrc;
          }
        });

        // Any remaining broken images with data-local-src
        restoreBrokenImages();
      })
      .catch(function () {});
  }

  // ── Custom Tray ───────────────────────────────────────────────────────────

  function injectTrayHTML() {
    if (document.getElementById('favTray')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="favTrayBackdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:99990;"></div>' +
      '<div id="favTray" style="position:fixed;top:0;right:-440px;width:420px;max-width:100vw;height:100%;background:#fff;z-index:99991;display:flex;flex-direction:column;transition:right .32s cubic-bezier(.4,0,.2,1);box-shadow:-4px 0 32px rgba(0,0,0,.18);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:22px 24px 18px;border-bottom:1px solid #f0ede8;flex-shrink:0;">' +
          '<div style="font-size:17px;font-weight:700;color:#1a1a1a;letter-spacing:-.01em;">Trip Planner</div>' +
          '<button id="favTrayClose" style="border:none;background:none;cursor:pointer;padding:6px;color:#888;border-radius:50%;line-height:0;" aria-label="Close tray">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +
        '<div id="favTrayBody" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>' +
      '</div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    document.getElementById('favTrayBackdrop').addEventListener('click', closeTray);
    document.getElementById('favTrayClose').addEventListener('click', closeTray);
  }

  function openTray() {
    var tray = document.getElementById('favTray');
    var bd = document.getElementById('favTrayBackdrop');
    if (!tray) return;
    renderTray();
    bd.style.display = 'block';
    tray.style.right = '0';
  }

  function closeTray() {
    var tray = document.getElementById('favTray');
    var bd = document.getElementById('favTrayBackdrop');
    if (!tray) return;
    tray.style.right = '-440px';
    bd.style.display = 'none';
  }

  function isTrayOpen() {
    var tray = document.getElementById('favTray');
    return tray && (tray.style.right === '0px' || tray.style.right === '0');
  }

  function toggleTray() {
    if (isTrayOpen()) { closeTray(); } else { openTray(); }
  }

  // Exposed globally so demo-nav inline onclick can call it
  window.__favToggleTray = toggleTray;
  window.__favOpenTray = openTray;
  window.__favCloseTray = closeTray;

  function renderTray() {
    var body = document.getElementById('favTrayBody');
    if (!body) return;
    var items = Object.values(loadState().items);

    if (items.length === 0) {
      body.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;text-align:center;">' +
          '<svg viewBox="0 0 24 24" width="56" height="56" style="margin-bottom:16px;opacity:.35">' +
            '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#888" stroke-width="1.5"/>' +
          '</svg>' +
          '<p style="color:#999;font-size:14px;line-height:1.6;max-width:210px;margin:0;">Tap the heart on any property, room, or offer to save it here.</p>' +
        '</div>';
      return;
    }

    body.innerHTML =
      '<div style="padding:8px 0;">' +
      items.map(function (item) {
        var imgHtml = item.imgSrc
          ? '<img src="' + escHtml(item.imgSrc) + '" style="width:76px;height:56px;object-fit:cover;border-radius:7px;flex-shrink:0;" alt="" loading="lazy">'
          : '<div style="width:76px;height:56px;border-radius:7px;background:#e8e5de;flex-shrink:0;"></div>';
        return (
          '<div style="display:flex;align-items:center;gap:12px;padding:13px 20px;border-bottom:1px solid #f4f1ec;">' +
            imgHtml +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:600;color:#1a1a1a;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escHtml(item.name) + '</div>' +
            '</div>' +
            '<button data-remove-id="' + escHtml(item.id) + '" aria-label="Remove" style="width:28px;height:28px;border:none;background:transparent;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;color:#ccc;transition:color .15s,background .15s;">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>' +
          '</div>'
        );
      }).join('') +
      '</div>';

    body.querySelectorAll('[data-remove-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeFavorite(btn.dataset.removeId); });
    });
  }

  // ── Badge ─────────────────────────────────────────────────────────────────

  function updateBadge() {
    var count = Object.keys(loadState().items).length;

    // Trip Planner nav button badge
    document.querySelectorAll('.fav-nav-badge').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });

    // Demo nav tray count label
    var label = document.getElementById('favDemoCount');
    if (label) label.textContent = count > 0 ? ' (' + count + ')' : '';
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
      openTray();
    }
    saveState(state);
    updateBadge();
    renderTray();
  }

  function removeFavorite(id) {
    var state = loadState();
    delete state.items[id];
    saveState(state);
    var btn = document.querySelector('.fav-heart-btn[data-fav-id="' + id + '"]');
    if (btn) btn.classList.remove('fav-active');
    updateBadge();
    renderTray();
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Wire Trip Planner nav button to custom tray ───────────────────────────

  function wireTripPlannerButton() {
    document.querySelectorAll('[data-bs-target="#favoritesOffcanvas"]').forEach(function (btn) {
      btn.removeAttribute('data-bs-toggle');
      btn.removeAttribute('data-bs-target');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTray();
      });
      // Inject badge if not already there
      if (!btn.querySelector('.fav-nav-badge')) {
        var badge = document.createElement('span');
        badge.className = 'fav-nav-badge';
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }
    });
  }

  // ── Heart helpers ─────────────────────────────────────────────────────────

  function getBestImgSrc(card) {
    var img = card.querySelector('.carousel-item.active img') ||
              card.querySelector('.carousel-item img') ||
              card.querySelector('.swiper-slide.swiper-slide-active img') ||
              card.querySelector('img');
    if (!img) return '';
    return img.getAttribute('data-local-src') || img.getAttribute('src') || '';
  }

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
      // Capture best current image at click time
      var card = btn.closest('.card, .swiper-slide');
      var currentSrc = card ? getBestImgSrc(card) : imgSrc;
      toggleFavorite(btn, id, name, currentSrc || imgSrc, url);
    });
    return btn;
  }

  // ── Inject: property cards (homepage) ────────────────────────────────────

  function injectPropertyHearts() {
    document.querySelectorAll('.card[property_id]').forEach(function (card) {
      if (card.querySelector('.fav-heart-btn')) return;
      var id = 'property-' + card.getAttribute('property_id');
      var name = card.getAttribute('property_name') || 'Resort';
      var imgSrc = getBestImgSrc(card);
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
      if (card.querySelector('.fav-heart-btn')) return;
      var rawId = card.getAttribute('data-room-id') || '';
      var id = 'room-' + rawId.replace(/[^a-z0-9]/gi, '-');
      var name = card.getAttribute('room_type_name') || rawId || 'Room';
      var imgSrc = getBestImgSrc(card);
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
    var sel = '.card.swiper-slide:not(.promo-card):not(.card-image-overlay):not([property_id]):not([data-room-id]):not(.loaded)';
    document.querySelectorAll(sel).forEach(function (card, i) {
      if (card.querySelector('.fav-heart-btn')) return;
      var titleEl = card.querySelector('.card-title, span.card-title');
      var name = titleEl ? titleEl.textContent.trim() : ('Offer ' + (i + 1));
      var id = 'offer-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
      var imgSrc = getBestImgSrc(card);
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
      '.fav-heart-btn{position:absolute;top:10px;right:10px;z-index:30;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.9);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:transform .2s,background .2s;box-shadow:0 2px 8px rgba(0,0,0,.22);}',
      '.fav-heart-btn:hover{transform:scale(1.1);background:#fff;}',
      '.fav-heart-btn:active{transform:scale(.93);}',
      '.fav-heart-btn svg{width:18px;height:18px;}',
      '.fav-heart-btn .heart-path{fill:none;stroke:#555;stroke-width:1.5;transition:fill .25s,stroke .25s;}',
      '.fav-heart-btn.fav-active .heart-path{fill:#E04F5F;stroke:#E04F5F;animation:favHeartPop .35s ease;}',
      '@keyframes favHeartPop{0%{transform:scale(1)}40%{transform:scale(1.35)}70%{transform:scale(.9)}100%{transform:scale(1)}}',
      /* Trip Planner nav badge */
      '.fav-nav-badge{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;background:#E04F5F;color:#fff;font-size:10px;font-weight:700;border-radius:8px;display:none;align-items:center;justify-content:center;padding:0 3px;line-height:1;pointer-events:none;}',
      /* Demo nav bar */
      '.demo-nav-bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:2px;background:#1a1a1a;border-radius:40px;padding:4px;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap;}',
      '.demo-nav-bar a,.demo-nav-bar button{color:#fff;font-size:12px;font-weight:600;text-decoration:none;padding:7px 15px;border-radius:36px;white-space:nowrap;transition:background .15s;letter-spacing:.02em;border:none;background:transparent;cursor:pointer;font-family:inherit;}',
      '.demo-nav-bar a:hover,.demo-nav-bar button:hover{background:rgba(255,255,255,.13);}',
      '.demo-nav-bar a.active{background:rgba(255,255,255,.18);}',
      '.demo-nav-bar .demo-sep{width:1px;height:20px;background:rgba(255,255,255,.2);margin:0 2px;flex-shrink:0;}',
      /* Hide the scrolling hidden-book-now that Outrigger JS may show */
      '.hidden-book-now{display:none!important;}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Demo nav bar ──────────────────────────────────────────────────────────

  function injectDemoNav(activePage) {
    if (document.querySelector('.demo-nav-bar')) return;
    var nav = document.createElement('div');
    nav.className = 'demo-nav-bar';
    var pages = [
      { href: 'index.html', label: 'Resorts' },
      { href: 'rooms.html', label: 'Rooms & Suites' },
      { href: 'offers.html', label: 'Offers' }
    ];
    nav.innerHTML =
      pages.map(function (p) {
        var isActive = p.href === activePage || p.href.replace(/\.html$/, '') === activePage;
      return '<a href="' + p.href + '"' + (isActive ? ' class="active"' : '') + '>' + p.label + '</a>';
      }).join('') +
      '<div class="demo-sep"></div>' +
      '<button onclick="window.__favToggleTray()">Tray<span id="favDemoCount" style="opacity:.65;font-weight:500;"></span></button>' +
      '<button onclick="(function(){localStorage.removeItem(\'' + STORAGE_KEY + '\');location.reload();})()">Reset</button>';
    document.body.appendChild(nav);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  // Snapshot image srcs immediately (before Outrigger deferred JS overwrites them)
  preserveImages();

  function earlyInit() {
    injectStyles();
    injectTrayHTML();
    wireTripPlannerButton();

    var page = (window.location.pathname.split('/').pop() || 'index');
    injectDemoNav(page);
    updateBadge();
  }

  function injectHearts() {
    if (document.querySelector('.card[property_id]')) injectPropertyHearts();
    if (document.querySelector('.card.loaded[data-room-id]')) injectRoomHearts();
    if (document.querySelector('.card.swiper-slide:not(.promo-card):not(.card-image-overlay) .card-title')) injectOfferHearts();
    restoreHearts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', earlyInit);
  } else {
    earlyInit();
  }

  // Outrigger JS injects a second .header-booknow into the nav — hide it.
  function fixDuplicateBookNow() {
    var btns = document.querySelectorAll('.header-booknow');
    for (var i = 1; i < btns.length; i++) {
      var li = btns[i].closest('li');
      if (li) li.style.display = 'none';
      else btns[i].style.display = 'none';
    }
  }

  window.addEventListener('load', function () {
    // Capture any images added by sync Outrigger JS before defer scripts ran
    preserveImages();

    setTimeout(function () {
      restoreBrokenImages();
      fixCarouselImagesBySource();
      injectHearts();
      wireTripPlannerButton();
      fixDuplicateBookNow();
      updateBadge();
    }, 250);
  });

})();
