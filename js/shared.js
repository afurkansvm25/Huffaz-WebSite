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
