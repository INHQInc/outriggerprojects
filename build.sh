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

# Rewrite CSS paths from absolute outrigger.com to local /cdn/
if [ -f public/cdn/dist/css/main.css ]; then
  sed -i 's|url("https://www.outrigger.com/dist/|url("/cdn/dist/|g' public/cdn/dist/css/main.css
  sed -i 's|url(https://www.outrigger.com/dist/|url(/cdn/dist/|g' public/cdn/dist/css/main.css
  echo "Rewrote CSS paths to local /cdn/"
fi

echo "Build complete!"
