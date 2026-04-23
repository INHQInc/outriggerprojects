import re, sys

def clean_multiline_tracking(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    
    out = []
    skip = False
    removed = 0
    
    for line in lines:
        lower = line.lower()
        
        # Skip lines that are part of tracking scripts
        tracking_keywords = [
            'google_tag_manager', 'googletagmanager', 'gtm.start', 'gtm.js',
            'hotjar', '_hjsettings', 'hjid:',
            'fbq(', 'fbevents', 'facebook.net/en_us/fbevents',
            'zaius', 'zaius-min.js', 'zaius.event', 'zaius.methods',
            'onetrust', 'ot-sdk', 'ot-bnr', 'ot-pc-',
            'optimizely.get("visitor_id")',
            'cookieriid', 'rimarketingprogram',
            'pushtopics()', 'odptags', 'odpproductid', 'odpdestination',
            'odprelatedproperties', 'odprelateddestin',
            'batbeacon', 'window.performance||window.webkitperformance',
            'd1igp3oop3iho5.cloudfront.net',
            'wsmcdn.audioeye.com/aem.js',
            '__audioeye',
            'ns.html?id=gtm',
        ]
        
        should_skip = False
        for kw in tracking_keywords:
            if kw in lower:
                should_skip = True
                break
        
        if should_skip:
            removed += 1
            continue
        
        out.append(line)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(out)
    
    print(f"{filepath}: removed {removed} lines, {len(out)} remaining")

for f in sys.argv[1:]:
    clean_multiline_tracking(f)
