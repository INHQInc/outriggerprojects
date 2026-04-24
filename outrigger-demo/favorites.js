"use strict";

// ═══════════════════════════════════════════════════════════════
// OUTRIGGER FAVORITES — Full-Featured Demo Script
// Injects: CSS, modal HTML, tray, toast, heart buttons, all logic
// ═══════════════════════════════════════════════════════════════

// ── Inject CSS ──────────────────────────────────────────────────
var style = document.createElement("style");
style.textContent = `:root {
            /* Brand colors */
            --clr-primary:      #0F4A5A;
            --clr-primary-dark: #004561;
            --clr-accent:       #E04F5F;
            --clr-bg-page:      #EEECE4;
            --clr-bg-warm:      #f5f3ee;   /* warm off-white for subgroup containers */
            --clr-bg-card:      #fff;
            --clr-bg-resort:    #DCF3F2;   /* teal tint for favorited resort cards */
            --clr-text:         #1a1a1a;
            --clr-text-dark:    #252525;
            --clr-text-muted:   #666;
            --clr-text-faint:   #999;
            --clr-border:       #e8e5de;
            --clr-border-med:   #e0ddd6;

            /* Typography — DuplicateIonic (display), DuplicateSans (UI), Montserrat (nav/hero only) */
            --ff-display:       'DuplicateIonic-Light', Georgia, serif;
            --ff-display-bold:  'DuplicateIonic-Bold', Georgia, serif;
            --ff-body:          'DuplicateSans-Regular', system-ui, sans-serif;
            --ff-body-med:      'DuplicateSans-Medium', system-ui, sans-serif;
            --ff-body-bold:     'DuplicateSans-Bold', system-ui, sans-serif;
            --ff-nav:           'Montserrat', system-ui, sans-serif; /* nav + hero utility only */

            /* Cards */
            --card-border:      1px solid #e8e5de;
            --card-radius:      6px;
            --card-shadow:      none;
            --card-shadow-h:    0 4px 16px rgba(0,0,0,0.10);

            /* CTAs — Outrigger style: square corners, bold border, no fill */
            --btn-border:       2px solid var(--clr-text);
            --btn-border-brand: 2px solid var(--clr-primary);
            --btn-radius:       3px;
            --btn-pad:          14px 24px;
            --btn-ff:           var(--ff-body-med);
            --btn-size:         14px;
            --btn-tracking:     0.3px;
        }
.favorite-btn {
            position: absolute; top: 12px; right: 12px; z-index: 10;
            width: 36px; height: 36px; border: none; border-radius: 50%;
            background: rgba(255,255,255,0.85); backdrop-filter: blur(4px);
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            padding: 0; transition: transform 0.2s ease, background-color 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        }
        .favorite-btn:hover { transform: scale(1.1); background: rgba(255,255,255,1); }
        .favorite-btn:active { transform: scale(0.95); }
        .favorite-btn svg { width: 20px; height: 20px; transition: all 0.3s ease; }
        .favorite-btn .heart-outline { stroke: #333; stroke-width: 2; fill: none; }
        .favorite-btn.is-favorited .heart-outline { stroke: #E04F5F; fill: #E04F5F; }
        .favorite-btn.is-favorited .heart-outline { animation: heartPop 0.4s ease; }
        @keyframes heartPop {
            0% { transform: scale(1); } 30% { transform: scale(1.3); }
            60% { transform: scale(0.9); } 100% { transform: scale(1); }
        }
        .card-simplified-slider { position: relative; }

        /* ============================================
           ROOM CARDS — match www.outrigger.com/rooms-suites
           ============================================ */
        .destination-selection .destination-selection-tabs {
            flex-direction: column !important; align-items: flex-start !important;
        }
        .destination-selection .card.swiper-slide {
            background: #fff !important; border: 1px solid #e8e5de; border-radius: 0;
            overflow: hidden; display: flex; flex-direction: column;
        }
        .destination-selection .card-simplified-slider {
            position: relative; overflow: hidden;
        }
        .destination-selection .card-simplified-slider img {
            width: 100%; height: auto; display: block; aspect-ratio: 3/2; object-fit: cover;
        }
        .destination-selection .card-body {
            padding: 24px 28px 32px !important; background: #fff !important;
            flex: 1; display: flex; flex-direction: column;
        }
        .destination-selection .card-body h4 {
            margin: 0 0 12px !important; font-family: 'DuplicateIonic-Bold', Georgia, serif !important;
            font-size: 24px !important; font-weight: 700 !important; line-height: 1.3 !important;
        }
        .destination-selection .card-body h4 a {
            color: #1a1a1a !important; text-decoration: underline !important;
            text-underline-offset: 4px; text-decoration-thickness: 1.5px;
        }
        .destination-selection .card-body h4 a:hover { color: #0F4A5A !important; }
        .destination-selection .card-text {
            font-family: 'DuplicateSans-Regular', sans-serif !important;
            font-size: 16px !important; line-height: 1.6 !important; color: #444 !important;
            margin-bottom: 24px !important; flex: 1;
        }
        .destination-selection .card-cta-info {
            margin-top: auto;
        }
        .destination-selection .card-cta-info .button {
            display: inline-flex !important; align-items: center; gap: 6px;
            border: 2px solid #1a1a1a !important; color: #1a1a1a !important;
            background: transparent !important; padding: 14px 24px !important;
            font-family: 'DuplicateSans-Medium', sans-serif !important;
            font-size: 16px !important; font-weight: 600; text-decoration: none !important;
            letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s;
        }
        .destination-selection .card-cta-info .button:hover {
            background: #1a1a1a !important; color: #fff !important;
        }
        /* Image dots overlay (decorative) */
        .room-img-dots {
            position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
            display: flex; gap: 6px; z-index: 2;
        }
        .room-img-dots span {
            width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.5);
            border: 1px solid rgba(255,255,255,0.8);
        }
        .room-img-dots span.active { background: #fff; }
        /* Image nav arrows (decorative) */
        .room-img-nav {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.7);
            border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
            z-index: 2; transition: background 0.2s;
        }
        .room-img-nav:hover { background: rgba(255,255,255,0.95); }
        .room-img-nav.prev { left: 12px; }
        .room-img-nav.next { right: 12px; }
        /* Gallery icon */
        .room-gallery-icon {
            position: absolute; bottom: 12px; right: 12px; z-index: 2;
            width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.7);
            display: flex; align-items: center; justify-content: center;
        }

        /* Cloned card styles for collection detail */
        .fav-cloned-card { position:relative; border-radius:var(--card-radius); overflow:hidden; box-shadow:var(--card-shadow); transition:box-shadow 0.2s; }
        .fav-cloned-card:hover { box-shadow:var(--card-shadow-h); }
        .fav-cloned-card .card { margin:0!important; width:100%!important; max-width:100%!important; flex:none!important; }
        .fav-cloned-card .card-simplified-slider { position:relative; }
        .fav-cloned-card .fav-item-card__remove:hover { color:var(--clr-accent); text-decoration:underline; }

        /* ============================================
           EMAIL CAPTURE MODAL
           ============================================ */
        .modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 20000; display: none; align-items: center; justify-content: center;
        }
        .modal-overlay.active { display: flex; }
        .modal-overlay__bg {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
        }
        .modal-card {
            position: relative; background: #DCF3F2; width: 100%; max-width: 520px;
            padding: 40px 40px 32px; border-radius: 11px; text-align: center; z-index: 1;
            font-family: 'Montserrat', system-ui, sans-serif;
        }
        .modal-card__close {
            position: absolute; top: 14px; right: 14px; width: 32px; height: 32px;
            border: none; background: transparent; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
        }
        .modal-card__close svg { width: 18px; height: 18px; }
        .modal-card__logo { margin-bottom: 16px; color: #004561; }
        .modal-card__logo svg { width: 50px; height: 50px; }
        .modal-card h2 {
            font-family: 'DuplicateIonic-Light', Georgia, serif;
            font-size: 30px; line-height: 36px; font-weight: 400;
            color: #004561; margin: 0 0 8px;
        }
        .modal-card p { font-size: 14px; line-height: 21px; color: #0F172A; margin: 0 0 20px; }
        .modal-card input[type="email"] {
            width: 300px; height: 50px; padding: 12px 14px; border: 1px solid #999;
            border-radius: 0; font-size: 15px; margin-bottom: 4px;
            font-family: inherit;
        }
        .modal-card input[type="email"]:focus { outline: 2px solid #004561; border-color: #004561; }
        .modal-card__error {
            color: #E04F5F; font-size: 12px; margin: 2px 0 8px; display: none; text-align: left;
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
        }
        .modal-card__error.show { display: block; }
        /* Wrap checkbox + its error together, left-aligned as a group centered in the modal */
        .modal-card__field-group {
            display: flex; flex-direction: column; align-items: flex-start;
            width: 300px; margin: 0 auto 4px;
        }
        .modal-card__field-group .modal-card__error { text-align: left; }
        .modal-card__field-group.has-error .modal-card__checkbox { border: 2px solid #E04F5F; border-radius: 4px; padding: 6px 10px; }
        .modal-card__field-group.has-error .recaptcha-box { border: 2px solid #E04F5F; }
        .modal-card__checkbox {
            display: flex; align-items: center; gap: 8px;
            margin-bottom: 4px; font-size: 13px; color: #0F172A;
        }
        .modal-card__checkbox input { width: 16px; height: 16px; }
        .modal-card__recaptcha {
            display: flex; justify-content: flex-start; margin: 12px 0 4px;
        }
        .recaptcha-box {
            width: 300px; height: 74px; border: 1px solid #d3d3d3; border-radius: 3px;
            background: #f9f9f9; display: flex; align-items: center; padding: 0 14px;
            gap: 10px; font-size: 13px; color: #555; cursor: pointer;
        }
        .recaptcha-box .check {
            width: 24px; height: 24px; border: 2px solid #c1c1c1; border-radius: 3px;
            background: #fff; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        }
        .recaptcha-box.checked .check { background: #0F4A5A; border-color: #0F4A5A; }
        .recaptcha-box.checked .check::after {
            content: ''; display: block; width: 6px; height: 12px;
            border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); margin-top: -2px;
        }
        .modal-card__submit {
            background: #0F4A5A; color: #fff; border: none; font-size: 15px;
            padding: 12px 32px; height: 46px; cursor: pointer;
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            transition: background 0.2s; margin-top: 16px;
        }
        .modal-card__submit:hover { background: #004561; }
        .modal-card__cancel {
            display: block; margin: 10px auto 0; color: #0078CD; font-size: 13px;
            text-decoration: underline; cursor: pointer; background: none; border: none;
            font-family: inherit;
        }
        .modal-card__tabs {
            display: flex; gap: 0; margin-bottom: 20px;
            border-bottom: 2px solid #e8e5de;
        }
        .modal-card__tab {
            flex: 1; padding: 10px 4px; border: none; background: none;
            font-family: 'DuplicateSans-Medium', system-ui, sans-serif;
            font-size: 13px; color: #999; cursor: pointer;
            border-bottom: 2px solid transparent; margin-bottom: -2px;
            transition: color 0.2s, border-color 0.2s;
        }
        .modal-card__tab:hover { color: #666; }
        .modal-card__tab.active {
            color: #0F4A5A; border-bottom-color: #0F4A5A;
        }
        .modal-card__sent-confirmation {
            text-align: center; padding: 20px 0;
        }
        .modal-card__sent-confirmation svg {
            width: 48px; height: 48px; color: #0F4A5A; margin-bottom: 12px;
        }
        .modal-card__sent-confirmation h3 {
            font-family: 'DuplicateIonic-Bold', Georgia, serif;
            font-size: 20px; color: #1a1a1a; margin: 0 0 8px;
        }
        .modal-card__sent-confirmation p {
            font-size: 13px; color: #666; margin: 0;
        }

        /* ============================================
           SAVE-TO-TRIP MODAL (Airbnb-style)
           ============================================ */
        .trip-modal .modal-card {
            max-width: 440px; padding: 24px; text-align: left;
        }
        .trip-modal .modal-card h2 {
            font-size: 22px; line-height: 28px; margin-bottom: 16px; text-align: center;
        }
        .trip-list { max-height: 280px; overflow-y: auto; margin-bottom: 16px; }
        .trip-list__item {
            display: flex; align-items: center; gap: 12px; padding: 10px 12px;
            border: 1px solid var(--clr-border-med); border-radius: 0; margin-bottom: 8px;
            cursor: pointer; transition: border-color 0.15s, background 0.15s;
        }
        .trip-list__item:hover { border-color: var(--clr-primary-dark); background: #f8fffe; }
        .trip-list__item.selected { border-color: var(--clr-primary-dark); border-width: 2px; background: #f0faf9; }
        .trip-list__item-img {
            width: 56px; height: 56px; border-radius: 0; object-fit: cover;
            background: #ddd; flex-shrink: 0;
        }
        .trip-list__item-info { flex: 1; }
        .trip-list__item-name {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 14px; font-weight: 600; color: #1a1a1a;
        }
        .trip-list__item-count { font-size: 12px; color: #888; margin-top: 2px; }
        .trip-list__item-check {
            width: 22px; height: 22px; border: 2px solid #ccc; border-radius: 50%;
            flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        }
        .trip-list__item.selected .trip-list__item-check {
            border-color: #004561; background: #004561;
        }
        .trip-list__item.selected .trip-list__item-check::after {
            content: ''; display: block; width: 5px; height: 10px;
            border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); margin-top: -2px;
        }
        .trip-modal__create {
            display: flex; align-items: center; gap: 8px; padding: 10px 0;
            cursor: pointer; color: #004561; font-size: 14px; font-weight: 500;
            background: none; border: none; font-family: inherit; width: 100%;
        }
        .trip-modal__create:hover { color: #0F4A5A; }
        .trip-modal__create-icon {
            width: 56px; height: 56px; border-radius: 0; background: var(--clr-bg-warm);
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .trip-modal__create-icon svg { width: 24px; height: 24px; color: #666; }
        .trip-modal__save {
            width: 100%; background: #0F4A5A; color: #fff; border: none;
            padding: 12px; font-size: 15px; cursor: pointer; border-radius: 0;
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            transition: background 0.2s;
        }
        .trip-modal__save:hover { background: #004561; }
        .trip-modal__save:disabled { background: #ccc; cursor: default; }

        /* Create Trip inline form */
        .create-trip-form {
            display: none; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px;
            margin-bottom: 8px; background: #fafafa;
        }
        .create-trip-form.show { display: block; }
        .create-trip-form input {
            width: 100%; height: 40px; border: 1px solid #999; padding: 8px 12px;
            font-size: 14px; margin-bottom: 8px; font-family: inherit;
        }
        .create-trip-form__actions { display: flex; gap: 8px; }
        .create-trip-form__actions button {
            padding: 6px 16px; font-size: 13px; cursor: pointer; border-radius: 0;
            font-family: inherit;
        }
        .create-trip-form__save {
            background: #0F4A5A; color: #fff; border: none;
        }
        .create-trip-form__cancel {
            background: #fff; color: #333; border: 1px solid #ccc;
        }

        /* ============================================
           FAVORITES LISTING PAGE
           ============================================ */
        .fav-page { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
        .fav-page__header {
            display: flex; align-items: flex-start; justify-content: space-between;
            margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid var(--clr-border);
        }
        .fav-page__title {
            font-family: var(--ff-display);
            font-size: 44px; line-height: 1.1; color: var(--clr-text); margin: 0;
        }
        .fav-page__subtitle {
            font-family: var(--ff-body);
            font-size: 12px; color: var(--clr-text-faint); margin-top: 6px;
            text-transform: uppercase; letter-spacing: 1px;
        }

        /* Trip cards grid */
        .trips-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 24px;
        }
        .trip-card {
            background: var(--clr-bg-card);
            border-radius: var(--card-radius);
            overflow: hidden;
            cursor: pointer; transition: box-shadow 0.2s;
            border: var(--card-border);
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .trip-card:hover { box-shadow: var(--card-shadow-h); }
        .trip-card__images {
            display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 100px 100px;
            height: 200px; gap: 2px; background: var(--clr-border); overflow: hidden; position: relative;
        }
        .trip-card__images img {
            width: 100%; height: 100%; object-fit: cover;
        }
        .trip-card__images .placeholder {
            background: #f0ede6; display: flex; align-items: center; justify-content: center;
        }
        .trip-card__images .placeholder svg { width: 32px; height: 32px; color: #ccc; }
        .trip-card__body { padding: 18px 20px 20px; background: var(--clr-bg-card); position: relative; z-index: 1; }
        .trip-card__name {
            font-family: var(--ff-display-bold);
            font-size: 18px; line-height: 1.3; color: var(--clr-text); margin-bottom: 4px;
        }
        .trip-card__meta {
            font-family: var(--ff-body);
            font-size: 13px; color: var(--clr-text-faint);
        }
        .trip-card__actions {
            display: flex; gap: 8px; margin-top: 12px;
        }
        .trip-card__action-btn {
            font-size: 12px; color: var(--clr-text-muted); background: none;
            border: 1px solid var(--clr-border-med);
            padding: 5px 12px; border-radius: 0; cursor: pointer; font-family: var(--ff-body);
            transition: background 0.15s;
        }
        .trip-card__action-btn:hover { background: #f5f3ee; border-color: #bbb; }
        .trip-card__action-btn.danger:hover { background: #fef2f2; border-color: var(--clr-accent); color: var(--clr-accent); }

        /* Create trip card */
        .trip-card--create {
            border: 2px dashed var(--clr-border-med); background: transparent; display: flex;
            flex-direction: column; align-items: center; justify-content: center;
            min-height: 280px; border-radius: 0; cursor: pointer;
            transition: border-color 0.2s, background 0.2s;
        }
        .trip-card--create:hover { border-color: var(--clr-primary-dark); background: rgba(255,255,255,0.5); }
        .trip-card--create svg { width: 40px; height: 40px; color: #999; margin-bottom: 12px; }
        .trip-card--create span {
            font-family: var(--ff-body);
            font-size: 15px; color: var(--clr-text-muted);
        }

        /* Trip detail view */
        .trip-detail__back {
            display: inline-flex; align-items: center; gap: 6px;
            font-family: var(--ff-body);
            font-size: 13px; color: var(--clr-primary); cursor: pointer; background: none;
            border: none; margin-bottom: 20px; padding: 0;
            text-transform: uppercase; letter-spacing: 1px;
        }
        .trip-detail__back:hover { text-decoration: underline; }
        .trip-detail__header {
            display: flex; align-items: flex-start; justify-content: space-between;
            margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--clr-border);
        }
        .trip-detail__name {
            font-family: var(--ff-display);
            font-size: 40px; color: var(--clr-text); margin: 0; line-height: 1.1;
        }
        .trip-detail__count {
            font-family: var(--ff-body);
            font-size: 13px; color: var(--clr-text-faint); margin-top: 6px;
            text-transform: uppercase; letter-spacing: 0.8px;
        }
        .trip-detail__actions { display: flex; gap: 8px; align-items: center; }
        .trip-detail__action {
            padding: 8px 16px; font-size: 12px;
            border: 1px solid var(--clr-border-med);
            background: var(--clr-bg-card); cursor: pointer; border-radius: 0;
            font-family: var(--ff-body); color: var(--clr-text);
            transition: background 0.15s;
        }
        .trip-detail__action:hover { background: var(--clr-bg-warm); }
        .trip-detail__action.danger { color: var(--clr-accent); border-color: var(--clr-accent); }
        .trip-detail__action.danger:hover { background: #fef2f2; }

        /* Favorites items grid */
        .fav-items-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
            gap: 20px;
        }
        .fav-item-card {
            background: var(--clr-bg-card);
            border: var(--card-border);
            border-radius: var(--card-radius);
            overflow: hidden;
            box-shadow: var(--card-shadow);
            transition: box-shadow 0.2s;
        }
        .fav-item-card:hover { box-shadow: var(--card-shadow-h); }
        .fav-item-card--resort { background: var(--clr-bg-resort); border-color: #b8e0dc; }
        .fav-item-card__img {
            width: 100%; height: 200px; object-fit: cover; display: block;
        }
        .fav-item-card__img-wrap { position: relative; }
        .fav-item-card__img-wrap .favorite-btn { top: 8px; right: 8px; }
        .fav-item-card__type {
            position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.55);
            color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px;
            padding: 3px 8px; border-radius: 0;
            font-family: var(--ff-body-bold);
        }
        .fav-item-card__body { padding: 16px 18px 18px; }
        .fav-item-card__title {
            font-family: var(--ff-display-bold);
            font-size: 18px; line-height: 1.3; color: var(--clr-text); margin-bottom: 4px;
        }
        .fav-item-card__subtitle {
            font-family: var(--ff-body);
            font-size: 12px; color: var(--clr-text-faint); margin-bottom: 14px;
            text-transform: uppercase; letter-spacing: 0.8px;
        }
        .fav-item-card__cta {
            display: flex; gap: 12px; align-items: center;
        }
        .fav-item-card__book {
            display: inline-block;
            border: var(--btn-border);
            border-radius: var(--btn-radius);
            color: var(--clr-text);
            padding: 9px 18px;
            font-size: 12px;
            font-family: var(--ff-body-med);
            letter-spacing: var(--btn-tracking);
            text-decoration: none;
            transition: background 0.2s, color 0.2s;
        }
        .fav-item-card__book:hover { background: var(--clr-text); color: #fff; }
        .fav-item-card__remove {
            font-size: 12px; color: var(--clr-text-faint); cursor: pointer; background: none;
            border: none; font-family: var(--ff-body); padding: 0;
        }
        .fav-item-card__remove:hover { color: var(--clr-accent); text-decoration: underline; }

        /* Empty trip state */
        .trip-detail__empty {
            text-align: center; padding: 60px 20px;
        }
        .trip-detail__empty svg { width: 56px; height: 56px; color: #ccc; margin-bottom: 16px; }
        .trip-detail__empty h3 {
            font-family: var(--ff-display);
            font-size: 26px; color: var(--clr-primary-dark); margin: 0 0 8px;
        }
        .trip-detail__empty p {
            font-family: var(--ff-body);
            font-size: 14px; color: var(--clr-text-muted);
        }

        /* ============================================
           FAVORITES OFFCANVAS TRAY
           ============================================ */
        .fav-tray {
            position: fixed; top: 0; right: -400px; width: 375px; height: 100%;
            background: #fff; z-index: 15000; transition: right 0.3s ease;
            display: flex; flex-direction: column; box-shadow: -4px 0 20px rgba(0,0,0,0.15);
        }
        .fav-tray.open { right: 0; }
        .fav-tray__backdrop {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.3); z-index: 14999; display: none;
        }
        .fav-tray__backdrop.show { display: block; }
        .fav-tray__header {
            padding: 16px 20px; border-bottom: 1px solid #eee;
            display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .fav-tray__header-left {
            display: flex; align-items: center; gap: 8px;
        }
        .fav-tray__header-title {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif; font-size: 15px; color: #1a1a1a;
        }
        .fav-tray__badge {
            background: var(--clr-accent); color: #fff; font-size: 11px; font-weight: 700;
            padding: 2px 7px; border-radius: 10px; font-family: var(--ff-body-bold);
        }
        .fav-tray__close {
            background: none; border: none; cursor: pointer; padding: 4px;
        }
        .fav-tray__body { flex: 1; overflow-y: auto; }
        .fav-tray__section {
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: #999; padding: 14px 20px 6px; border-bottom: 1px solid #f0f0f0;
        }
        .fav-tray__item {
            display: flex; gap: 12px; padding: 10px 20px;
            align-items: center; transition: background 0.15s;
        }
        .fav-tray__item:hover { background: #fafafa; }
        .fav-tray__item-img {
            width: 64px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0;
        }
        .fav-tray__item-content { flex: 1; min-width: 0; }
        .fav-tray__item-name {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 13px; font-weight: 600; color: #1a1a1a; line-height: 1.3;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fav-tray__item-sub {
            font-family: var(--ff-body);
            font-size: 11px; color: var(--clr-text-faint);
        }
        .fav-tray__item-remove {
            width: 24px; height: 24px; border: none; background: transparent;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; flex-shrink: 0;
        }
        .fav-tray__item-remove:hover { background: #f0f0f0; }
        .fav-tray__item-remove svg { width: 14px; height: 14px; color: #ccc; }
        .fav-tray__item-remove:hover svg { color: #E04F5F; }
        .fav-tray__footer {
            padding: 14px 20px; border-top: 1px solid #eee; flex-shrink: 0;
        }
        .fav-tray__footer-btn {
            display: block; width: 100%; text-align: center; background: #0F4A5A;
            color: #fff; font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 13px; padding: 10px 20px; border: none; cursor: pointer;
            text-decoration: none; transition: background 0.2s;
        }
        .fav-tray__footer-btn:hover { background: #004561; color: #fff; }
        .fav-tray__empty {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 60px 20px; text-align: center; flex: 1;
        }
        .fav-tray__empty svg { width: 48px; height: 48px; color: #ccc; margin-bottom: 16px; }
        .fav-tray__empty-title {
            font-family: 'DuplicateIonic-Light', Georgia, serif;
            font-size: 20px; color: #004561; margin-bottom: 6px;
        }
        .fav-tray__empty-text {
            font-family: 'Montserrat', system-ui, sans-serif;
            font-size: 13px; color: #888; line-height: 1.5;
        }

        /* Tray heading & recents */
        .fav-tray__heading {
            font-family: 'DuplicateIonic-Light', Georgia, serif;
            font-size: 22px; color: #1a1a1a; padding: 16px 20px 4px;
            border-bottom: 1px solid #f0f0f0;
        }
        .fav-tray__recents-label {
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: #999; padding: 14px 20px 6px;
        }
        .fav-tray__view-more {
            display: block; width: 100%; text-align: left; padding: 6px 20px 12px;
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 13px; color: #0F4A5A; background: none; border: none;
            cursor: pointer;
        }
        .fav-tray__view-more:hover { color: #004561; }
        .fav-tray__collections-label {
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: #999; padding: 14px 20px 6px;
        }
        .fav-tray__collection-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 20px; cursor: pointer;
        }
        .fav-tray__collection-row:hover { background: #fafafa; }
        .fav-tray__collection-name {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 14px; color: #1a1a1a; font-weight: 600;
        }
        .fav-tray__collection-count {
            font-family: var(--ff-body);
            font-size: 12px; color: var(--clr-text-faint);
        }

        /* Tray section headers */
        .fav-tray__section-header {
            display: flex; align-items: center; gap: 8px;
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: #999; padding: 18px 20px 8px;
        }
        .fav-tray__section-header svg { flex-shrink: 0; width: 14px; height: 14px; }

        /* Tray signup CTA (no RIID state) */
        .fav-tray__signup-cta {
            padding: 28px 24px; text-align: center;
        }
        .fav-tray__signup-icon { margin-bottom: 12px; }
        .fav-tray__signup-title {
            font-family: 'DuplicateIonic-Bold', Georgia, serif;
            font-size: 20px; color: #1a1a1a; margin-bottom: 8px; line-height: 1.3;
        }
        .fav-tray__signup-desc {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 20px;
        }
        .fav-tray__signup-btn {
            display: inline-block; width: 100%; padding: 14px 20px;
            font-family: var(--ff-body-med);
            font-size: 14px; color: #fff; background: var(--clr-primary);
            border: none; border-radius: var(--btn-radius); cursor: pointer;
            transition: background 0.2s; text-align: center;
        }
        .fav-tray__signup-btn:hover { background: var(--clr-primary-dark); }

        /* Tray empty inline state (signed up, no items) */
        .fav-tray__empty-inline {
            padding: 28px 24px; text-align: center;
        }
        .fav-tray__empty-icon { margin-bottom: 10px; }
        .fav-tray__empty-inline .fav-tray__empty-text {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 13px; color: #999; line-height: 1.6;
        }

        /* View All Favorites button */
        .fav-tray__view-all-btn {
            display: block; width: calc(100% - 40px); margin: 12px 20px;
            padding: 12px; text-align: center;
            font-family: var(--ff-body-med);
            font-size: 13px; color: var(--clr-primary); background: var(--clr-bg-warm);
            border: 1px solid var(--clr-border-med); border-radius: 0; cursor: pointer;
            transition: background 0.2s;
        }
        .fav-tray__view-all-btn:hover { background: #e8e6de; }

        /* Collection mini-cards in tray (Option A) */
        .fav-tray__card {
            margin: 10px 20px; border-radius: 0; overflow: hidden;
            background: var(--clr-bg-card); border: var(--card-border); cursor: pointer;
            transition: box-shadow 0.2s;
        }
        .fav-tray__card:hover { box-shadow: var(--card-shadow-h); }
        .fav-tray__card-thumbs {
            display: flex; height: 80px; gap: 2px; background: #e8e5de;
        }
        .fav-tray__card-thumbs img {
            flex: 1; min-width: 0; height: 100%; object-fit: cover;
        }
        .fav-tray__card-thumbs .fav-tray__card-placeholder {
            flex: 1; min-width: 0; height: 100%;
            background: #f0ede6; display: flex; align-items: center; justify-content: center;
        }
        .fav-tray__card-placeholder svg { width: 20px; height: 20px; }
        .fav-tray__card-placeholder svg path { stroke: #d4d0c8 !important; fill: none !important; }
        .fav-tray__card-body {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 14px;
        }
        .fav-tray__card-name {
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 14px; color: #1a1a1a;
        }
        .fav-tray__card-count {
            font-family: var(--ff-body);
            font-size: 11px; color: var(--clr-text-faint); white-space: nowrap;
        }
        .fav-tray__card-arrow {
            margin-left: 8px; flex-shrink: 0;
        }
        .fav-tray__card-arrow polyline { stroke: #999 !important; }

        /* "View X more collections" CTA */
        .fav-tray__more-collections {
            display: block; width: calc(100% - 40px); margin: 4px 20px 8px; padding: 0;
            font-family: 'DuplicateSans-Medium', system-ui, sans-serif;
            font-size: 13px; color: #0F4A5A; background: none; border: none;
            cursor: pointer; text-align: center;
        }
        .fav-tray__more-collections:hover { color: #004561; text-decoration: underline; }

        /* Quiz section — warm background to visually separate from favorites */
        .fav-tray__quiz-section {
            background: #f8f6f2; margin-top: 8px; padding-bottom: 20px;
        }
        .fav-tray__quiz-section .fav-tray__section-header {
            color: #999; padding-top: 16px;
        }

        /* Trip Planner Quiz CTA card */
        .fav-tray__quiz-cta { padding: 8px 20px 0; }
        .fav-tray__quiz-card {
            display: block; text-decoration: none; color: inherit;
            border-radius: 0; overflow: hidden;
            background: var(--clr-bg-card); border: var(--card-border); transition: box-shadow 0.2s;
        }
        .fav-tray__quiz-card:hover { box-shadow: var(--card-shadow-h); }
        .fav-tray__quiz-img {
            width: 100%; height: 140px; overflow: hidden;
        }
        .fav-tray__quiz-img img {
            width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .fav-tray__quiz-content { padding: 14px 16px 16px; }
        .fav-tray__quiz-eyebrow {
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
            color: #999; margin-bottom: 4px;
        }
        .fav-tray__quiz-title {
            font-family: 'DuplicateIonic-Bold', Georgia, serif;
            font-size: 18px; color: #1a1a1a; margin-bottom: 6px; line-height: 1.3;
        }
        .fav-tray__quiz-desc {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 13px; color: #666; line-height: 1.5; margin-bottom: 10px;
        }
        .fav-tray__quiz-btn {
            font-family: 'DuplicateSans-Medium', system-ui, sans-serif;
            font-size: 13px; color: #0F4A5A; font-weight: 600;
        }

        /* ============================================
           MOBILE NAVIGATION PANEL
           ============================================ */
        .mobile-nav {
            position: fixed; top: 0; left: 0; width: 85%; max-width: 400px;
            height: 100%; background: #0B2F47 !important; z-index: 10010;
            display: flex; flex-direction: column;
            transform: translateX(-100%); transition: transform 0.35s ease;
        }
        .mobile-nav.open { transform: translateX(0); }
        .mobile-nav__backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 10009;
            display: none;
        }
        .mobile-nav__backdrop.show { display: block; }
        .mobile-nav__header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 24px; flex-shrink: 0;
        }
        .mobile-nav__close {
            background: none; border: none; cursor: pointer; padding: 0;
            display: flex; align-items: center; justify-content: center;
        }
        .mobile-nav__logo { display: flex; align-items: center; margin: 0 auto; }
        .mobile-nav__body {
            flex: 1; overflow-y: auto; padding: 10px 0;
        }
        .mobile-nav__primary { padding: 0 28px; }
        .mobile-nav__primary-link {
            display: flex; align-items: center; justify-content: space-between;
            font-family: 'DuplicateIonic-Light', Georgia, serif;
            font-size: 28px; color: #fff; text-decoration: none;
            padding: 14px 0; border: none;
        }
        .mobile-nav__primary-link:hover { color: #cce0e6; }
        .mobile-nav__secondary { padding: 20px 28px 0; }
        .mobile-nav__secondary-link {
            display: block;
            font-family: 'DuplicateSans-Regular', sans-serif;
            font-size: 16px; color: rgba(255,255,255,0.85); text-decoration: none;
            padding: 10px 0;
        }
        .mobile-nav__secondary-link:hover { color: #fff; }
        .mobile-nav__bottom-bar {
            flex-shrink: 0; display: flex !important; align-items: center; justify-content: space-around;
            padding: 12px 8px 60px; border-top: 1px solid rgba(255,255,255,0.2);
            background: rgba(0,0,0,0.12);
        }
        .mobile-nav__bottom-item {
            display: flex !important; flex-direction: column; align-items: center; gap: 4px;
            background: none !important; border: none !important; color: #fff !important;
            cursor: pointer; padding: 6px 12px;
            font-family: 'DuplicateSans-Regular', sans-serif !important;
            font-size: 11px !important; text-align: center; line-height: 1.2;
        }
        .mobile-nav__bottom-item:hover { color: #fff !important; }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item svg,
        .mobile-nav__bottom-item svg {
            color: #fff !important; width: 22px !important; height: 22px !important;
            fill: none !important; stroke: #fff !important;
        }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item svg path,
        .mobile-nav__bottom-item svg path { stroke: #fff !important; fill: none !important; }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item svg circle,
        .mobile-nav__bottom-item svg circle { stroke: #fff !important; fill: none !important; }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item svg line,
        .mobile-nav__bottom-item svg line { stroke: #fff !important; }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item svg rect,
        .mobile-nav__bottom-item svg rect { stroke: #fff !important; fill: none !important; }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item svg path[fill="currentColor"],
        .mobile-nav__bottom-item svg path[fill="currentColor"] { fill: #fff !important; }
        .mobile-nav .mobile-nav__bottom-bar .mobile-nav__bottom-item span,
        .mobile-nav__bottom-item span {
            color: #fff !important; font-size: 11px !important; display: block !important;
            visibility: visible !important; opacity: 1 !important;
        }

        /* Tray resort grouping */
        .fav-tray__resort-group {
            padding-bottom: 4px;
        }
        .fav-tray__resort-name {
            font-family: 'DuplicateSans-Bold', system-ui, sans-serif;
            font-size: 12px; color: #0F4A5A; padding: 12px 20px 4px;
            text-transform: uppercase; letter-spacing: 1px;
        }

        /* Favorites page resort grouping */
        .fav-resort-group { margin-bottom: 32px; }
        .fav-resort-group__header {
            display: flex; justify-content: space-between; align-items: baseline;
            padding: 0 0 12px; margin-bottom: 16px;
            border-bottom: 2px solid #0F4A5A;
        }
        .fav-resort-group__name {
            font-family: 'DuplicateIonic-Bold', Georgia, serif;
            font-size: 22px; color: #1a1a1a;
        }
        .fav-resort-group__header-right {
            display: flex; align-items: baseline; gap: 16px;
        }
        .fav-resort-group__count {
            font-family: 'DuplicateSans-Regular', system-ui, sans-serif;
            font-size: 14px; color: #888;
        }
        .fav-resort-group__view-link {
            font-family: 'DuplicateSans-Medium', system-ui, sans-serif;
            font-size: 13px; color: #0F4A5A; text-decoration: none;
            white-space: nowrap;
        }
        .fav-resort-group__view-link:hover { text-decoration: underline; }
        /* Resort sub-grouping: each resort in its own contained visual block */
        .fav-resort-subgroup {
            background: var(--clr-bg-warm); border-radius: 0;
            border: 1px solid var(--clr-border);
            padding: 20px 24px 24px; margin: 0 0 24px;
        }
        .fav-resort-subgroup__header {
            display: flex; justify-content: space-between; align-items: baseline;
            padding: 0 0 12px; margin-bottom: 16px;
            border-bottom: 1px solid var(--clr-border-med);
        }
        .fav-resort-subgroup__name {
            font-family: var(--ff-display-bold);
            font-size: 18px; color: var(--clr-primary);
        }
        /* Resort card standalone — col 1 of a 3-col grid = exact same width as a room card */
        .fav-resort-standalone {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 20px; margin-bottom: 16px;
        }
        /* Unfavorited resort card: white bg, dashed outline heart */
        .fav-item-card--resort-unfav { background: #fff; }
        .fav-item-card--resort-unfav .favorite-btn svg path { fill: none; stroke: #aaa; stroke-width: 1.5px; }

        /* Header badge — iOS-style red notification dot */
        .header-fav-badge {
            position: absolute; top: -6px; right: -8px;
            background: var(--clr-accent); color: #fff; font-size: 11px; font-weight: 700;
            min-width: 20px; height: 20px; border-radius: 10px;
            display: none; align-items: center; justify-content: center;
            font-family: var(--ff-body-bold);
            padding: 0 5px; box-sizing: border-box;
            line-height: 1; pointer-events: none; z-index: 10;
            transform: scale(0); transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .header-fav-badge.show { display: flex; transform: scale(1); }
        .header-fav-badge.pop { animation: badgePop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes badgePop {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }

        /* Toast */
        .toast-msg {
            position: fixed; bottom: 64px; left: 50%; z-index: 20001;
            transform: translateX(-50%) translateY(80px); opacity: 0;
            background: var(--clr-text); color: #fff; padding: 10px 20px; border-radius: 0;
            font-family: var(--ff-body); font-size: 13px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: all 0.3s ease;
            display: flex; align-items: center; gap: 8px; white-space: nowrap;
        }
        .toast-msg.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast-msg svg { width: 16px; height: 16px; fill: #E04F5F; flex-shrink: 0; }

        /* Rename modal */
        .rename-modal .modal-card { max-width: 380px; padding: 24px; }
        .rename-modal .modal-card h2 { font-size: 22px; margin-bottom: 14px; }
        .rename-modal input[type="text"] {
            width: 100%; height: 44px; border: 1px solid #999; padding: 8px 12px;
            font-size: 14px; margin-bottom: 14px; font-family: inherit;
        }
        .rename-modal__save {
            background: #0F4A5A; color: #fff; border: none; padding: 10px 24px;
            font-size: 14px; cursor: pointer; font-family: inherit;
        }

        /* Create collection modal */
        .create-collection-modal .modal-card { max-width: 400px; padding: 28px; }
        .create-collection-modal .modal-card h2 {
            font-family: 'DuplicateIonic-Light', Georgia, serif;
            font-size: 20px; font-weight: 300; color: #0F4A5A; margin-bottom: 16px;
        }
        .create-collection-modal .create-row {
            display: flex; gap: 0; align-items: stretch;
        }
        .create-collection-modal .create-row input[type="text"] {
            flex: 1; height: 42px; border: 1px solid #bbb; border-right: none;
            padding: 0 12px; font-size: 13px; font-family: var(--ff-body);
            border-radius: 0; margin: 0;
        }
        .create-collection-modal .create-row input[type="text"]::placeholder {
            color: #aaa; font-size: 13px;
        }
        .create-collection-modal .create-row input[type="text"]:focus {
            outline: 2px solid var(--clr-primary-dark); border-color: var(--clr-primary-dark); z-index: 1;
        }
        .create-collection-modal .create-row button {
            height: 42px; padding: 0 20px; font-size: 13px; font-weight: 600;
            background: var(--clr-primary); color: #fff; border: 1px solid var(--clr-primary);
            cursor: pointer; font-family: var(--ff-body-med); border-radius: 0;
            white-space: nowrap;
        }
        .create-collection-modal .create-row button:hover { background: var(--clr-primary-dark); }

        /* Confirm delete modal */
        .confirm-modal .modal-card { max-width: 380px; padding: 24px; background: #fff; }
        .confirm-modal .modal-card h2 { color: #E04F5F; font-size: 22px; }
        .confirm-modal .modal-card p { font-size: 13px; color: #555; }
        .confirm-modal__btns { display: flex; gap: 10px; justify-content: center; }
        .confirm-modal__btns button {
            padding: 10px 24px; font-size: 14px; cursor: pointer; font-family: inherit;
        }
        .confirm-modal__delete { background: #E04F5F; color: #fff; border: none; }
        .confirm-modal__cancel { background: #fff; color: #333; border: 1px solid #ccc; }
    
/* Demo nav bar */
.demo-nav-bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:2px;background:#1a1a1a;border-radius:40px;padding:4px;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap;}
.demo-nav-bar a,.demo-nav-bar button{color:#fff;font-size:12px;font-weight:600;text-decoration:none;padding:7px 15px;border-radius:36px;white-space:nowrap;transition:background .15s;letter-spacing:.02em;border:none;background:transparent;cursor:pointer;font-family:inherit;}
.demo-nav-bar a:hover,.demo-nav-bar button:hover{background:rgba(255,255,255,.13);}
.demo-nav-bar a.active{background:rgba(255,255,255,.18);}
.demo-nav-bar .demo-sep{width:1px;height:20px;background:rgba(255,255,255,.2);margin:0 2px;flex-shrink:0;}

        /* Make property carousel scrollable on homepage */
        .destination-selection-slider .swiper-wrapper {
            display: flex !important;
            overflow-x: auto !important;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            gap: 12px;
        }
        .destination-selection-slider .swiper-wrapper::-webkit-scrollbar { display: none; }
        .destination-selection-slider .swiper-slide {
            flex: 0 0 auto !important;
            scroll-snap-align: start;
        }
`;
document.head.appendChild(style);

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
  document.querySelectorAll(".card.loaded[data-room-id]").forEach(function(card) {
    if (card.querySelector(".favorite-btn")) return;
    var slider = card.querySelector(".card-simplified-slider");
    if (!slider) return;
    slider.style.position = "relative";
    var roomId = card.getAttribute("data-room-id") || "";
    var roomName = card.getAttribute("room_type_name") || (card.querySelector("[room_type_name]") ? card.querySelector("[room_type_name]").getAttribute("room_type_name") : "") || roomId || "Room";
    var resortName = card.getAttribute("property_name") || card.closest("[property_name]")?.getAttribute("property_name") || (card.querySelector("[property_name]") ? card.querySelector("[property_name]").getAttribute("property_name") : "") || "";
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
    var btn=document.createElement("button");
    btn.className="favorite-btn";
    btn.dataset.type="Room";
    btn.dataset.id=roomId;
    btn.dataset.roomId=roomId;
    btn.innerHTML=heartSVG;
    var _st=JSON.parse(localStorage.getItem('outrigger_proto_state')||"{}");var trips=(_st.trips||[]);
    var isFav=trips.some(function(t){return t.items&&t.items.some(function(it){return it.id===roomId;});});
    if(isFav)btn.classList.add("is-favorited");
    btn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();handleFavoriteClick(btn);});
    sl.appendChild(btn);
  });

    // Offer cards (offers page + homepage offer sliders)
  var offerSel = ".card.swiper-slide:not([property_id]):not([data-room-id])";
  document.querySelectorAll(offerSel).forEach(function(card, i) {
    if (card.querySelector(".favorite-btn")) return;
    if(card.closest('.food-and-drinks-slider')||card.closest('.related-articles-slider'))return;
    if(card.classList.contains('promo-card'))return;
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
        // UNFAVORITE: remove from all trips
        state.trips.forEach(t => { t.items = t.items.filter(i => i.id !== id); });
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
    let html = '<div class="fav-page"><div class="fav-page__header"><div><h1 class="fav-page__title">My Favorites</h1><div class="fav-page__subtitle">' + state.trips.length + ' collection' + (state.trips.length !== 1 ? 's' : '') + ' &middot; ' + totalItems + ' saved items</div></div></div>';
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
    html += '<button class="trip-detail__back" onclick="backToTrips()">&larr; Back to all collections</button>';
    html += '<div class="trip-detail__header"><div><h1 class="trip-detail__name">' + trip.name + '</h1><div class="trip-detail__count">' + trip.items.length + ' saved items</div></div>';
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

        /* Pass 1: index resorts and offers */
        trip.items.forEach(function(item) {
            if (item.type === 'Offer') {
                offerItems.push(item);
            } else if (item.type === 'Resort') {
                var dest = item.sub || 'Hawaii';
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

        /* Render destination groups */
        destOrder.forEach(function(dest) {
            var destData = destMap[dest];
            var totalItems = 0;
            destData.resortOrder.forEach(function(rn) {
                var rg = destData.resorts[rn];
                if (rg.resortItem) totalItems++;
                totalItems += rg.rooms.length;
            });

            html += '<div class="fav-resort-group">';
            html += '<div class="fav-resort-group__header"><div class="fav-resort-group__name">' + dest + '</div>';
            html += '<div class="fav-resort-group__header-right"><span class="fav-resort-group__count">' + totalItems + ' saved</span></div></div>';

            destData.resortOrder.forEach(function(resortName) {
                var rg = destData.resorts[resortName];
                var resortUrl = (rg.resortItem && rg.resortItem.hotelUrl) || (rg.rooms.length > 0 ? rg.rooms[0].hotelUrl : null) || resortUrlsMap[resortName] || null;

                html += '<div class="fav-resort-subgroup">';
                html += '<div class="fav-resort-subgroup__header"><div class="fav-resort-subgroup__name">' + resortName + '</div>';
                if (resortUrl) {
                    html += '<a href="' + resortUrl + '" target="_blank" class="fav-resort-group__view-link">View Resort &rsaquo;</a>';
                }
                html += '</div>';
                /* Always render resort card — favorited (teal + filled heart) or not (white + outline) */
                html += '<div class="fav-resort-standalone">';
                if (rg.resortItem) {
                    html += renderItemCard(rg.resortItem, trip.id, rg.resortItem.hotelUrl || resortUrl || '#');
                } else {
                    var resortImg = resortImgMap[resortName] || (rg.rooms.length > 0 ? rg.rooms[0].img : '');
                    var resortDest = resortToDestMap[resortName] || dest;
                    html += renderUnfavoritedResortCard(resortName, resortImg, resortUrl || '#', trip.id, resortDest);
                }
                html += '</div>';
                if (rg.rooms.length > 0) {
                    html += '<div class="fav-items-grid">';
                    rg.rooms.forEach(function(room) {
                        html += renderItemCard(room, trip.id, room.roomUrl || room.hotelUrl || '#');
                    });
                    html += '</div>';
                }
                html += '</div>';
            });

            html += '</div>';
        });

        /* Offers section */
        if (offerItems.length > 0) {
            html += '<div class="fav-resort-group">';
            html += '<div class="fav-resort-group__header"><div class="fav-resort-group__name">Special Offers</div>';
            html += '<div class="fav-resort-group__header-right"><span class="fav-resort-group__count">' + offerItems.length + ' offer' + (offerItems.length !== 1 ? 's' : '') + '</span></div></div>';
            html += '<div class="fav-items-grid">';
            offerItems.forEach(function(offer) {
                html += renderItemCard(offer, trip.id, offer.offerUrl || '#');
            });
            html += '</div></div>';
        }
    }
    html += '</div>';
    el.innerHTML = html;
}

function viewTrip(id) { state.currentTripView = id; renderFavoritesPage(); }
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
    if (trip) trip.items = trip.items.filter(i => i.id !== itemId);
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
            var onclick = "switchView('view-favorites');setTimeout(function(){viewTrip('" + t.id + "')},100);closeTray();";
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
            var ov = getComputedStyle(p).overflow;
            if (ov === 'hidden') { p.style.overflow = 'visible'; }
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

// ── Favorites Full Page Overlay (for demo) ──────────────────────
function showFavoritesOverlay() {
  var overlay = document.getElementById("favOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "favOverlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#ffffff;z-index:18000;overflow-y:auto;display:none;";
    overlay.innerHTML = '<div style="position:sticky;top:0;z-index:1;background:#fff;padding:12px 20px;border-bottom:1px solid #e8e5de;display:flex;align-items:center;justify-content:space-between;">' +
      '<button onclick="closeFavoritesOverlay()" style="border:none;background:none;cursor:pointer;font-size:14px;color:#0F4A5A;font-family:inherit;">&larr; Back to browsing</button>' +
      '<span style="font-size:12px;color:#999;">Trip Planner</span>' +
    '</div>' +
    '<div id="favOverlayBody"></div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = "block";
  document.body.style.overflow = "hidden";
  renderFavoritesPage();
}

function closeFavoritesOverlay() {
  var overlay = document.getElementById("favOverlay");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
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
  if (firstSlide) slideW = firstSlide.offsetWidth + 12;
  function updateArrows() {
    if (prevBtn) prevBtn.style.display = wrapper.scrollLeft > 10 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = (wrapper.scrollLeft + wrapper.clientWidth) >= (wrapper.scrollWidth - 10) ? 'none' : '';
  }
  nextBtn.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    wrapper.scrollBy({ left: slideW || 500, behavior: 'smooth' });
    setTimeout(updateArrows, 400);
  });
  if (prevBtn) {
    prevBtn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      wrapper.scrollBy({ left: -(slideW || 500), behavior: 'smooth' });
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


