"""
Build the full-featured favorites.js from the prototype.
This creates a single self-contained JS file that injects all HTML, CSS, and logic
into the Outrigger demo pages.
"""

# Read the prototype
with open('favorites-prototype/public/index.html', 'r') as f:
    proto = f.read()

# Extract CSS (lines 8-1181 of the file, between <style> and </style>)
import re

css_match = re.search(r'<style>(.*?)</style>', proto, re.DOTALL)
css_content = css_match.group(1) if css_match else ''

# Extract only the favorites-relevant CSS (after the general page layout stuff)
# Start from .favorite-btn
fav_css_start = css_content.find('.favorite-btn {')
if fav_css_start == -1:
    fav_css_start = css_content.find('.favorite-btn{')
fav_css = css_content[fav_css_start:] if fav_css_start > -1 else css_content

# Also need the CSS custom properties
props_match = re.search(r':root\s*\{(.*?)\}', css_content, re.DOTALL)
css_props = ':root {' + props_match.group(1) + '}' if props_match else ''

# Extract HTML modals (from <!-- MODALS --> to <!-- PROTOTYPE NAV BAR -->)
modals_start = proto.find('<!-- Email Capture -->')
modals_end = proto.find('<!-- Toast -->')
toast_end = proto.find('<!-- ==========================================\n     PROTOTYPE NAV BAR')
modals_html = proto[modals_start:toast_end].strip() if modals_start > -1 else ''

# Remove the prototype nav bar and favorites page view elements — those are prototype-specific
# Keep: emailModal, tripModal, renameModal, createCollectionModal, deleteModal, tray, toast

# Extract JS (between <script> and </script> at the end)
js_match = re.search(r'<script src="https://www.outrigger.com/dist/js/bootstrap.bundle.min.js"></script>\s*<script>(.*?)</script>\s*</body>', proto, re.DOTALL)
js_content = js_match.group(1) if js_match else ''

print(f"CSS props: {len(css_props)} chars")
print(f"Fav CSS: {len(fav_css)} chars")
print(f"Modals HTML: {len(modals_html)} chars")
print(f"JS: {len(js_content)} chars")

# Now build the combined favorites.js
output = '''(function() {
"use strict";

// ═══════════════════════════════════════════════════════════════
// OUTRIGGER FAVORITES — Full-Featured Demo Script
// Injects: CSS, modal HTML, tray, toast, heart buttons, all logic
// ═══════════════════════════════════════════════════════════════

// ── Inject CSS ──────────────────────────────────────────────────
var style = document.createElement("style");
style.textContent = INJECT_CSS;
document.head.appendChild(style);

// ── Inject modal HTML ───────────────────────────────────────────
var wrapper = document.createElement("div");
wrapper.id = "fav-injected-elements";
wrapper.innerHTML = INJECT_HTML;
document.body.appendChild(wrapper);

// ── Inject heart buttons onto existing Outrigger cards ──────────
function injectHeartsOnCards() {
  var heartSVG = '<svg viewBox="0 0 24 24"><path class="heart-outline" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  // Property cards (homepage)
  document.querySelectorAll(".card[property_id]").forEach(function(card) {
    if (card.querySelector(".favorite-btn")) return;
    var slider = card.querySelector(".card-simplified-slider");
    if (!slider) return;
    slider.style.position = "relative";
    var propId = card.getAttribute("property_id");
    var propName = card.getAttribute("property_name") || "Resort";
    var img = card.querySelector(".carousel-item.active img, .carousel-item img, img");
    var imgSrc = img ? (img.getAttribute("data-local-src") || img.src) : "";
    var link = card.querySelector("a.card-title, a.card-view-property, a[href]");
    var url = link ? link.href : "#";
    var btn = document.createElement("button");
    btn.className = "favorite-btn";
    btn.setAttribute("data-id", "property-" + propId);
    btn.setAttribute("data-type", "Resort");
    btn.setAttribute("data-name", propName);
    btn.setAttribute("data-sub", "Hawaii");
    btn.setAttribute("data-img", imgSrc);
    btn.setAttribute("data-hotel-url", url);
    btn.setAttribute("data-hotel-code", propId);
    btn.setAttribute("onclick", "onHeartClick(this)");
    btn.innerHTML = heartSVG;
    slider.appendChild(btn);
  });

  // Room cards (rooms page)
  document.querySelectorAll(".card[data-room-id]").forEach(function(card) {
    if (card.querySelector(".favorite-btn")) return;
    var slider = card.querySelector(".card-simplified-slider");
    if (!slider) return;
    slider.style.position = "relative";
    var roomId = card.getAttribute("data-room-id") || "";
    var roomName = card.getAttribute("room_type_name") || roomId || "Room";
    var resortName = card.getAttribute("property_name") || card.closest("[property_name]")?.getAttribute("property_name") || "";
    var img = card.querySelector(".carousel-item.active img, .carousel-item img, img");
    var imgSrc = img ? (img.getAttribute("data-local-src") || img.src) : "";
    var link = card.querySelector("a.card-title, a.card-view-property, a[href]");
    var url = link ? link.href : "#";
    var btn = document.createElement("button");
    btn.className = "favorite-btn";
    btn.setAttribute("data-id", "room-" + roomId.replace(/[^a-z0-9]/gi, "-"));
    btn.setAttribute("data-type", "Room");
    btn.setAttribute("data-name", roomName);
    btn.setAttribute("data-sub", resortName);
    btn.setAttribute("data-img", imgSrc);
    btn.setAttribute("data-room-url", url);
    btn.setAttribute("data-room-code", roomId);
    btn.setAttribute("onclick", "onHeartClick(this)");
    btn.innerHTML = heartSVG;
    slider.appendChild(btn);
  });

  // Offer cards (offers page + homepage offer sliders)
  var offerSel = ".card.swiper-slide:not([property_id]):not([data-room-id])";
  document.querySelectorAll(offerSel).forEach(function(card, i) {
    if (card.querySelector(".favorite-btn")) return;
    // Skip if it's a promo/overlay card with no real content
    var titleEl = card.querySelector(".card-title, span.card-title, h4, .card-body h4 a");
    if (!titleEl) return;
    var name = titleEl.textContent.trim();
    if (!name) return;
    var id = "offer-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
    var slider = card.querySelector(".card-simplified-slider");
    var container = slider || card;
    container.style.position = "relative";
    var img = card.querySelector("img");
    var imgSrc = img ? img.src : "";
    var link = card.querySelector("a[href]");
    var url = link ? link.href : "#";
    var btn = document.createElement("button");
    btn.className = "favorite-btn";
    btn.setAttribute("data-id", id);
    btn.setAttribute("data-type", "Offer");
    btn.setAttribute("data-name", name);
    btn.setAttribute("data-sub", "Special Offers");
    btn.setAttribute("data-img", imgSrc);
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
INJECT_JS

// ── Init on page load ───────────────────────────────────────────
function initFavorites() {
  injectHeartsOnCards();
  injectDemoNav();
  loadState();
  syncUI();
  updateDemoCount();
}

function updateDemoCount() {
  var total = state.trips.reduce(function(s, t) { return s + t.items.length; }, 0);
  var el = document.getElementById("favDemoCount");
  if (el) el.textContent = total > 0 ? " (" + total + ")" : "";
}

// Override syncUI to also update demo count
var _origSyncUI = syncUI;
syncUI = function() {
  _origSyncUI();
  updateDemoCount();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFavorites);
} else {
  initFavorites();
}
// Also retry after load in case Outrigger JS rebuilds cards
window.addEventListener("load", function() {
  setTimeout(function() {
    injectHeartsOnCards();
    loadState();
    syncUI();
  }, 300);
});

})();
'''

# Clean up the JS - remove prototype-specific stuff
# Remove switchView, renderFavoritesPage references that need view-favorites div
# Actually, let's keep it all but make switchView a no-op for demo pages

# Fix JS to work in demo context
js_fixed = js_content

# Remove the loadState() and syncUI() calls at the bottom since we call them in init
js_fixed = js_fixed.rstrip()
if js_fixed.endswith('syncUI();'):
    js_fixed = js_fixed[:js_fixed.rfind('loadState();')]

# Make switchView work without view divs (just close tray)
js_fixed = js_fixed.replace(
    "function switchView(id) {",
    "function switchView(id) { closeTray(); return; /* Views not available in demo */ "
)

# Fix the proto status update to be a no-op
js_fixed = js_fixed.replace(
    'document.getElementById(\'protoStatus\').textContent',
    '(document.getElementById("protoStatus")||{}).textContent'
)

# Fix headerBadge reference
js_fixed = js_fixed.replace(
    "const badge = document.getElementById('headerBadge');",
    "const badge = document.getElementById('headerBadge') || document.createElement('span');"
)

# Fix resetAll to not reference prototype-specific elements
js_fixed = js_fixed.replace(
    "document.getElementById('emailInput').value = '';",
    "(document.getElementById('emailInput')||{}).value = '';"
)
js_fixed = js_fixed.replace(
    "document.getElementById('tcCheck').checked = false;",
    "var _tc = document.getElementById('tcCheck'); if(_tc) _tc.checked = false;"
)
js_fixed = js_fixed.replace(
    "document.getElementById('recaptchaBox').classList.remove('checked');",
    "var _rc = document.getElementById('recaptchaBox'); if(_rc) _rc.classList.remove('checked');"
)

# Escape backticks and backslashes for JS template literal
def escape_for_js_template(s):
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

css_escaped = escape_for_js_template(css_props + '\n' + fav_css + '''
/* Demo nav bar */
.demo-nav-bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:2px;background:#1a1a1a;border-radius:40px;padding:4px;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap;}
.demo-nav-bar a,.demo-nav-bar button{color:#fff;font-size:12px;font-weight:600;text-decoration:none;padding:7px 15px;border-radius:36px;white-space:nowrap;transition:background .15s;letter-spacing:.02em;border:none;background:transparent;cursor:pointer;font-family:inherit;}
.demo-nav-bar a:hover,.demo-nav-bar button:hover{background:rgba(255,255,255,.13);}
.demo-nav-bar a.active{background:rgba(255,255,255,.18);}
.demo-nav-bar .demo-sep{width:1px;height:20px;background:rgba(255,255,255,.2);margin:0 2px;flex-shrink:0;}
''')

html_escaped = escape_for_js_template(modals_html)
js_escaped = js_fixed

output = output.replace('INJECT_CSS', '`' + css_escaped + '`')
output = output.replace('INJECT_HTML', '`' + html_escaped + '`')
output = output.replace('INJECT_JS', js_escaped)

with open('outrigger-demo/favorites.js', 'w') as f:
    f.write(output)

print(f"\nWrote favorites.js: {len(output)} chars, {output.count(chr(10))} lines")
