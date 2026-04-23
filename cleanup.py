import re, sys

TRACKING_PATTERNS = [
    # Script src patterns to remove entirely
    r'<script[^>]*src="[^"]*googletagmanager[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*google-analytics[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*hotjar[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*fbevents[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*facebook[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*zaius[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*onetrust[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*audioeye[^"]*"[^>]*>.*?</script>',
    r'<script[^>]*src="[^"]*gtag[^"]*"[^>]*>.*?</script>',
    # Inline script blocks containing tracking
    r'<script[^>]*>[^<]*google_tag_manager[^<]*</script>',
    r'<script[^>]*>[^<]*googletagmanager[^<]*</script>',
    r'<script[^>]*>[^<]*gtag\([^<]*</script>',
    r'<script[^>]*>[^<]*dataLayer\.push[^<]*</script>',
    r'<script[^>]*>[^<]*hotjar[^<]*</script>',
    r'<script[^>]*>[^<]*_hjSettings[^<]*</script>',
    r'<script[^>]*>[^<]*fbq\([^<]*</script>',
    r'<script[^>]*>[^<]*zaius[^<]*</script>',
    r'<script[^>]*>[^<]*AudioEye[^<]*</script>',
    r'<script[^>]*>[^<]*audioeye[^<]*</script>',
    r'<script[^>]*>[^<]*window\.dataLayer[^<]*</script>',
    # Noscript tracking pixels
    r'<noscript>[^<]*facebook\.com/tr[^<]*</noscript>',
    r'<noscript>[^<]*googletagmanager[^<]*</noscript>',
    # OneTrust elements
    r'<link[^>]*onetrust[^>]*>',
    r'<link[^>]*geolocation\.onetrust[^>]*>',
    r'<style[^>]*id="onetrust-style"[^>]*>.*?</style>',
    # GTM noscript iframes
    r'<noscript>\s*<iframe[^>]*googletagmanager[^>]*>.*?</iframe>\s*</noscript>',
    # data-gtm attributes (just clean them from elements, don't remove elements)
]

# Patterns for entire OneTrust consent HTML blocks
ONETRUST_BLOCK = r'<div[^>]*id="onetrust[^"]*"[^>]*>.*?</div>\s*(?:</div>\s*)*'

def clean_html(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    original_len = len(content)
    
    for pattern in TRACKING_PATTERNS:
        content = re.sub(pattern, '', content, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove OneTrust banner/consent HTML blocks
    content = re.sub(r'<div[^>]*id="onetrust-consent-sdk"[^>]*>.*?<!-- Cookie subgroup container -->.*?</span>', '', content, flags=re.DOTALL)
    
    # Remove empty script tags left behind
    content = re.sub(r'<script[^>]*>\s*</script>', '', content)
    
    # Remove data-gtm-vis attributes from elements
    content = re.sub(r'\s*data-gtm-vis-[a-z0-9_-]+="[^"]*"', '', content)
    
    # Clean up excessive blank lines
    content = re.sub(r'\n{4,}', '\n\n', content)
    
    new_len = len(content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"{filepath}: {original_len} -> {new_len} chars (removed {original_len - new_len})")

for f in sys.argv[1:]:
    clean_html(f)
