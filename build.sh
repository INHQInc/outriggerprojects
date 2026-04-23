#!/bin/bash
set -e

# Create output directory
mkdir -p public/demo

# Copy static site files
cp -r favorites-prototype/public/. public/
cp -r outrigger-demo/. public/demo/

# Copy self-hosted CDN assets (checked into repo, fetched via Chrome to bypass Cloudflare)
if [ -d "outrigger-demo/cdn" ]; then
  mkdir -p public/cdn
  cp -r outrigger-demo/cdn/. public/cdn/
  echo "Copied self-hosted CDN assets"
fi

# CSS keeps absolute outrigger.com URLs for fonts and images
# Fonts will fall back to system fonts if cross-origin blocked
# CSS background images may not load but are mostly decorative
echo "CSS uses absolute outrigger.com URLs for fonts/images (fallback safe)"

echo "Build complete!"
