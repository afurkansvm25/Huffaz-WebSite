import sys, io, json, time, urllib.request, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

headers = {'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'}

page_map = {}  # page_no -> [firstSurah, firstAyah, lastSurah, lastAyah]

print('604 sayfa verisi indiriliyor... (yaklasik 3-4 dakika)')
for page in range(1, 605):
    url = f'https://api.quran.com/api/v4/verses/by_page/{page}?fields=verse_key&per_page=50'
    req = urllib.request.Request(url, headers=headers)
    ok = False
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            verses = data.get('verses', [])
            if verses:
                def parse(k):
                    s, a = k.split(':')
                    return int(s), int(a)
                fs, fa = parse(verses[0]['verse_key'])
                ls, la = parse(verses[-1]['verse_key'])
                page_map[page] = [fs, fa, ls, la]
            ok = True
            break
        except Exception as e:
            print(f'  Hata sayfa {page} deneme {attempt+1}: {e}')
            time.sleep(1)
    if not ok:
        print(f'  ATLANAMADI: sayfa {page}')
    if page % 50 == 0:
        print(f'  {page}/604 tamamlandi...')
    time.sleep(0.22)

print(f'\nBitti! {len(page_map)} sayfa indirildi.')

# JSON kaydet (yedek)
with open('page_map.json', 'w', encoding='utf-8') as f:
    json.dump(page_map, f, ensure_ascii=False)
print('page_map.json kaydedildi.')

# JS dosyasi olustur
os.makedirs('js', exist_ok=True)
with open('js/page_map.js', 'w', encoding='utf-8') as f:
    f.write('// Kuran sayfa haritasi (Medina Mushafi - Hafs)\n')
    f.write('// page_no -> [ilkSureNo, ilkAyetNo, sonSureNo, sonAyetNo]\n')
    f.write('const PAGE_MAP=')
    json.dump({str(k): v for k, v in page_map.items()}, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('js/page_map.js kaydedildi.')

# Ozet kontrol
print('\nIlk 5 sayfa:')
for p in range(1, 6):
    v = page_map.get(p)
    print(f'  Sayfa {p}: Sure {v[0]}:{v[1]} - Sure {v[2]}:{v[3]}')
print('Son 5 sayfa:')
for p in range(600, 605):
    v = page_map.get(p)
    if v:
        print(f'  Sayfa {p}: Sure {v[0]}:{v[1]} - Sure {v[2]}:{v[3]}')
