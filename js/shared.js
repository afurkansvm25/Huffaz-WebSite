/* ================================================================
   shared.js — Huffaz Uygulaması Ortak Yardımcılar
   Tüm sayfalar tarafından kullanılır
================================================================ */
'use strict';

// ── localStorage anahtar yardımcıları (Kullanıcı Profiline Bağlı) ───
function getUserKey(key) {
  const activeId = localStorage.getItem('huffaz_active_user_id') || 'guest';
  return `huffaz_${activeId}_${key}`;
}

// ── Ezber yönetimi ────────────────────────────────────────────
const Memorized = {
  _set: null,
  load() {
    try {
      const k = getUserKey('memorized');
      let raw = localStorage.getItem(k);
      // Geriye dönük uyumluluk: eğer kullanıcı anahtarında yoksa genel anahtardan al
      if (!raw) raw = localStorage.getItem('huffaz_memorized_v1');
      this._set = new Set(raw ? JSON.parse(raw) : []);
    } catch { this._set = new Set(); }
    return this;
  },
  save() {
    try {
      const arr = [...this._set];
      localStorage.setItem(getUserKey('memorized'), JSON.stringify(arr));
      localStorage.setItem('huffaz_memorized_v1', JSON.stringify(arr));
      if (typeof Auth !== 'undefined' && Auth._activeUser && Auth._activeUser.data) {
        Auth._activeUser.data.memorized = arr;
        Auth.saveUsers();
      }
    } catch {}
  },
  has(surahNo, ayahNo) { return this._set.has(`${surahNo}:${ayahNo}`); },
  add(surahNo, ayahNo) { this._set.add(`${surahNo}:${ayahNo}`); this.save(); },
  remove(surahNo, ayahNo) { this._set.delete(`${surahNo}:${ayahNo}`); this.save(); },
  toggle(surahNo, ayahNo) {
    const k = `${surahNo}:${ayahNo}`;
    this._set.has(k) ? this._set.delete(k) : this._set.add(k);
    this.save();
    return this._set.has(k);
  },
  count() { return this._set ? this._set.size : 0; },
};

// ── Yer İmleri ────────────────────────────────────────────────
const Bookmarks = {
  _list: null,
  load() {
    try {
      const k = getUserKey('bookmarks');
      let raw = localStorage.getItem(k);
      if (!raw) raw = localStorage.getItem('huffaz_bookmarks_v1');
      this._list = raw ? JSON.parse(raw) : [];
    } catch { this._list = []; }
    return this;
  },
  save() {
    try {
      localStorage.setItem(getUserKey('bookmarks'), JSON.stringify(this._list));
      localStorage.setItem('huffaz_bookmarks_v1', JSON.stringify(this._list));
      if (typeof Auth !== 'undefined' && Auth._activeUser && Auth._activeUser.data) {
        Auth._activeUser.data.bookmarks = this._list;
        Auth.saveUsers();
      }
    } catch {}
  },
  all() { return [...(this._list || [])]; },
  byType(type) { return (this._list || []).filter(b => b.type === type); },
  addPage(pageNo, label) {
    if (this.hasPage(pageNo)) return false;
    this._list.unshift({ type: 'page', ref: pageNo, label, date: Date.now() });
    this.save(); return true;
  },
  addAyah(surahNo, ayahNo, label) {
    const ref = `${surahNo}:${ayahNo}`;
    if (this.hasAyah(surahNo, ayahNo)) return false;
    this._list.unshift({ type: 'ayah', ref, label, date: Date.now() });
    this.save(); return true;
  },
  hasPage(pageNo) { return (this._list || []).some(b => b.type === 'page' && b.ref === pageNo); },
  hasAyah(s, a)   { return (this._list || []).some(b => b.type === 'ayah' && b.ref === `${s}:${a}`); },
  remove(type, ref) {
    this._list = (this._list || []).filter(b => !(b.type === type && b.ref === ref));
    this.save();
  },
  count() { return this._list ? this._list.length : 0; },
};

// ── Son okunan sayfa ──────────────────────────────────────────
const LastPage = {
  get()  {
    const k = getUserKey('last_page');
    return parseInt(localStorage.getItem(k)) || parseInt(localStorage.getItem('huffaz_last_page')) || 1;
  },
  set(n) {
    localStorage.setItem(getUserKey('last_page'), n);
    localStorage.setItem('huffaz_last_page', n);
    if (typeof Auth !== 'undefined' && Auth._activeUser && Auth._activeUser.data) {
      Auth._activeUser.data.lastPage = n;
      Auth.saveUsers();
    }
  },
};

// ── Sayfa haritası yardımcıları ───────────────────────────────
// PAGE_MAP: { "pageNo": [firstSurahNo, firstAyahNo, lastSurahNo, lastAyahNo] }
// QURAN_DATA: global ayah dizisi (data.js)
const PageHelper = {
  _idx: null,   // lazy: "surahNo:ayahNo" → QURAN_DATA index (O(1) lookup)

  ready() {
    return typeof PAGE_MAP !== 'undefined' && typeof QURAN_DATA !== 'undefined';
  },

  /** QURAN_DATA üzerinde O(n) yapısal indeks — ilk çağrıda bir kez kurulur */
  _buildIdx() {
    this._idx = new Map();
    QURAN_DATA.forEach((a, i) => this._idx.set(`${a.surahNo}:${a.ayahNo}`, i));
  },

  /**
   * Sayfa numarasına göre ayetleri döndürür.
   * İlk çağrı indeksi kurar O(n); sonraki çağrılar O(1) slice kullanır.
   */
  ayahsForPage(pageNo) {
    if (!this.ready()) return [];
    const entry = PAGE_MAP[String(pageNo)];
    if (!entry) return [];
    const [fs, fa, ls, la] = entry;
    if (!this._idx) this._buildIdx();
    const si = this._idx.get(`${fs}:${fa}`);
    const ei = this._idx.get(`${ls}:${la}`);
    if (si === undefined || ei === undefined) return [];
    return QURAN_DATA.slice(si, ei + 1);
  },

  /** O sayfadaki surelerin adlarını döndürür (tekrarsız) */
  surahNamesForPage(pageNo) {
    const ayahs = this.ayahsForPage(pageNo);
    const seen = new Set();
    const names = [];
    ayahs.forEach(a => {
      if (!seen.has(a.surahNo)) {
        seen.add(a.surahNo);
        names.push({ no: a.surahNo, tr: a.surahTr, ar: a.surahAr });
      }
    });
    return names;
  },

  /** Cüz numarasından başlangıç sayfası */
  juzToPage(juzNo) {
    if (juzNo <= 1) return 1;
    if (juzNo >= 30) return 582;
    return (juzNo - 1) * 20 + 2;
  },

  /** Cüz numarasından bitiş sayfası */
  juzEndPage(juzNo) {
    if (juzNo <= 1) return 21;
    if (juzNo >= 30) return 604;
    return juzNo * 20 + 1;
  },

  /** Sayfa numarasından cüz numarası */
  pageToJuz(pageNo) {
    if (pageNo <= 21) return 1;
    if (pageNo >= 582) return 30;
    return Math.floor((pageNo - 2) / 20) + 1;
  },

  /** Ayetin bulunduğu sayfa numarasını bulur (1..604) */
  pageForAyah(surahNo, ayahNo) {
    if (typeof PAGE_MAP === 'undefined') return 1;
    if (!this._ayahPageMap) {
      this._ayahPageMap = new Map();
      for (const p in PAGE_MAP) {
        const pageNum = parseInt(p);
        const ayahs = this.ayahsForPage(pageNum);
        ayahs.forEach(a => {
          this._ayahPageMap.set(`${a.surahNo}:${a.ayahNo}`, pageNum);
        });
      }
    }
    return this._ayahPageMap.get(`${surahNo}:${ayahNo}`) || 1;
  },
};

// Global kısayollar
function juzToPage(juzNo) { return PageHelper.juzToPage(juzNo); }
function juzEndPage(juzNo) { return PageHelper.juzEndPage(juzNo); }
function pageToJuz(pageNo) { return PageHelper.pageToJuz(pageNo); }
function pageForAyah(s, a) { return PageHelper.pageForAyah(s, a); }

// ── Temiz Ayet Metni (Besmele Tekrarını Önler) ─────────────────
// Tanzil Uthmani metninde 1. Fatiha ve 9. Tevbe dışındaki tüm surelerin
// 1. ayetlerinin başında mükerrer Besmele bulunur.
const BISMILLAH_PREFIXES = [
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
  'بِّسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ'
];

function getCleanAyahText(ayah) {
  if (!ayah || !ayah.text) return '';
  if (ayah.ayahNo === 1 && ayah.surahNo !== 1 && ayah.surahNo !== 9) {
    for (let i = 0; i < BISMILLAH_PREFIXES.length; i++) {
      const bp = BISMILLAH_PREFIXES[i];
      if (ayah.text.startsWith(bp)) {
        return ayah.text.substring(bp.length).trim();
      }
    }
  }
  return ayah.text;
}

// ── Mushaf Görünüm Modu (Tek / Çift Sayfa) ────────────────────
const SpreadMode = {
  get() {
    return localStorage.getItem('huffaz_spread_mode') || 'single';
  },
  set(mode) {
    localStorage.setItem('huffaz_spread_mode', mode);
  }
};

// ── Benzer / Karıştırılan Ayet Listeleri (Müteşâbih Listeleri) ───
const SimilarLists = {
  _lists: null,

  load() {
    try {
      const k = getUserKey('similar_lists');
      let raw = localStorage.getItem(k);
      if (!raw) raw = localStorage.getItem('huffaz_similar_lists_v1');
      this._lists = raw ? JSON.parse(raw) : null;
    } catch {
      this._lists = null;
    }

    if (!this._lists || !Array.isArray(this._lists)) {
      this._lists = this.getDefaultLists();
      this.save();
    }
    return this;
  },

  getDefaultLists() {
    return [
      {
        id: 'list_default_1',
        title: 'Örnek: "İnneke Ente\'l-Alîmü\'l-Hakîm"',
        desc: 'Bakara 32 ve diğer benzer bitişli ayetler',
        createdAt: Date.now(),
        ayahs: ['2:32', '2:127']
      },
      {
        id: 'list_default_2',
        title: 'Örnek: "Kâlû Subhâneke"',
        desc: 'Meleklerin tesbihi ve benzer başlayan ayetler',
        createdAt: Date.now(),
        ayahs: ['2:32', '10:10']
      }
    ];
  },

  save() {
    try {
      localStorage.setItem(getUserKey('similar_lists'), JSON.stringify(this._lists));
      localStorage.setItem('huffaz_similar_lists_v1', JSON.stringify(this._lists));
      if (typeof Auth !== 'undefined' && Auth._activeUser && Auth._activeUser.data) {
        Auth._activeUser.data.similarLists = this._lists;
        Auth.saveUsers();
      }
    } catch (e) {
      console.error('SimilarLists kaydetme hatası:', e);
    }
  },

  getAll() {
    if (!this._lists) this.load();
    return [...this._lists];
  },

  getById(id) {
    if (!this._lists) this.load();
    return this._lists.find(l => l.id === id);
  },

  createList(title, desc = '', initialAyahs = []) {
    if (!this._lists) this.load();
    const id = 'list_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const newList = {
      id,
      title: title.trim() || 'Yeni Liste',
      desc: desc.trim(),
      createdAt: Date.now(),
      ayahs: Array.isArray(initialAyahs) ? [...initialAyahs] : []
    };
    this._lists.unshift(newList);
    this.save();
    return newList;
  },

  renameList(id, newTitle, newDesc) {
    if (!this._lists) this.load();
    const l = this._lists.find(x => x.id === id);
    if (!l) return false;
    if (newTitle !== undefined) l.title = newTitle.trim();
    if (newDesc !== undefined) l.desc = newDesc.trim();
    this.save();
    return true;
  },

  deleteList(id) {
    if (!this._lists) this.load();
    this._lists = this._lists.filter(l => l.id !== id);
    this.save();
    return true;
  },

  addAyah(listId, surahNo, ayahNo) {
    if (!this._lists) this.load();
    const l = this._lists.find(x => x.id === listId);
    if (!l) return false;
    const key = `${surahNo}:${ayahNo}`;
    if (!l.ayahs.includes(key)) {
      l.ayahs.push(key);
      this.save();
      return true;
    }
    return false;
  },

  removeAyah(listId, surahNo, ayahNo) {
    if (!this._lists) this.load();
    const l = this._lists.find(x => x.id === listId);
    if (!l) return false;
    const key = `${surahNo}:${ayahNo}`;
    l.ayahs = l.ayahs.filter(k => k !== key);
    this.save();
    return true;
  },

  toggleAyah(listId, surahNo, ayahNo) {
    if (!this._lists) this.load();
    const l = this._lists.find(x => x.id === listId);
    if (!l) return false;
    const key = `${surahNo}:${ayahNo}`;
    const idx = l.ayahs.indexOf(key);
    if (idx !== -1) {
      l.ayahs.splice(idx, 1);
      this.save();
      return false; // çıkarıldı
    } else {
      l.ayahs.push(key);
      this.save();
      return true; // eklendi
    }
  },

  hasAyah(listId, surahNo, ayahNo) {
    if (!this._lists) this.load();
    const l = this._lists.find(x => x.id === listId);
    if (!l) return false;
    return l.ayahs.includes(`${surahNo}:${ayahNo}`);
  },

  getListsContainingAyah(surahNo, ayahNo) {
    if (!this._lists) this.load();
    const key = `${surahNo}:${ayahNo}`;
    return this._lists.filter(l => l.ayahs.includes(key));
  },

  count() {
    if (!this._lists) this.load();
    return this._lists.length;
  }
};

// ── YouTube Playlist Tarzı "Listeye Kaydet" Modalı ───────────────
const PlaylistModal = {
  _currentAyah: null,

  injectUI() {
    if ($('playlist-modal-overlay')) return;
    const modalHtml = `
      <div id="playlist-modal-overlay" class="playlist-modal-overlay hidden" onclick="PlaylistModal.handleOverlayClick(event)">
        <div class="playlist-modal-card" onclick="event.stopPropagation()">
          <div class="playlist-modal-header">
            <div>
              <h3 class="playlist-modal-title">Listeye Kaydet...</h3>
              <p id="pl-modal-ayah-sub" class="playlist-modal-sub">—</p>
            </div>
            <button class="modal-close-btn" onclick="PlaylistModal.close()" title="Kapat">✕</button>
          </div>

          <div id="pl-modal-ayah-preview" class="playlist-ayah-preview" dir="rtl"></div>

          <div class="playlist-items-wrap" id="pl-items-list">
            <!-- Playlist satırları dinamik yüklenir -->
          </div>

          <!-- Yeni Liste Oluşturma Alanı (YouTube Tarzı) -->
          <div class="playlist-create-section">
            <div id="pl-create-btn-row">
              <button class="pl-add-list-btn" onclick="PlaylistModal.showCreateForm()">
                <span style="font-size:1.15rem;font-weight:700">＋</span> Yeni Liste Oluştur
              </button>
            </div>
            <div id="pl-create-form" class="pl-create-form hidden">
              <input id="pl-new-title-input" class="pl-input-field" type="text" placeholder="Liste Başlığı (Örn: Müteşâbih Ayetler)" maxlength="70">
              <div class="pl-form-actions">
                <button class="btn btn-sm btn-secondary" onclick="PlaylistModal.hideCreateForm()">İptal</button>
                <button class="btn btn-sm btn-primary" onclick="PlaylistModal.handleCreateSubmit()">Oluştur & Ekle</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Enter tuşuna basıldığında yeni liste oluştur
    setTimeout(() => {
      const input = $('pl-new-title-input');
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            PlaylistModal.handleCreateSubmit();
          }
        });
      }
    }, 100);
  },

  open(surahNo, ayahNo) {
    this.injectUI();
    const ayah = (typeof QURAN_DATA !== 'undefined')
      ? QURAN_DATA.find(a => a.surahNo === surahNo && a.ayahNo === ayahNo)
      : null;

    this._currentAyah = {
      surahNo,
      ayahNo,
      surahTr: ayah ? ayah.surahTr : `${surahNo}. Sure`,
      text: ayah ? getCleanAyahText(ayah) : ''
    };

    $('pl-modal-ayah-sub').textContent = `${surahNo}. ${this._currentAyah.surahTr} Suresi, ${ayahNo}. Ayet`;
    $('pl-modal-ayah-preview').textContent = this._currentAyah.text;

    this.renderListItems();
    this.hideCreateForm();

    $('playlist-modal-overlay').classList.remove('hidden');
  },

  close() {
    const overlay = $('playlist-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
    this._currentAyah = null;

    // Sureler veya benzer sayfadaysa rozetleri güncelle
    if (typeof updatePlaylistBadges === 'function') {
      updatePlaylistBadges();
    }
  },

  handleOverlayClick(e) {
    if (e.target.id === 'playlist-modal-overlay') {
      this.close();
    }
  },

  renderListItems() {
    const container = $('pl-items-list');
    if (!container || !this._currentAyah) return;
    container.innerHTML = '';

    const lists = SimilarLists.getAll();
    if (lists.length === 0) {
      container.innerHTML = `
        <div class="pl-empty-msg">
          Henüz oluşturulmuş bir listeniz yok.<br>Aşağıdan ilk listenizi oluşturabilirsiniz.
        </div>
      `;
      return;
    }

    const { surahNo, ayahNo } = this._currentAyah;
    const key = `${surahNo}:${ayahNo}`;

    lists.forEach(list => {
      const isSaved = list.ayahs.includes(key);
      const row = document.createElement('div');
      row.className = 'playlist-modal-item' + (isSaved ? ' selected' : '');
      row.innerHTML = `
        <div class="pl-item-thumb">
          <span style="font-size:1.1rem">📑</span>
        </div>
        <div class="pl-item-info">
          <div class="pl-item-title">${list.title}</div>
          <div class="pl-item-count">${list.ayahs.length} ayet</div>
        </div>
        <div class="pl-item-action">
          <button class="pl-ribbon-btn ${isSaved ? 'active' : ''}" title="${isSaved ? 'Listeden Kaldır' : 'Listeye Ekle'}">
            ${isSaved ? '🔖' : '🏷️'}
          </button>
        </div>
      `;

      row.addEventListener('click', () => {
        const added = SimilarLists.toggleAyah(list.id, surahNo, ayahNo);
        if (added) {
          showToast(`"${list.title}" listesine eklendi`, 'success');
        } else {
          showToast(`"${list.title}" listesinden çıkarıldı`);
        }
        this.renderListItems();
        if (typeof updatePlaylistBadges === 'function') {
          updatePlaylistBadges();
        }
      });

      container.appendChild(row);
    });
  },

  showCreateForm() {
    $('pl-create-btn-row').classList.add('hidden');
    $('pl-create-form').classList.remove('hidden');
    const input = $('pl-new-title-input');
    input.value = '';
    input.focus();
  },

  hideCreateForm() {
    const btnRow = $('pl-create-btn-row');
    const form = $('pl-create-form');
    if (btnRow) btnRow.classList.remove('hidden');
    if (form) form.classList.add('hidden');
  },

  handleCreateSubmit() {
    const input = $('pl-new-title-input');
    const title = input.value.trim();
    if (!title) {
      showToast('Lütfen liste için bir başlık girin');
      input.focus();
      return;
    }

    if (!this._currentAyah) return;
    const { surahNo, ayahNo } = this._currentAyah;
    const initialAyahs = [`${surahNo}:${ayahNo}`];

    const newList = SimilarLists.createList(title, '', initialAyahs);
    showToast(`"${newList.title}" oluşturuldu ve ayet eklendi`, 'success');

    this.hideCreateForm();
    this.renderListItems();
    if (typeof updatePlaylistBadges === 'function') {
      updatePlaylistBadges();
    }
  }
};

// ── DOM yardımcıları ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// ── Tarih formatı ─────────────────────────────────────────────
function formatDate(ts) {
  return new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Arapça rakam çevirici ──────────────────────────────────────
function toArabicNum(n) {
  return String(n).split('').map(d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)] ?? d).join('');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ── Başlat ────────────────────────────────────────────────────
Memorized.load();
Bookmarks.load();
SimilarLists.load();

