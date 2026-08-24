/* =============================================================
   Huffaz — Kuran Hafızlık Uygulaması
   app.js  |  pages/sureler.html tarafından kullanılır
   Bağımlılıklar: data.js, shared.js (Memorized, Bookmarks nesneleri)
============================================================= */
'use strict';

// ──────────────────────────────────────────────────────────────
//  DURUM
// ──────────────────────────────────────────────────────────────
const state = {
  allAyahs:  [],         // QURAN_DATA tam liste
  surahMap:  new Map(),  // surahNo → { no, arName, trName, ayahs:[] }
  ayahIndex: new Map(),  // "surahNo:ayahNo" → allAyahs indeksi
  openSurah: null,       // Panelde açık sure numarası
};

// ──────────────────────────────────────────────────────────────
//  BAŞLATMA
// ──────────────────────────────────────────────────────────────
function init() {
  if (typeof QURAN_DATA === 'undefined' || !QURAN_DATA.length) {
    $('loading').innerHTML =
      '<p style="color:#fff;font-size:1.1rem;padding:24px;text-align:center">' +
      '❌ Veri yüklenemedi.<br>Lütfen <code>py process_quran.py</code> komutunu çalıştırın.</p>';
    return;
  }

  buildDataStructures();
  bindEvents();
  renderSurahList();

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function buildDataStructures() {
  state.allAyahs = QURAN_DATA;
  QURAN_DATA.forEach((ayah, idx) => {
    const n = ayah.surahNo;
    if (!state.surahMap.has(n)) {
      state.surahMap.set(n, { no: n, arName: ayah.surahAr, trName: ayah.surahTr, ayahs: [] });
    }
    state.surahMap.get(n).ayahs.push(ayah);
    state.ayahIndex.set(`${ayah.surahNo}:${ayah.ayahNo}`, idx);
  });
}

// ──────────────────────────────────────────────────────────────
//  ETKİNLİKLER
// ──────────────────────────────────────────────────────────────
function bindEvents() {
  const searchEl = $('sure-ara');
  if (searchEl) searchEl.addEventListener('input', e => renderSurahList(e.target.value.trim()));

  $('panel-geri').addEventListener('click', closeSurahPanel);
  $('panel-tumunu-ekle').addEventListener('click', () => bulkMark(state.openSurah, true));
  $('panel-tumunu-cikar').addEventListener('click', () => bulkMark(state.openSurah, false));

  const testBtn = $('panel-sure-test');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      if (state.openSurah) {
        location.href = `test.html?surah=${state.openSurah}`;
      }
    });
  }
}

// ──────────────────────────────────────────────────────────────
//  SURELER LİSTESİ (Hizalanmış Kart Tasarımı)
// ──────────────────────────────────────────────────────────────
function renderSurahList(filter = '') {
  const container = $('sure-listesi');
  container.innerHTML = '';
  const lf = filter.toLowerCase();

  state.surahMap.forEach((surah, no) => {
    if (lf) {
      const noMatch = String(no).includes(lf);
      const trMatch = surah.trName.toLowerCase().includes(lf);
      const arMatch = surah.arName.includes(filter);
      if (!noMatch && !trMatch && !arMatch) return;
    }

    const total    = surah.ayahs.length;
    const memCount = surah.ayahs.filter(a => Memorized.has(a.surahNo, a.ayahNo)).length;
    const pct      = Math.round((memCount / total) * 100);
    const tamEzber = memCount === total;
    const kismen   = memCount > 0 && !tamEzber;

    const card = document.createElement('div');
    card.className = 'sure-kart' + (tamEzber ? ' tam-ezber' : kismen ? ' kismen-ezber' : '');
    card.innerHTML = `
      <div class="sure-kart-ust">
        <div class="sure-no-badge">${no}</div>
        <div class="sure-isimler">
          <div class="sure-isimler-row">
            <span class="sure-tr">${surah.trName}</span>
            <span class="sure-ar">${surah.arName}</span>
          </div>
          <div class="sure-meta">${total} ayet</div>
        </div>
      </div>
      <div class="sure-prog-row">
        <div class="sure-prog-bar-wrap">
          <div class="sure-prog-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="sure-prog-label">${memCount}/${total}</span>
      </div>
      ${tamEzber ? '<div class="sure-tam-rozet">✓ Tam Ezberlendi</div>' : ''}
    `;
    card.addEventListener('click', () => openSurahPanel(no));
    container.appendChild(card);
  });
}

// ──────────────────────────────────────────────────────────────
//  SURE PANEL
// ──────────────────────────────────────────────────────────────
function openSurahPanel(surahNo) {
  const surah = state.surahMap.get(surahNo);
  if (!surah) return;
  state.openSurah = surahNo;
  $('panel-tr-isim').textContent = `${surahNo}. ${surah.trName}`;
  $('panel-ar-isim').textContent = surah.arName;
  renderPanelAyahs(surahNo);
  $('sure-panel').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSurahPanel() {
  $('sure-panel').classList.add('hidden');
  document.body.style.overflow = '';
  state.openSurah = null;
  renderSurahList($('sure-ara') ? $('sure-ara').value.trim() : '');
}

function renderPanelAyahs(surahNo) {
  const surah    = state.surahMap.get(surahNo);
  const total    = surah.ayahs.length;
  const memCount = surah.ayahs.filter(a => Memorized.has(a.surahNo, a.ayahNo)).length;
  const pct      = Math.round((memCount / total) * 100);

  $('panel-prog-fill').style.width = pct + '%';
  $('panel-prog-text').textContent = `${memCount} / ${total} ayet ezberlendi`;

  const container = $('panel-ayet-listesi');
  container.innerHTML = '';
  const frag = document.createDocumentFragment();

  // Besmele Başlığı (Fatiha ve Tevbe hariç tüm surelerde tek olarak üstte yer alır)
  if (surahNo !== 1 && surahNo !== 9) {
    const bsm = document.createElement('div');
    bsm.className = 'besmele';
    bsm.style.cssText = 'text-align:center;padding:16px 18px 10px;font-family:var(--font-ar);font-size:1.35rem;color:var(--green-900);direction:rtl;border-bottom:1px solid var(--gray-100);margin-bottom:4px;';
    bsm.textContent = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ';
    frag.appendChild(bsm);
  }

  surah.ayahs.forEach(ayah => {
    const isEzber = Memorized.has(ayah.surahNo, ayah.ayahNo);
    const hasSimilar = (typeof SimilarLists !== 'undefined') ? (SimilarLists.getListsContainingAyah(ayah.surahNo, ayah.ayahNo).length > 0) : false;

    const row = document.createElement('div');
    row.className = 'ayet-satir' + (isEzber ? ' ezber' : '');
    row.dataset.key = `${ayah.surahNo}:${ayah.ayahNo}`;
    row.innerHTML = `
      <div class="ayet-actions">
        <div class="ayet-cb" title="Ezberledim">${isEzber ? '✓' : ''}</div>
        <button class="ayet-save-btn ${hasSimilar ? 'active' : ''}" title="Benzer Ayet Listesine Ekle / Düzenle" type="button">
          ${hasSimilar ? '🔖' : '🏷️'}
        </button>
      </div>
      <div class="ayet-no-badge">${ayah.ayahNo}</div>
      <div class="ayet-metin">${getCleanAyahText(ayah)}</div>
    `;

    const saveBtn = row.querySelector('.ayet-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        PlaylistModal.open(ayah.surahNo, ayah.ayahNo);
      });
    }

    const cb = row.querySelector('.ayet-cb');
    if (cb) {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        Memorized.toggle(ayah.surahNo, ayah.ayahNo);
        renderPanelAyahs(surahNo);
      });
    }

    row.addEventListener('click', (e) => {
      if (e.target.closest('.ayet-save-btn') || e.target.closest('.ayet-cb')) return;
      Memorized.toggle(ayah.surahNo, ayah.ayahNo);
      renderPanelAyahs(surahNo);
    });

    frag.appendChild(row);
  });

  container.appendChild(frag);
}

// Playlist modalı kapandığında butonların durumunu güncellemek için genel fonksiyon
window.updatePlaylistBadges = function() {
  if (state.openSurah) {
    renderPanelAyahs(state.openSurah);
  }
};

function bulkMark(surahNo, mark) {
  const surah = state.surahMap.get(surahNo);
  if (!surah) return;
  surah.ayahs.forEach(a => mark ? Memorized.add(a.surahNo, a.ayahNo) : Memorized.remove(a.surahNo, a.ayahNo));
  renderPanelAyahs(surahNo);
}

document.addEventListener('DOMContentLoaded', init);
