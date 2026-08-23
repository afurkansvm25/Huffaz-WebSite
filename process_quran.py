import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pandas as pd
import json

surah_names = [
    {"tr": "Fâtiha", "ar": "الفاتحة"}, {"tr": "Bakara", "ar": "البقرة"}, {"tr": "Âl-i İmrân", "ar": "آل عمران"},
    {"tr": "Nisâ", "ar": "النساء"}, {"tr": "Mâide", "ar": "المائدة"}, {"tr": "En'âm", "ar": "الأنعام"},
    {"tr": "A'râf", "ar": "الأعراف"}, {"tr": "Enfâl", "ar": "الأنفال"}, {"tr": "Tevbe", "ar": "التوبة"},
    {"tr": "Yûnus", "ar": "يونس"}, {"tr": "Hûd", "ar": "هود"}, {"tr": "Yûsuf", "ar": "يوسف"},
    {"tr": "Ra'd", "ar": "الرعد"}, {"tr": "İbrâhîm", "ar": "إبراهيم"}, {"tr": "Hicr", "ar": "الحجر"},
    {"tr": "Nahl", "ar": "النحل"}, {"tr": "İsrâ", "ar": "الإسراء"}, {"tr": "Kehf", "ar": "الكهف"},
    {"tr": "Meryem", "ar": "مريم"}, {"tr": "Tâhâ", "ar": "طه"}, {"tr": "Enbiyâ", "ar": "الأنبياء"},
    {"tr": "Hac", "ar": "الحج"}, {"tr": "Mü'minûn", "ar": "المؤمنون"}, {"tr": "Nûr", "ar": "النور"},
    {"tr": "Furkân", "ar": "الفرقان"}, {"tr": "Şuarâ", "ar": "الشعراء"}, {"tr": "Neml", "ar": "النمل"},
    {"tr": "Kasas", "ar": "القصص"}, {"tr": "Ankebût", "ar": "العنكبوت"}, {"tr": "Rûm", "ar": "الروم"},
    {"tr": "Lokmân", "ar": "لقمان"}, {"tr": "Secde", "ar": "السجدة"}, {"tr": "Ahzâb", "ar": "الأحزاب"},
    {"tr": "Sebe'", "ar": "سبأ"}, {"tr": "Fâtır", "ar": "فاطر"}, {"tr": "Yâsîn", "ar": "يس"},
    {"tr": "Sâffât", "ar": "الصافات"}, {"tr": "Sâd", "ar": "ص"}, {"tr": "Zümer", "ar": "الزمر"},
    {"tr": "Mü'min", "ar": "غافر"}, {"tr": "Fussilet", "ar": "فصلت"}, {"tr": "Şûrâ", "ar": "الشورى"},
    {"tr": "Zuhruf", "ar": "الزخرف"}, {"tr": "Duhân", "ar": "الدخان"}, {"tr": "Câsiye", "ar": "الجاثية"},
    {"tr": "Ahkâf", "ar": "الأحقاف"}, {"tr": "Muhammed", "ar": "محمد"}, {"tr": "Fetih", "ar": "الفتح"},
    {"tr": "Hucurât", "ar": "الحجرات"}, {"tr": "Kâf", "ar": "ق"}, {"tr": "Zâriyât", "ar": "الذاريات"},
    {"tr": "Tûr", "ar": "الطور"}, {"tr": "Necm", "ar": "النجم"}, {"tr": "Kamer", "ar": "القمر"},
    {"tr": "Rahmân", "ar": "الرحمن"}, {"tr": "Vâkıa", "ar": "الواقعة"}, {"tr": "Hadîd", "ar": "الحديد"},
    {"tr": "Mücâdile", "ar": "المجادلة"}, {"tr": "Haşr", "ar": "الحشر"}, {"tr": "Mümtehine", "ar": "الممتحنة"},
    {"tr": "Saff", "ar": "الصف"}, {"tr": "Cuma", "ar": "الجمعة"}, {"tr": "Münâfikûn", "ar": "المنافقون"},
    {"tr": "Tegâbün", "ar": "التغابن"}, {"tr": "Talâk", "ar": "الطلاق"}, {"tr": "Tahrim", "ar": "التحريم"},
    {"tr": "Mülk", "ar": "الملك"}, {"tr": "Kalem", "ar": "القلم"}, {"tr": "Hâkka", "ar": "الحاقة"},
    {"tr": "Meâric", "ar": "المعارج"}, {"tr": "Nûh", "ar": "نوح"}, {"tr": "Cin", "ar": "الجن"},
    {"tr": "Müzzemmil", "ar": "المزمل"}, {"tr": "Müddessir", "ar": "المدثر"}, {"tr": "Kıyâme", "ar": "القيامة"},
    {"tr": "İnsan", "ar": "الإنسان"}, {"tr": "Mürselât", "ar": "المرسلات"}, {"tr": "Nebe'", "ar": "النبأ"},
    {"tr": "Nâziât", "ar": "النازعات"}, {"tr": "Abese", "ar": "عبس"}, {"tr": "Tekvîr", "ar": "التكوير"},
    {"tr": "İnfitâr", "ar": "الانفطار"}, {"tr": "Mutaffifîn", "ar": "المطففين"}, {"tr": "İnşikâk", "ar": "الانشقاق"},
    {"tr": "Bürûc", "ar": "البروج"}, {"tr": "Târık", "ar": "الطارق"}, {"tr": "A'lâ", "ar": "الأعلى"},
    {"tr": "Gâşiye", "ar": "الغاشية"}, {"tr": "Fecr", "ar": "الفجر"}, {"tr": "Beled", "ar": "البلد"},
    {"tr": "Şems", "ar": "الشمس"}, {"tr": "Leyl", "ar": "الليل"}, {"tr": "Duhâ", "ar": "الضحى"},
    {"tr": "İnşirâh", "ar": "الشرح"}, {"tr": "Tîn", "ar": "التين"}, {"tr": "Alak", "ar": "العلق"},
    {"tr": "Kadr", "ar": "القدر"}, {"tr": "Beyyine", "ar": "البينة"}, {"tr": "Zilzâl", "ar": "الزلزلة"},
    {"tr": "Âdiyât", "ar": "العاديات"}, {"tr": "Kâria", "ar": "القارعة"}, {"tr": "Tekâsür", "ar": "التكاثر"},
    {"tr": "Asr", "ar": "العصر"}, {"tr": "Hümeze", "ar": "الهمزة"}, {"tr": "Fîl", "ar": "الفيل"},
    {"tr": "Kureyş", "ar": "قريش"}, {"tr": "Mâûn", "ar": "الماعون"}, {"tr": "Kevser", "ar": "الكوثر"},
    {"tr": "Kâfirûn", "ar": "الكافرون"}, {"tr": "Nasr", "ar": "النصر"}, {"tr": "Tebbet", "ar": "المسد"},
    {"tr": "İhlâs", "ar": "الإخلاص"}, {"tr": "Felak", "ar": "الفلق"}, {"tr": "Nâs", "ar": "الناس"}
]

print("quran-uthmani.txt okunuyor...")
with open('quran-uthmani.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

data = []
for line in lines:
    if not line.strip() or line.startswith('#'):
        continue
    parts = line.split('|')
    if len(parts) >= 3:
        sure_no = int(parts[0])
        ayet_no = int(parts[1])
        metin = parts[2].strip()
        s_name = surah_names[sure_no - 1]
        data.append({
            "Sure Sırası": sure_no,
            "Sure Adı (AR)": s_name["ar"],
            "Sure Adı (TR)": s_name["tr"],
            "Ayet No": ayet_no,
            "Arapça Metin": metin
        })

df = pd.DataFrame(data)

# JSON'a kaydet
df.to_json("kuran_web_uygulamasi_icin.json", orient="records", force_ascii=False, indent=4)

# Web uygulaması için js/data.js dosyasını oluştur
import os
os.makedirs("js", exist_ok=True)
js_data = [
    {
        "surahNo": item["Sure Sırası"],
        "surahAr": item["Sure Adı (AR)"],
        "surahTr": item["Sure Adı (TR)"],
        "ayahNo":  item["Ayet No"],
        "text":    item["Arapça Metin"]
    }
    for item in data
]
with open("js/data.js", "w", encoding="utf-8") as f:
    f.write("// Kur'an-i Kerim Verisi - Tanzil Uthmani\n")
    f.write("// Bu dosya process_quran.py tarafından otomatik üretilmiştir.\n")
    f.write("const QURAN_DATA=")
    json.dump(js_data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(";\n")
print("js/data.js dosyası oluşturuldu.")

# Özet istatistikler
print("=== İşlem Tamamlandı ===")
print("Toplam ayet:", len(df))
print("Toplam sure:", df["Sure Sırası"].nunique())
print()

print("--- İlk 10 Ayet ---")
print(df.head(10).to_string(index=False))

print()
print("--- Sure Bazında Ayet Sayısı ---")
sure_ozet = df.groupby(["Sure Sırası", "Sure Adı (TR)", "Sure Adı (AR)"])["Ayet No"].max().reset_index()
sure_ozet.columns = ["Sure No", "Sure (TR)", "Sure (AR)", "Ayet Sayısı"]
pd.set_option("display.max_rows", 120)
pd.set_option("display.width", 200)
pd.set_option("display.max_colwidth", 30)
print(sure_ozet.to_string(index=False))

print()
print("JSON dosyası kaydedildi: kuran_web_uygulamasi_icin.json")
