/**
 * SignalGraph by BrandGraphAI — Behavioral Tracking Tag v1.1
 * Production embed — self-contained IIFE, no dependencies, < 5 KB.
 *
 * Usage (API key — recommended):
 *   <script>
 *     window._bgConfig = { apiKey: 'bg_live_xxx', apiEndpoint: 'https://brandgraphai.com' };
 *   </script>
 *   <script async src="https://brandgraphai.com/tracking/brandgraph-tag.js"></script>
 *
 * Usage (legacy — org ID only):
 *   <script>
 *     window._bgConfig = { organizationId: 'YOUR_ORG_ID', apiEndpoint: 'https://brandgraphai.com' };
 *   </script>
 *   <script async src="https://brandgraphai.com/tracking/brandgraph-tag.js"></script>
 *
 * Optional fields: propertySlug, debug (true enables console tracing).
 *
 * GDPR: Call bgOptOut() to disable tracking. Respects _bg_opt_out cookie.
 * Cookie: _bg_vid (visitor UUID, 1 year, first-party, SameSite=Lax).
 */
(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────────
  var CK_VID = '_bg_vid', CK_OPT = '_bg_opt_out', CK_RET = '_bg_ret', SK = '_bg_sess';
  var DWELL = [15e3, 3e4, 6e4, 12e4, 3e5];
  var SCROLL = [25, 50, 75, 100];
  var FLUSH_INTERVAL = 3e3;
  var MAX_BATCH = 100;

  var BOOK_KEYWORDS = ['booking', 'reservations', 'book-now', 'checkavailability'];
  var AVAIL_INDICATORS = ['/check-availability', '/booking', '/reservations', '/rates', 'checkavailability'];
  var SHARE_DOMAINS = ['facebook.com/sharer', 'twitter.com/share', 'pinterest.com/pin', 'linkedin.com/shareArticle'];

  // ─── Utilities ─────────────────────────────────────────────────────────────
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function getCookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setCookie(n, v, age) {
    var parts = [n + '=' + encodeURIComponent(v), 'max-age=' + age, 'path=/', 'SameSite=Lax'];
    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  }

  function getVid() {
    var v = getCookie(CK_VID);
    if (!v) { v = uuid(); setCookie(CK_VID, v, 365 * 24 * 3600); }
    return v;
  }

  function optedOut() {
    // DNT check removed — first-party analytics tool on customer hotel sites.
    // Most analytics platforms (GA4, Adobe, etc.) dropped DNT support years ago.
    // Explicit opt-out via bgOptOut() / _bg_opt_out cookie is still respected.
    return getCookie(CK_OPT) === '1';
  }

  function device() {
    var ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  function utmParams() {
    var out = {}, sp = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){ var v = sp.get(k); if(v) out[k]=v; });
    return out;
  }

  function searchKW(ref) {
    try { var u = new URL(ref); return u.searchParams.get('q') || u.searchParams.get('query') || null; } catch(e){ return null; }
  }

  function isSearchRef(ref) { return /google\.|bing\.|yahoo\.|duckduckgo\./i.test(ref); }

  function pathDepth(url) {
    try { return new URL(url).pathname.split('/').filter(Boolean).length; } catch(e){ return 0; }
  }

  function matchesKw(str, list) {
    var lo = str.toLowerCase();
    return list.some(function(k){ return lo.indexOf(k.toLowerCase()) !== -1; });
  }

  function elMatchesSel(el, sel) {
    try { return el.matches(sel); } catch(e){ return false; }
  }

  // ─── Session ────────────────────────────────────────────────────────────────
  function getSession() {
    try { var s = sessionStorage.getItem(SK); if(s) return JSON.parse(s); } catch(e){}
    var ret = parseInt(getCookie(CK_RET) || '0', 10);
    setCookie(CK_RET, String(ret + 1), 365 * 24 * 3600);
    var sess = {
      id: uuid(), startTime: Date.now(), entryUrl: location.href,
      referrer: document.referrer, pageCount: 0, pagesVisited: [],
      propertiesVisited: [], categoriesVisited: [], maxPathDepth: 0,
      device: device(), utmParams: utmParams(), searchKW: searchKW(document.referrer),
      isReturn: ret > 0
    };
    saveSession(sess);
    return sess;
  }

  function saveSession(s) {
    try { sessionStorage.setItem(SK, JSON.stringify(s)); } catch(e){}
  }

  // ─── Booking Form Detector ──────────────────────────────────────────────────
  // Zero-overhead when no booking form is present. Uses MutationObserver to
  // pick up async-loaded booking widgets (iframes injecting, SPA nav, etc.).
  //
  // Detection priority (first match wins):
  //   1. data-bg-* explicit attributes
  //   2. Known booking engine DOM signatures (Synxis, TravelClick, generic)
  //   3. Semantic label / name-attribute pattern matching
  //
  // Fires booking_search after 2s inactivity once checkIn+checkOut are filled.
  // Fires booking_submit immediately when the form is submitted or search clicked.
  // ───────────────────────────────────────────────────────────────────────────

  var ENGINE_SPECS = [
    { engine: 'synxis',      sels: ['.synxis-booking','#bookingWidget','[data-synxis]','#synxis-booking-widget'] },
    { engine: 'travelclick', sels: ['#be-widget','.ihotelier','[class*="travelclick"]','[id*="ihotelier"]'] },
    { engine: 'generic',     sels: ['form.booking-form','form#booking-form','.booking-engine','#booking-engine','[data-module="booking"]','[class*="booking-form"]','[id*="booking-form"]'] },
  ];

  var DATA_ATTRS = {
    checkIn:   'data-bg-checkin',
    checkOut:  'data-bg-checkout',
    adults:    'data-bg-adults',
    children:  'data-bg-children',
    rooms:     'data-bg-rooms',
    roomType:  'data-bg-room-type',
    promoCode: 'data-bg-promo-code',
  };

  // [fieldKey, nameRegexps, labelKeywords]
  var SEMANTIC_SPECS = [
    ['checkIn',   [/check.?in/i,/arrival/i,/from.?date/i,/start.?date/i],   ['check-in','arrival','from']],
    ['checkOut',  [/check.?out/i,/departure/i,/to.?date/i,/end.?date/i],    ['check-out','departure','to']],
    ['adults',    [/adults?/i,/num.?adults?/i,/persons?/i,/grown.?ups?/i],  ['adults','guests','persons']],
    ['children',  [/childre?n/i,/num.?children/i,/kids?/i,/infants?/i],     ['children','kids']],
    ['rooms',     [/rooms?/i,/num.?rooms?/i,/units?/i,/bedrooms?/i],        ['rooms','units']],
    ['roomType',  [/room.?type/i,/room.?cat/i,/accommodation/i],             ['room type','room category']],
    ['promoCode', [/promo/i,/coupon/i,/discount.?code/i,/rate.?code/i],     ['promo','coupon','rate code']],
  ];

  function bgQs(root, sel) { try { return root.querySelector(sel); } catch(e){ return null; } }
  function bgQsa(root, sel) { try { return Array.prototype.slice.call(root.querySelectorAll(sel)); } catch(e){ return []; } }

  function bgExtractDate(el) {
    if (!el || !el.value) return null;
    var v = el.value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    var m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3];
      var pad = function(n) { return String(n).length < 2 ? '0'+n : String(n); };
      return parseInt(m[1]) > 12
        ? y + '-' + pad(m[2]) + '-' + pad(m[1])
        : y + '-' + pad(m[1]) + '-' + pad(m[2]);
    }
    return null;
  }

  function bgExtractInt(el) {
    if (!el || !el.value) return null;
    var v = parseInt(el.value, 10);
    return isNaN(v) ? null : v;
  }

  function bgNights(ci, co) {
    if (!ci || !co) return null;
    try { var d = (new Date(co) - new Date(ci)) / 86400000; return d > 0 ? Math.round(d) : null; }
    catch(e) { return null; }
  }

  function bgSemanticFind(root, patterns, labelKws) {
    var inputs = bgQsa(root, 'input, select');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var ni = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
      for (var j = 0; j < patterns.length; j++) {
        if (patterns[j].test(ni)) return el;
      }
    }
    var labels = bgQsa(root, 'label');
    for (var i = 0; i < labels.length; i++) {
      var lbl = labels[i];
      var txt = (lbl.textContent || '').toLowerCase();
      var hit = labelKws.some(function(k){ return txt.indexOf(k) !== -1; });
      if (!hit) continue;
      var forId = lbl.getAttribute('for');
      if (forId) { var e = document.getElementById(forId); if (e) return e; }
      var nxt = lbl.nextElementSibling;
      if (nxt && (nxt.tagName === 'INPUT' || nxt.tagName === 'SELECT')) return nxt;
      var pi = bgQs(lbl.parentElement, 'input, select');
      if (pi) return pi;
    }
    return null;
  }

  function bgDetectDataAttr(ctx) {
    var found = false;
    for (var field in DATA_ATTRS) {
      var el = bgQs(document, '[' + DATA_ATTRS[field] + ']');
      if (el) { ctx.fields[field] = el; found = true; }
    }
    if (found) { ctx.source = 'data-attribute'; return true; }
    return false;
  }

  function bgDetectEngine(ctx) {
    for (var ei = 0; ei < ENGINE_SPECS.length; ei++) {
      var spec = ENGINE_SPECS[ei];
      var root = null;
      for (var si = 0; si < spec.sels.length; si++) {
        root = bgQs(document, spec.sels[si]);
        if (root) break;
      }
      if (!root) continue;

      var dates = bgQsa(root, 'input[type="date"]');
      ctx.fields.checkIn = bgQs(root, 'input[name*="checkin"],input[name*="check_in"],input[name*="arrival"],input[id*="checkin"],input[id*="check-in"]') || dates[0] || null;
      ctx.fields.checkOut = bgQs(root, 'input[name*="checkout"],input[name*="check_out"],input[name*="departure"],input[id*="checkout"],input[id*="check-out"]') || dates[1] || null;
      ctx.fields.adults    = bgQs(root, 'select[name*="adults"],input[name*="adults"],select[id*="adults"],input[id*="adults"]');
      ctx.fields.children  = bgQs(root, 'select[name*="children"],input[name*="children"],select[id*="child"],input[id*="child"]');
      ctx.fields.rooms     = bgQs(root, 'select[name*="rooms"],input[name*="rooms"],select[id*="rooms"],input[id*="rooms"]');
      ctx.fields.roomType  = bgQs(root, 'select[name*="room_type"],select[name*="roomtype"],select[name*="room-type"]');
      ctx.fields.promoCode = bgQs(root, 'input[name*="promo"],input[name*="coupon"],input[name*="ratecode"],input[name*="rate_code"]');
      ctx.flexToggle       = bgQs(root, 'input[type="checkbox"][name*="flex"],input[type="checkbox"][id*="flex"]');
      ctx.source = spec.engine;
      ctx.root   = root;
      return true;
    }
    return false;
  }

  function bgDetectSemantic(ctx) {
    var forms = bgQsa(document, 'form');
    for (var fi = 0; fi < forms.length; fi++) {
      var form = forms[fi];
      var txt = (form.textContent || '').toLowerCase();
      var hasKw = ['check-in','checkin','check-out','checkout','arrival','departure','nights','guests','adults','rooms'].some(function(k){ return txt.indexOf(k) !== -1; });
      var hasDate = !!bgQs(form, 'input[type="date"],input[name*="checkin"],input[name*="check_in"],input[name*="arrival"]');
      if (!hasKw && !hasDate) continue;
      for (var si = 0; si < SEMANTIC_SPECS.length; si++) {
        var ss = SEMANTIC_SPECS[si];
        var el = bgSemanticFind(form, ss[1], ss[2]);
        if (el) ctx.fields[ss[0]] = el;
      }
      if (!ctx.fields.checkIn && !ctx.fields.checkOut) continue;
      ctx.source = 'semantic';
      ctx.root   = form;
      return true;
    }
    return false;
  }

  function bgExtractCtx(ctx, submitted) {
    var f = ctx.fields;
    var ci = bgExtractDate(f.checkIn || null);
    var co = bgExtractDate(f.checkOut || null);
    return {
      checkIn:       ci,
      checkOut:      co,
      nights:        bgNights(ci, co),
      rooms:         bgExtractInt(f.rooms) || 1,
      adults:        bgExtractInt(f.adults) || 2,
      children:      bgExtractInt(f.children) || 0,
      childAges:     [],
      roomType:      (f.roomType && f.roomType.value) || null,
      promoCode:     (f.promoCode && f.promoCode.value) || null,
      flexibleDates: ctx.flexToggle ? !!ctx.flexToggle.checked : false,
      source:        ctx.source || 'generic',
      submitted:     !!submitted,
    };
  }

  function bgHasMvb(ctx) {
    var bk = bgExtractCtx(ctx, false);
    return !!(bk.checkIn && bk.checkOut);
  }

  function BookingFormDetector(tracker) {
    this.tracker      = tracker;
    this.ctx          = { fields: {}, source: 'generic', root: null, flexToggle: null, submitted: false };
    this.debTimer     = null;
    this.lastSig      = null;
    this.watching     = false;
    this.observer     = null;
  }

  BookingFormDetector.prototype.init = function() {
    this._detect();
    if (typeof MutationObserver !== 'undefined' && !this.watching) {
      var self = this;
      this.observer = new MutationObserver(function() { if (!self.watching) self._detect(); });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  };

  BookingFormDetector.prototype._detect = function() {
    var ctx = { fields: {}, source: 'generic', root: null, flexToggle: null, submitted: false };
    var found = bgDetectDataAttr(ctx) || bgDetectEngine(ctx) || bgDetectSemantic(ctx);
    if (!found) return;
    this.ctx      = ctx;
    this.watching = true;
    if (this.observer) this.observer.disconnect();
    this._attach();
    this._dbgDetected(ctx);
  };

  BookingFormDetector.prototype._attach = function() {
    var self = this;
    var f    = this.ctx.fields;
    var root = this.ctx.root || document;

    for (var key in f) {
      if (!f[key]) continue;
      (function(el) {
        el.addEventListener('change', function() { self._onChange(); });
        el.addEventListener('input',  function() { self._onChange(); });
      })(f[key]);
    }

    var form = (root.tagName === 'FORM' ? root : bgQs(root, 'form'));
    if (form) form.addEventListener('submit', function() { self._onSubmit(); });

    bgQsa(root, 'button[type="submit"],input[type="submit"],.check-rates,[data-action*="search"]').forEach(function(btn) {
      btn.addEventListener('click', function() { self._onSubmit(); });
    });
  };

  BookingFormDetector.prototype._onChange = function() {
    var self = this;
    clearTimeout(this.debTimer);
    this.debTimer = setTimeout(function() {
      if (bgHasMvb(self.ctx)) {
        self._fire('booking_search');
      } else {
        self._dbgPartial();
      }
    }, 2000);
  };

  BookingFormDetector.prototype._onSubmit = function() {
    clearTimeout(this.debTimer);
    this.ctx.submitted = true;
    this._fire('booking_submit');
  };

  BookingFormDetector.prototype._fire = function(type) {
    var submitted = type === 'booking_submit';
    var bk  = bgExtractCtx(this.ctx, submitted);
    var sig = JSON.stringify(bk);
    if (type === 'booking_search' && sig === this.lastSig) return;
    this.lastSig = sig;
    var ev = { type: type, url: location.href, title: document.title, timestamp: Date.now(), data: { bookingContext: bk } };
    this.tracker._enq(ev);
    this._dbgFired(type, bk);
  };

  BookingFormDetector.prototype._dbgDetected = function(ctx) {
    if (!window.__BG_DEBUG) return;
    try {
      window.postMessage({
        type: 'bg:booking-detector', event: 'detected', source: ctx.source,
        fieldsFound: Object.keys(ctx.fields).filter(function(k){ return !!ctx.fields[k]; }),
        timestamp: Date.now(),
      }, '*');
    } catch(e) {}
  };

  BookingFormDetector.prototype._dbgPartial = function() {
    if (!window.__BG_DEBUG) return;
    var bk = bgExtractCtx(this.ctx, false);
    try {
      window.postMessage({
        type: 'bg:booking-detector', event: 'partial', bookingContext: bk,
        missingRequiredFields: (!bk.checkIn ? ['checkIn'] : []).concat(!bk.checkOut ? ['checkOut'] : []),
        debounceState: 'waiting-for-mvb', timestamp: Date.now(),
      }, '*');
    } catch(e) {}
  };

  BookingFormDetector.prototype._dbgFired = function(type, bk) {
    if (!window.__BG_DEBUG) return;
    try {
      window.postMessage({
        type: 'bg:booking-detector', event: 'fired', signalType: type,
        bookingContext: bk, detectionSource: bk.source, timestamp: Date.now(),
      }, '*');
    } catch(e) {}
  };

  // ─── DataLayer Interceptor ──────────────────────────────────────────────────
  // Tier 2 of the booking engine integration strategy.
  // Intercepts Enhanced Ecommerce events that booking engines push into
  // window.dataLayer (Google Tag Manager), and forwards them as SignalGraph
  // behavioral signals.
  //
  // Supports:
  //   GA4 Enhanced Ecommerce: view_item, add_to_cart, begin_checkout, purchase,
  //                            view_item_list, select_item, remove_from_cart
  //   Legacy UA Ecommerce:    events with ecommerce.detail/add/checkout/purchase
  //
  // Zero-overhead when window.dataLayer is absent or no matching events fire.
  // ───────────────────────────────────────────────────────────────────────────

  // GA4 event name → SignalGraph event type
  var DL_GA4_MAP = {
    view_item:        'ecommerce_view',
    view_item_list:   'ecommerce_view',
    select_item:      'ecommerce_view',
    add_to_cart:      'ecommerce_cart_add',
    remove_from_cart: 'ecommerce_remove',
    begin_checkout:   'ecommerce_checkout',
    purchase:         'ecommerce_purchase',
  };

  // Legacy UA ecommerce action key → SignalGraph event type
  var DL_UA_MAP = {
    detail:   'ecommerce_view',
    add:      'ecommerce_cart_add',
    checkout: 'ecommerce_checkout',
    purchase: 'ecommerce_purchase',
  };

  function dlExtractItems(dlEvent) {
    var eec = dlEvent.ecommerce;
    if (!eec) return [];

    // GA4 format: ecommerce.items[]
    if (Array.isArray(eec.items)) {
      return eec.items.map(function (it) {
        return {
          itemId:    it.item_id    || it.id   || null,
          itemName:  it.item_name  || it.name || null,
          price:     typeof it.price === 'number' ? it.price : (parseFloat(it.price) || null),
          quantity:  typeof it.quantity === 'number' ? it.quantity : (parseInt(it.quantity, 10) || 1),
          currency:  eec.currency || null,
          category:  it.item_category || it.category || null,
          variant:   it.item_variant  || it.variant  || null,
          listName:  it.item_list_name || null,
        };
      });
    }

    // Legacy UA format: products[] nested under action key
    var actionKeys = ['detail', 'add', 'checkout', 'purchase'];
    for (var ai = 0; ai < actionKeys.length; ai++) {
      var action = eec[actionKeys[ai]];
      if (action && Array.isArray(action.products)) {
        return action.products.map(function (p) {
          return {
            itemId:   p.id       || null,
            itemName: p.name     || null,
            price:    typeof p.price === 'number' ? p.price : (parseFloat(p.price) || null),
            quantity: typeof p.quantity === 'number' ? p.quantity : (parseInt(p.quantity, 10) || 1),
            currency: eec.currencyCode || null,
            category: p.category || null,
            variant:  p.variant  || null,
            listName: null,
          };
        });
      }
    }

    return [];
  }

  function dlExtractTransactionId(dlEvent) {
    var eec = dlEvent.ecommerce;
    if (!eec) return null;
    if (eec.transaction_id) return String(eec.transaction_id);
    if (eec.purchase && eec.purchase.actionField) return eec.purchase.actionField.id || null;
    return null;
  }

  function dlExtractRevenue(dlEvent) {
    var eec = dlEvent.ecommerce;
    if (!eec) return null;
    if (typeof eec.value === 'number') return eec.value;
    if (eec.purchase && eec.purchase.actionField) return parseFloat(eec.purchase.actionField.revenue) || null;
    return null;
  }

  function DataLayerInterceptor(tracker, opts) {
    this.tracker    = tracker;
    this.enabled    = opts && opts.enabled !== false; // default: enabled
    this.allowlist  = (opts && Array.isArray(opts.allowlist)) ? opts.allowlist : null;
    this.customMap  = (opts && typeof opts.customMap === 'object') ? opts.customMap : {};
    this._lastSigs  = {};  // sgType → last dedup hash
    this._debTimers = {};
  }

  DataLayerInterceptor.prototype.init = function () {
    if (!this.enabled) return;
    var self = this;
    var win = window;

    // Ensure dataLayer array exists (we create it if GTM hasn't yet)
    if (!Array.isArray(win.dataLayer)) win.dataLayer = [];

    // Process items already in dataLayer before we attached (early pushes)
    for (var i = 0; i < win.dataLayer.length; i++) {
      try { self._onPush(win.dataLayer[i]); } catch (e) {}
    }

    // Monkey-patch push to intercept future events
    var origPush = win.dataLayer.push.bind(win.dataLayer);
    win.dataLayer.push = function () {
      var result = origPush.apply(win.dataLayer, arguments);
      for (var j = 0; j < arguments.length; j++) {
        try { self._onPush(arguments[j]); } catch (e) {}
      }
      return result;
    };

    if (win.__BG_DEBUG) {
      try {
        win.postMessage({ type: 'bg:datalayer-interceptor', event: 'init', timestamp: Date.now() }, '*');
      } catch (e) {}
    }
  };

  DataLayerInterceptor.prototype._onPush = function (obj) {
    if (!obj || typeof obj !== 'object') return;
    var evName = obj.event || '';
    var sgType = null;

    // 1. Custom override map
    if (this.customMap[evName]) {
      sgType = this.customMap[evName];
    }
    // 2. GA4 Enhanced Ecommerce
    else if (DL_GA4_MAP[evName]) {
      sgType = DL_GA4_MAP[evName];
    }
    // 3. Legacy UA: detect by ecommerce sub-key (event name may be anything)
    else if (obj.ecommerce) {
      var eec = obj.ecommerce;
      if      (eec.detail)   sgType = DL_UA_MAP['detail'];
      else if (eec.add)      sgType = DL_UA_MAP['add'];
      else if (eec.checkout) sgType = DL_UA_MAP['checkout'];
      else if (eec.purchase) sgType = DL_UA_MAP['purchase'];
    }

    if (!sgType) return;

    // Allowlist filter (null = accept all)
    if (this.allowlist && this.allowlist.indexOf(evName) === -1) return;

    var items   = dlExtractItems(obj);
    var txId    = dlExtractTransactionId(obj);
    var revenue = dlExtractRevenue(obj);

    var sigData = {
      gtmEvent:      evName,
      items:         items,
      transactionId: txId,
      revenue:       revenue,
      currency:      (obj.ecommerce && obj.ecommerce.currency) || null,
      source:        'datalayer',
    };

    // Debounce: suppress exact duplicate within 500 ms
    var dedupKey = items.map(function (it) { return it.itemId || it.itemName; }).sort().join('|');
    var sigHash  = sgType + '|' + dedupKey;
    if (this._lastSigs[sgType] === sigHash) return;
    this._lastSigs[sgType] = sigHash;
    var self = this;
    clearTimeout(this._debTimers[sgType]);
    this._debTimers[sgType] = setTimeout(function () { delete self._lastSigs[sgType]; }, 500);

    this.tracker._enq({
      type:      sgType,
      url:       location.href,
      title:     document.title,
      timestamp: Date.now(),
      data:      sigData,
    });

    if (window.__BG_DEBUG) {
      try {
        window.postMessage({
          type:     'bg:datalayer-interceptor',
          event:    'intercepted',
          gtmEvent: evName,
          sgType:   sgType,
          items:    items,
          timestamp: Date.now(),
        }, '*');
      } catch (e) {}
    }
  };

  // ─── Tracker ────────────────────────────────────────────────────────────────
  function Tracker(cfg) {
    this.cfg = cfg;
    this.vid = getVid();
    this.sess = getSession();
    this.queue = [];
    this.activeMs = 0;
    this.lastFocus = document.hasFocus() ? Date.now() : null;
    this.dwellFired = {};
    this.scrollFired = {};
    this.sessFired = {};
    this.dwellTick = null;
    this.flushTick = null;
  }

  Tracker.prototype.init = function () {
    if (optedOut()) return;
    this._updateSess();
    this._pageView();
    this._dwell();
    this._scroll();
    this._clicks();
    this._focus();
    this._unload();
    this._flushTimer();
    // Booking form detection — Tier 1: DOM-based form field scraping
    var bd = new BookingFormDetector(this);
    bd.init();
    // DataLayer interceptor — Tier 2: GTM/Enhanced Ecommerce signal capture
    var dli = new DataLayerInterceptor(this, this.cfg.dataLayer || {});
    dli.init();
    window._bgVisitorId = this.vid;
  };

  // ─── Debug mode ─────────────────────────────────────────────────────────────
  // When window.__BG_DEBUG is true (set by SignalGraph Inspector extension),
  // emit every enqueued event via window.postMessage so the extension can
  // capture it without any polling or API interception.
  Tracker.prototype._debugEmit = function (ev) {
    if (!window.__BG_DEBUG) return;
    try {
      window.postMessage({
        type: 'bg:signal',
        source: 'brandgraph-tag',
        tagVersion: '1.1',
        event: ev,
        config: {
          organizationId: this.cfg.organizationId || null,
          // Mask key — never expose full value to the extension
          apiKey: this.cfg.apiKey ? this.cfg.apiKey.substring(0, 10) + '***' : null,
          apiEndpoint: this.cfg.apiEndpoint || 'https://brandgraphai.com',
          propertySlug: this.cfg.propertySlug || null
        },
        session: {
          id: this.sess.id,
          pageCount: this.sess.pageCount,
          propertiesVisited: this.sess.propertiesVisited.slice(),
          categoriesVisited: this.sess.categoriesVisited.slice(),
          device: this.sess.device
        },
        visitorId: this.vid
      }, '*');
    } catch (e) { /* never break the page */ }
  };

  Tracker.prototype._enq = function (ev) {
    this.queue.push(ev);
    this._debugEmit(ev);
    if (this.queue.length >= MAX_BATCH) this._flush();
  };

  Tracker.prototype._flush = function (beacon) {
    if (!this.queue.length) return;
    var evs = this.queue.splice(0, MAX_BATCH);
    var body = { visitorId: this.vid, events: evs };
    if (this.cfg.organizationId) body.organizationId = this.cfg.organizationId;
    var payload = JSON.stringify(body);
    var url = (this.cfg.apiEndpoint || 'https://brandgraphai.com') + '/api/behavioral-signals';
    var apiKey = this.cfg.apiKey;
    // sendBeacon cannot set custom headers; fall back to keepalive fetch when API key is in use
    if (beacon && navigator.sendBeacon && !apiKey) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      var hdrs = { 'Content-Type': 'application/json' };
      if (apiKey) hdrs['X-BG-API-Key'] = apiKey;
      try {
        fetch(url, { method: 'POST', headers: hdrs, body: payload, keepalive: true }).catch(function(){});
      } catch(e){}
    }
  };

  Tracker.prototype._flushTimer = function () {
    var self = this;
    this.flushTick = setInterval(function(){ self._flush(); }, FLUSH_INTERVAL);
  };

  Tracker.prototype._ev = function (type, data) {
    return { type: type, url: location.href, title: document.title, timestamp: Date.now(), data: data || {} };
  };

  Tracker.prototype._updateSess = function () {
    var url = location.href, d = pathDepth(url);
    if (this.sess.pagesVisited.indexOf(url) === -1) this.sess.pagesVisited.push(url);
    this.sess.pageCount++;
    this.sess.maxPathDepth = Math.max(this.sess.maxPathDepth, d);

    // Property slug — match multiple hotel site URL patterns:
    //   /resort(s)/slug, /hotel(s)/slug, /hotels-resorts/slug, /properties/slug
    //   or geographic: /.../region/city/property-slug (3+ segments, last segment has a hyphen)
    var pm = url.match(/\/(?:resorts?|hotels?|hotels?[-_]resorts?|properties)\/([^/?#]+)/i);
    if (!pm) {
      // Fallback: detect property slug from deep path (e.g. /hawaii/oahu/outrigger-waikiki-beach-resort/rooms)
      // Look for a path segment that matches a known property pattern (contains brand-like hyphenated name)
      var segs = url.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
      if (segs.length >= 3) {
        // Find the deepest segment that looks like a property slug (hyphenated, 3+ words).
        // Cap at index 3 (4th segment) to avoid matching leaf entity slugs on deep URLs
        // like /hawaii/oahu/outrigger-resort/rooms-suites/2-bedroom-suite where the room
        // slug at index 4 would otherwise be incorrectly detected as a property slug.
        for (var si = Math.min(segs.length - 1, 3); si >= 1; si--) {
          var seg = segs[si].toLowerCase().replace(/[?#].*/, '');
          if (seg.split('-').length >= 3 && seg.length >= 15 && !/\.(html?|php|aspx?)$/i.test(seg)) {
            pm = [null, seg]; break;
          }
        }
      }
    }
    if (pm) { var sl = pm[1].toLowerCase(); if (this.sess.propertiesVisited.indexOf(sl) === -1) this.sess.propertiesVisited.push(sl); }

    // Category
    var catMap = { dining:['dining','restaurant','food'], rooms:['room','suite','accommodation'],
      activities:['activit','excursion','tour'], amenities:['spa','pool','gym','fitness'],
      events:['event','wedding','meeting','conference'], packages:['deal','special','package','offer'] };
    var lo = url.toLowerCase();
    var cats = this.sess.categoriesVisited;
    for (var cat in catMap) {
      if (catMap[cat].some(function(k){ return lo.indexOf(k) !== -1; }) && cats.indexOf(cat) === -1) cats.push(cat);
    }
    saveSession(this.sess);
  };

  Tracker.prototype._pageView = function () {
    var url = location.href;
    var returnToPage = this.sess.pagesVisited.filter(function(u){ return u === url; }).length > 1;
    this._enq(this._ev('page_view', {
      device: this.sess.device, utmParams: this.sess.utmParams, pathDepth: pathDepth(url),
      isEntryPage: this.sess.pageCount === 1, isReturnVisit: this.sess.isReturn, isReturnToPage: returnToPage,
      sessionPageCount: this.sess.pageCount, searchKeywords: this.sess.searchKW,
      isSearchEntry: this.sess.pageCount === 1 && isSearchRef(this.sess.referrer),
      propertiesVisited: this.sess.propertiesVisited.slice(),
      referrer: document.referrer || null
    }));
    this._sessSigs();
    // Flush immediately on page_view for real-time stream visibility
    this._flush();
  };

  Tracker.prototype._dwell = function () {
    var self = this;
    this.dwellTick = setInterval(function () {
      if (self.lastFocus !== null && !document.hidden) self.activeMs += 1000;
      DWELL.forEach(function (th) {
        if (!self.dwellFired[th] && self.activeMs >= th) {
          self.dwellFired[th] = 1;
          var s = th / 1000;
          self._enq(self._ev('dwell_' + s + 's', { dwellTimeMs: self.activeMs }));
        }
      });
    }, 1000);
  };

  Tracker.prototype._focus = function () {
    var self = this;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (self.lastFocus !== null) { self.activeMs += Date.now() - self.lastFocus; self.lastFocus = null; }
        self._enq(self._ev('page_blur', { activeTimeMs: self.activeMs }));
      } else {
        self.lastFocus = Date.now();
        self._enq(self._ev('page_focus', { activeTimeMs: self.activeMs }));
      }
    });
    window.addEventListener('blur', function () { if (self.lastFocus !== null) { self.activeMs += Date.now() - self.lastFocus; self.lastFocus = null; } });
    window.addEventListener('focus', function () { self.lastFocus = Date.now(); });
  };

  Tracker.prototype._scroll = function () {
    var self = this, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var el = document.documentElement;
        var sh = el.scrollHeight - el.clientHeight;
        if (sh > 0) {
          var pct = Math.round(((el.scrollTop || document.body.scrollTop) / sh) * 100);
          SCROLL.forEach(function (th) {
            if (!self.scrollFired[th] && pct >= th) {
              self.scrollFired[th] = 1;
              self._enq(self._ev('scroll_' + th, { scrollDepth: th }));
            }
          });
        }
        ticking = false;
      });
    }, { passive: true });
  };

  Tracker.prototype._clicks = function () {
    var self = this;
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target) return;
      var anchor = target.closest ? target.closest('a') : null;
      var href = (anchor && anchor.href) ? anchor.href : '';
      var bgAction = (target.closest && target.closest('[data-bg-action]')) ? target.closest('[data-bg-action]').getAttribute('data-bg-action') : null;
      var bgTrack = (target.closest && target.closest('[data-bg-track]')) ? target.closest('[data-bg-track]').getAttribute('data-bg-track') : null;

      // Book Now
      var bookSels = ['.book-now','.btn-book','.cta-book','.booking-cta','[data-track="book"]','[data-bg-action="book"]'];
      var isBook = bgAction === 'book'
        || bookSels.some(function(s){ try{ return target.matches && target.matches(s); }catch(e){ return false; } })
        || (anchor && bookSels.some(function(s){ try{ return anchor.matches && anchor.matches(s); }catch(e){ return false; } }))
        || (href && matchesKw(href, BOOK_KEYWORDS));

      if (isBook) {
        self._enq(self._ev('book_click', { clickTarget: bgAction || href || (target.className || '').toString(), href: href }));
      }

      // Availability check
      var isAvail = bgAction === 'availability' || (!isBook && href && matchesKw(href, AVAIL_INDICATORS));
      if (isAvail) {
        self._enq(self._ev('availability_check', { clickTarget: href || (target.className || '').toString() }));
      }

      // tel:
      if (href && href.indexOf('tel:') === 0) {
        self._enq(self._ev('contact_phone', { phone: href.replace('tel:', ''), clickTarget: href }));
      }
      // mailto:
      if (href && href.indexOf('mailto:') === 0) {
        self._enq(self._ev('contact_email', { clickTarget: href }));
      }
      // Share
      if (bgAction === 'share' || (href && SHARE_DOMAINS.some(function(d){ return href.indexOf(d) !== -1; }))) {
        self._enq(self._ev('share', { clickTarget: href || bgAction }));
      }
      // Custom
      if (bgTrack) {
        self._enq(self._ev('click', { clickTarget: bgTrack }));
      }
    }, { passive: true });

    // Form submits
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form) return;
      var action = form.action || '';
      var hasDate = !!form.querySelector('[type="date"],[name*="checkin"],[name*="checkout"],[name*="arrival"],[name*="departure"]');
      if (hasDate || matchesKw(action, AVAIL_INDICATORS)) {
        self._enq(self._ev('availability_check', { clickTarget: 'form-submit', formAction: action }));
      } else if (form.querySelector('[name*="email"],[name*="phone"],[name*="contact"]')) {
        self._enq(self._ev('contact_form', { clickTarget: 'contact-form', formAction: action }));
      }
    });

    // Print
    window.addEventListener('beforeprint', function () {
      self._enq(self._ev('download', { clickTarget: 'print-dialog' }));
    });
  };

  Tracker.prototype._sessSigs = function () {
    var self = this, s = this.sess, now = Date.now();
    var dur = now - s.startTime;
    var fire = function(type, data) {
      if (self.sessFired[type]) return;
      self.sessFired[type] = 1;
      self._enq(self._ev(type, data || {}));
    };
    if (s.pageCount >= 5) fire('session_pages_5', { pageCount: s.pageCount });
    if (s.pageCount >= 10) fire('session_pages_10', { pageCount: s.pageCount });
    if (dur >= 5*60e3) fire('session_duration_5m', { durationMs: dur });
    if (dur >= 15*60e3) fire('session_duration_15m', { durationMs: dur });
    if (s.maxPathDepth >= 3) fire('path_depth_3', { maxPathDepth: s.maxPathDepth });
    if (s.maxPathDepth >= 5) fire('path_depth_5', { maxPathDepth: s.maxPathDepth });
    if (s.pagesVisited.length >= 5) fire('breadth_5', { uniquePages: s.pagesVisited.length });
    if (s.pagesVisited.length >= 10) fire('breadth_10', { uniquePages: s.pagesVisited.length });
    if (s.propertiesVisited.length >= 2) fire('cross_compare', { propertiesVisited: s.propertiesVisited.slice() });
    if (s.categoriesVisited.length >= 2) fire('category_multi', { categoriesVisited: s.categoriesVisited.slice() });
    if (s.isReturn) fire('return_visit');
    if (s.pageCount === 1 && isSearchRef(s.referrer) && s.searchKW) fire('search_intent', { keywords: s.searchKW });
    if (s.pageCount === 1 && !s.referrer) fire('direct_entry', { entryUrl: s.entryUrl });
  };

  Tracker.prototype._unload = function () {
    var self = this;
    var onUnload = function () {
      if (self.dwellTick) clearInterval(self.dwellTick);
      if (self.lastFocus !== null) self.activeMs += Date.now() - self.lastFocus;
      var dur = Date.now() - self.sess.startTime;
      self._enq(self._ev('session_end', {
        sessionDurationMs: dur, activeTimeMs: self.activeMs,
        pageCount: self.sess.pageCount, uniquePages: self.sess.pagesVisited.length,
        propertiesVisited: self.sess.propertiesVisited, categoriesVisited: self.sess.categoriesVisited,
        maxPathDepth: self.sess.maxPathDepth, device: self.sess.device
      }));
      self._sessSigs();
      self._flush(true);
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
  };

  // ─── Opt-out ────────────────────────────────────────────────────────────────
  window.bgOptOut = function () {
    setCookie(CK_OPT, '1', 365 * 24 * 3600);
    console.info('[BrandGraph] Tracking disabled. Reload to take effect.');
  };

  // ─── Auto-init ──────────────────────────────────────────────────────────────
  var cfg = window._bgConfig;
  if (cfg && (cfg.organizationId || cfg.apiKey)) {
    var tracker = new Tracker(cfg);
    tracker.init();
    window._bgTracker = tracker;
  } else if (cfg && cfg.debug) {
    console.warn('[BrandGraph] No window._bgConfig.organizationId or .apiKey found — tracking not started.');
  }
})();
