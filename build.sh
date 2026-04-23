#!/bin/bash
set -e

# Create output directories
mkdir -p public/demo
mkdir -p public/cdn/dist/css
mkdir -p public/cdn/dist/fonts
mkdir -p public/cdn/dist/images
mkdir -p public/cdn/dist/js/components
mkdir -p public/cdn/globalassets/outrigger/images/logo
mkdir -p public/cdn/globalassets/outrigger/images/icons
mkdir -p public/cdn/globalassets/outrigger/images
mkdir -p public/cdn/globalassets/outrigger/videos/orh
mkdir -p public/cdn/globalassets/outrigger/videos/cds
mkdir -p public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2
mkdir -p public/cdn/contentassets/153a646302cd479e9383b2519134925d
mkdir -p public/cdn/contentassets/73e31084b0da4e438a84182a9c6d01a1
mkdir -p public/cdn/-/media/images/outrigger/logo

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
BASE="https://www.outrigger.com"

download() {
  local url="$1"
  local dest="$2"
  echo "Downloading: $url"
  curl -sL -o "$dest" -H "User-Agent: $UA" -H "Referer: https://www.outrigger.com/" --max-time 30 "$url" || echo "WARN: Failed to download $url"
}

# === CSS FILES ===
download "$BASE/dist/css/main.css" "public/cdn/dist/css/main.css"
download "$BASE/dist/css/modal-video.min.css" "public/cdn/dist/css/modal-video.min.css"

# === FONT FILES ===
for font in DuplicateSans-Bold DuplicateSans-Black DuplicateSans-Regular DuplicateSans-Medium \
  DuplicateIonic-Regular DuplicateIonic-Black DuplicateIonic-Light DuplicateIonic-Medium \
  DuplicateIonic-Bold DuplicateIonic-BoldItalic Montserrat-Light Montserrat-Regular \
  Montserrat-Medium Montserrat-Bold; do
  download "$BASE/dist/fonts/${font}.woff" "public/cdn/dist/fonts/${font}.woff"
done

# === CSS REFERENCED IMAGES ===
for img in carousel-icon-left.png carousel-icon-right.png card-simplified-slider-arrow-left.svg \
  card-simplified-slider-arrow-right.svg left-arrow-new.svg right-arrow-new.svg \
  white-pattern.svg dark-pattern.svg sand-pattern.svg pattern-food-and-drinks.png \
  angle-down.svg pattern-book-now.png right-arrow.png list-marker.svg \
  angle-down-accordion.svg room-close-modal-gallery.svg mobile-room-close-modal-gallery.svg \
  caret-right.svg caret-left.svg caret-down.svg close.svg close.png \
  promotion-banner-back.svg dropdown.svg; do
  download "$BASE/dist/images/${img}" "public/cdn/dist/images/${img}"
done

# === LOGO / ICON SVGs ===
download "$BASE/globalassets/outrigger/images/logo/outrigger-logo-only-sig-blue-rgb.svg" "public/cdn/globalassets/outrigger/images/logo/outrigger-logo-only-sig-blue-rgb.svg"
download "$BASE/globalassets/outrigger/images/logo/outrigger-logo-only-white.svg" "public/cdn/globalassets/outrigger/images/logo/outrigger-logo-only-white.svg"
download "$BASE/globalassets/outrigger/images/logo/outrigger-logo-only-white.png" "public/cdn/globalassets/outrigger/images/logo/outrigger-logo-only-white.png"
download "$BASE/globalassets/outrigger/images/icons/help-icon.svg" "public/cdn/globalassets/outrigger/images/icons/help-icon.svg"
download "$BASE/globalassets/outrigger/images/icons/user.svg" "public/cdn/globalassets/outrigger/images/icons/user.svg"
download "$BASE/globalassets/outrigger/images/icons/france.png" "public/cdn/globalassets/outrigger/images/icons/france.png"
download "$BASE/globalassets/outrigger/images/icons/japan.png" "public/cdn/globalassets/outrigger/images/icons/japan.png"
download "$BASE/globalassets/outrigger/images/icons/south-korea.png" "public/cdn/globalassets/outrigger/images/icons/south-korea.png"
download "$BASE/globalassets/outrigger/images/icons/united-states.png" "public/cdn/globalassets/outrigger/images/icons/united-states.png"
download "$BASE/globalassets/outrigger/images/global-hotel-alliance-logo.svg" "public/cdn/globalassets/outrigger/images/global-hotel-alliance-logo.svg"
download "$BASE/globalassets/outrigger/images/fb.svg" "public/cdn/globalassets/outrigger/images/fb.svg"
download "$BASE/globalassets/outrigger/images/insta.svg" "public/cdn/globalassets/outrigger/images/insta.svg"
download "$BASE/globalassets/outrigger/images/pinterest.svg" "public/cdn/globalassets/outrigger/images/pinterest.svg"
download "$BASE/globalassets/outrigger/images/youtb.svg" "public/cdn/globalassets/outrigger/images/youtb.svg"
download "$BASE/-/media/images/outrigger/logo/outrigger-hotels-and-resorts-logo-blue2.png" "public/cdn/-/media/images/outrigger/logo/outrigger-hotels-and-resorts-logo-blue2.png"

# === CONTENT ASSETS (header icons) ===
download "$BASE/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/light.svg" "public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/light.svg"
download "$BASE/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/dark.svg" "public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/dark.svg"
download "$BASE/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/language.svg" "public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/language.svg"
download "$BASE/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/language-dark.svg" "public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/language-dark.svg"
download "$BASE/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/members.svg" "public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/members.svg"
download "$BASE/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/members-dark.svg" "public/cdn/contentassets/37f4cbb63f8a4b70bd83a3f15d1febd2/members-dark.svg"
download "$BASE/contentassets/153a646302cd479e9383b2519134925d/russian.png" "public/cdn/contentassets/153a646302cd479e9383b2519134925d/russian.png"
download "$BASE/contentassets/73e31084b0da4e438a84182a9c6d01a1/german.png" "public/cdn/contentassets/73e31084b0da4e438a84182a9c6d01a1/german.png"

# === JS FILES (check what's referenced) ===
# These are loaded via script tags in the HTML
for js in main.js modal-video.min.js; do
  download "$BASE/dist/js/components/${js}" "public/cdn/dist/js/components/${js}" 2>/dev/null
done

# === VIDEOS (large but needed for demo) ===
download "$BASE/globalassets/outrigger/videos/orh/24-1362-orh-homepage-hero-video.mp4" "public/cdn/globalassets/outrigger/videos/orh/24-1362-orh-homepage-hero-video.mp4"
download "$BASE/globalassets/outrigger/videos/cds/auana---final-60sec-1920x1080.mp4" "public/cdn/globalassets/outrigger/videos/cds/auana---final-60sec-1920x1080.mp4"

# === Now download ALL AdaptiveImages referenced in the HTML ===
# Extract unique image paths, download each
echo "Downloading AdaptiveImages..."
for f in outrigger-demo/index.html outrigger-demo/rooms.html outrigger-demo/offers.html; do
  grep -oP '/cdn/AdaptiveImages/[^"'\''<>\s)&\\]+\.(jpg|jpeg|png|webp)' "$f" 2>/dev/null
done | sort -u | while read -r path; do
  url="${BASE}${path#/cdn}"
  dest="public${path}"
  dir=$(dirname "$dest")
  mkdir -p "$dir"
  download "$url" "$dest"
done

# === Copy static site files ===
cp -r favorites-prototype/public/. public/
cp -r outrigger-demo/. public/demo/

# Rewrite CSS font/image paths from relative to /cdn/ paths
if [ -f public/cdn/dist/css/main.css ]; then
  sed -i 's|url("/dist/|url("/cdn/dist/|g' public/cdn/dist/css/main.css
  sed -i 's|url(/dist/|url(/cdn/dist/|g' public/cdn/dist/css/main.css
  echo "Rewrote CSS paths"
fi

echo "Build complete!"
