#!/bin/bash
set -e

# Create output directories
mkdir -p public/demo
mkdir -p public/demo-2

# Copy static site files
cp -r favorites-prototype/public/. public/
cp -r outrigger-demo/. public/demo/
# /demo-2/ — parallel iteration sandbox, served alongside /demo/
cp -r outrigger-demo-2/. public/demo-2/

# Copy self-hosted CDN assets (checked into repo, fetched via Chrome to bypass Cloudflare)
if [ -d "outrigger-demo/cdn" ]; then
  mkdir -p public/cdn
  cp -r outrigger-demo/cdn/. public/cdn/
  echo "Copied self-hosted CDN assets"
fi

# Rewrite CSS paths from absolute outrigger.com to local /cdn/
if [ -f public/cdn/dist/css/main.css ]; then
  sed -i 's|url("https://www.outrigger.com/dist/|url("/cdn/dist/|g' public/cdn/dist/css/main.css
  sed -i 's|url(https://www.outrigger.com/dist/|url(/cdn/dist/|g' public/cdn/dist/css/main.css
  echo "Rewrote CSS paths to local /cdn/"
fi

# Cache-busting — rewrite favorites.js references in HTML with a
# per-build hash so browsers always fetch the latest file. The hash
# is the first 8 chars of an md5 of the actual favorites.js content,
# so each script change forces a fresh download but identical
# rebuilds reuse the same hash.
for demo_dir in public/demo public/demo-2; do
  if [ -f "$demo_dir/favorites.js" ]; then
    JS_HASH=$(md5sum "$demo_dir/favorites.js" | cut -c1-8)
    find "$demo_dir" -name "*.html" -print0 | xargs -0 sed -i \
      "s|src=\"favorites.js\"|src=\"favorites.js?v=${JS_HASH}\"|g"
    echo "Cache-busted favorites.js in $demo_dir (v=${JS_HASH})"
  fi
done

echo "Build complete!"
