import sys

def clean_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    
    out = []
    removed = 0
    
    for line in lines:
        lower = line.lower()
        skip = False
        
        tracking = [
            'tiktokanalyticsobject', 'tiktok.com/i18n/pixel',
            'analytics.tiktok', 'ttq',
            'applicationinsights', 'instrumentationkey', 'ai.2.gbl.min.js',
            'js.monitor.azure.com',
            'pinterest.com', 'pintrk',
            'ct.pinterest.com',
        ]
        
        for kw in tracking:
            if kw in lower:
                skip = True
                break
        
        if skip:
            removed += 1
        else:
            out.append(line)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(out)
    
    print(f"{filepath}: removed {removed} more lines")

for f in sys.argv[1:]:
    clean_file(f)
