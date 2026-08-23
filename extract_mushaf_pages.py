import sys
import os
import time
import concurrent.futures
from PIL import Image
import pymupdf

OUTPUT_DIR = "mushaf_pages"
PDF_FILE = "kuran.pdf"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_page(p_idx):
    """
    Extracts page p_idx (0-indexed) from kuran.pdf as WebP image.
    Saved as mushaf_pages/page_{p_idx + 1}.webp
    """
    out_path = os.path.join(OUTPUT_DIR, f"page_{p_idx + 1}.webp")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
        return p_idx + 1
    
    doc = pymupdf.open(PDF_FILE)
    try:
        # 150 DPI provides crystal-clear resolution (~1123x1625) with optimal file size
        pix = doc[p_idx].get_pixmap(dpi=150)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img.save(out_path, "WEBP", quality=85)
    finally:
        doc.close()
    return p_idx + 1

def main():
    doc = pymupdf.open(PDF_FILE)
    total_pages = len(doc)
    doc.close()
    print(f"Toplam {total_pages} PDF sayfasi tespit edildi.")
    print("Sayfalar mushaf_pages/ klasorune WebP formatinda aktariliyor...")
    
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(extract_page, i) for i in range(total_pages)]
        done_count = 0
        for f in concurrent.futures.as_completed(futures):
            f.result()
            done_count += 1
            if done_count % 50 == 0 or done_count == total_pages:
                print(f"  [{done_count}/{total_pages}] sayfa tamamlandi...")
    
    t1 = time.time()
    print(f"Tum sayfalar basariyla cikarildi! ({t1 - t0:.2f} saniye)")

if __name__ == "__main__":
    main()
