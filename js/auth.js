/* ================================================================
   auth.js — Huffaz Kullanıcı Hesap Sistemi ve Cihazlar Arası Senkronizasyon (v5)
   Tüm sayfalarda kullanıcı bazlı veri yönetimi, zorunlu şifre güvenliği ve
   1-tıkla cihazlar arası (Bilgisayar, Tablet, Telefon) kusursuz aktarım sağlar.
================================================================ */
'use strict';

const Auth = {
  LS_USERS: 'huffaz_accounts_v5',
  LS_ACTIVE_USER: 'huffaz_active_user_id_v5',

  _users: {},
  _activeUser: null,

  init() {
    // Önceki tüm yerel hesap ve test verilerini temizle (Kullanıcı talebi)
    try {
      [
        'huffaz_accounts_v1', 'huffaz_accounts_v2', 'huffaz_accounts_v3', 'huffaz_accounts_v4',
        'huffaz_active_user_id', 'huffaz_active_user_id_v2', 'huffaz_active_user_id_v3', 'huffaz_active_user_id_v4',
        'huffaz_similar_lists_v1', 'huffaz_memorized_v1', 'huffaz_bookmarks_v1'
      ].forEach(k => {
        if (localStorage.getItem(k)) localStorage.removeItem(k);
      });
    } catch (e) {
      console.warn('Storage cleanup error:', e);
    }

    this.loadUsers();
    this.loadActiveUser();
    this.checkUrlSync();
    this.injectAuthUI();
  },

  loadUsers() {
    try {
      const raw = localStorage.getItem(this.LS_USERS);
      this._users = raw ? JSON.parse(raw) : {};
    } catch {
      this._users = {};
    }

    // Varsayılan misafir kullanıcı
    if (!this._users['guest']) {
      this._users['guest'] = {
        id: 'guest',
        name: 'Misafir Kullanıcı',
        password: '',
        createdAt: Date.now(),
        data: {
          memorized: [],
          bookmarks: [],
          lastPage: 1,
          spreadMode: 'single',
          testScore: { total: 0, correct: 0 },
          similarLists: []
        }
      };
      this.saveUsers();
    }
  },

  saveUsers() {
    try {
      localStorage.setItem(this.LS_USERS, JSON.stringify(this._users));
    } catch (e) {
      console.error('Kullanıcı verisi kaydedilemedi:', e);
    }
  },

  loadActiveUser() {
    const activeId = localStorage.getItem(this.LS_ACTIVE_USER) || 'guest';
    this._activeUser = this._users[activeId] || this._users['guest'];
  },

  getActiveUser() {
    return this._activeUser;
  },

  isGuest() {
    return !this._activeUser || this._activeUser.id === 'guest';
  },

  // ── URL Üzerinden 1-Tıkla Otomatik Cihaz Senkronizasyonu Kontrolü ──
  checkUrlSync() {
    try {
      const params = new URLSearchParams(location.search);
      const syncToken = params.get('sync');
      if (syncToken) {
        const jsonStr = decodeURIComponent(escape(atob(syncToken)));
        const syncData = JSON.parse(jsonStr);
        if (syncData && syncData.id && syncData.data) {
          this._users[syncData.id] = syncData;
          this.saveUsers();
          this.switchUser(syncData.id);

          // URL'deki sync parametresini temizle
          params.delete('sync');
          const cleanUrl = location.pathname + (params.toString() ? '?' + params.toString() : '');
          history.replaceState(null, '', cleanUrl);

          setTimeout(() => {
            if (typeof showToast === 'function') {
              showToast(`✅ ${syncData.name} hesabı ve tüm ezberleriniz bu cihaza başarıyla aktarıldı!`, 'success');
            }
          }, 300);
        }
      }
    } catch (err) {
      console.warn('URL sync okunamadı:', err);
    }
  },

  // ── Yeni Kayıt Ol (Şifre Zorunlu) ──
  register(username, password) {
    username = (username || '').trim();
    if (!username) return { success: false, message: '⚠️ Kullanıcı adı boş olamaz.' };
    const id = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!id) return { success: false, message: '⚠️ Lütfen geçerli bir kullanıcı adı girin.' };

    // Şifre zorunluluk kontrolü
    if (!password || password.trim().length === 0) {
      return { success: false, message: '⚠️ Şifre alanı boş bırakılamaz. Lütfen bir şifre / PIN belirleyin.' };
    }
    if (password.trim().length < 3) {
      return { success: false, message: '⚠️ Şifreniz en az 3 karakterden oluşmalıdır.' };
    }

    // Benzersiz kullanıcı adı kontrolü
    if (this._users[id]) {
      return {
        success: false,
        message: `⚠️ "${username}" kullanıcı adı bu cihazda zaten kayıtlı! Lütfen "Giriş Yap" sekmesini kullanın veya farklı bir isim belirleyin.`
      };
    }

    // Mevcut aktif kullanıcının verilerini yeni hesaba aktar
    const initialData = this._activeUser ? JSON.parse(JSON.stringify(this._activeUser.data)) : {
      memorized: [],
      bookmarks: [],
      lastPage: 1,
      spreadMode: 'single',
      testScore: { total: 0, correct: 0 },
      similarLists: []
    };

    const newUser = {
      id,
      name: username,
      password: password.trim(),
      createdAt: Date.now(),
      data: initialData
    };

    this._users[id] = newUser;
    this.saveUsers();
    this.switchUser(id);
    return { success: true, message: `Hoş geldiniz, ${username}! Hesabınız oluşturuldu.` };
  },

  // ── Giriş Yap ──
  login(username, password) {
    username = (username || '').trim();
    const id = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!id) return { success: false, message: 'Lütfen kullanıcı adınızı girin.' };

    const user = this._users[id];
    if (!user) {
      return {
        success: false,
        message: `⚠️ "${username}" adında bir hesap bu cihazda henüz bulunamadı. Başka bir cihazdan hesabınızı aktarmak için "Cihaz Eşleme / Senkronizasyon" özelliğini kullanabilirsiniz.`
      };
    }

    if (user.password && user.password !== (password || '').trim()) {
      return { success: false, message: '⚠️ Şifre hatalı. Lütfen tekrar deneyin.' };
    }

    this.switchUser(id);
    return { success: true, message: `Giriş yapıldı: ${user.name}` };
  },

  changePassword(oldPw, newPw, confirmPw) {
    if (this.isGuest()) {
      return { success: false, message: 'Misafir modunda şifre değiştirilemez. Lütfen önce bir hesap oluşturun veya giriş yapın.' };
    }
    if (this._activeUser.password && this._activeUser.password !== oldPw) {
      return { success: false, message: 'Mevcut şifre hatalı.' };
    }
    if (!newPw || newPw.trim().length === 0) {
      return { success: false, message: 'Yeni şifre boş olamaz.' };
    }
    if (newPw.trim().length < 3) {
      return { success: false, message: 'Yeni şifre en az 3 karakter olmalıdır.' };
    }
    if (newPw !== confirmPw) {
      return { success: false, message: 'Yeni şifreler birbiriyle eşleşmiyor.' };
    }
    this._activeUser.password = newPw.trim();
    this._users[this._activeUser.id] = this._activeUser;
    this.saveUsers();
    return { success: true, message: 'Şifreniz başarıyla güncellendi!' };
  },

  logout() {
    this.switchUser('guest');
  },

  switchUser(userId) {
    if (!this._users[userId]) return;
    this._activeUser = this._users[userId];
    localStorage.setItem(this.LS_ACTIVE_USER, userId);

    // Memorized, Bookmarks ve SimilarLists'i yeni kullanıcıya göre yeniden yükle
    if (typeof Memorized !== 'undefined' && Memorized.load) Memorized.load();
    if (typeof Bookmarks !== 'undefined' && Bookmarks.load) Bookmarks.load();
    if (typeof SimilarLists !== 'undefined' && SimilarLists.load) SimilarLists.load();

    this.updateHeaderBadge();
    if (typeof showToast === 'function') {
      showToast(`Aktif Profil: ${this._activeUser.name}`, 'success');
    }
    setTimeout(() => location.reload(), 400);
  },

  // ── 1-Tıkla Senkronizasyon Linki Üretici ──
  generateSyncLink() {
    if (this.isGuest()) {
      alert('Lütfen önce bir hesap açın veya giriş yapın.');
      return '';
    }
    const payload = JSON.stringify(this._activeUser);
    const b64 = btoa(unescape(encodeURIComponent(payload)));
    
    // Ana sayfa URL'si
    let baseUrl = location.href.split('?')[0].split('#')[0];
    if (baseUrl.includes('/pages/')) {
      baseUrl = baseUrl.replace(/\/pages\/[^/]+$/, '/index.html');
    }
    return `${baseUrl}?sync=${b64}`;
  },

  // ── Cihaz Eşleme Kodu Al (Metin Kodu Olarak) ──
  getSyncCode() {
    if (this.isGuest()) return '';
    const payload = JSON.stringify(this._activeUser);
    return btoa(unescape(encodeURIComponent(payload)));
  },

  // ── Cihaz Eşleme Kodu Yükle (Yapıştırılan Kodla Giriş) ──
  importSyncCode(codeStr) {
    try {
      codeStr = (codeStr || '').trim();
      if (!codeStr) return { success: false, message: 'Lütfen eşleme kodunu yapıştırın.' };
      const jsonStr = decodeURIComponent(escape(atob(codeStr)));
      const syncData = JSON.parse(jsonStr);
      if (!syncData || !syncData.id || !syncData.data) {
        return { success: false, message: 'Geçersiz eşleme kodu.' };
      }
      this._users[syncData.id] = syncData;
      this.saveUsers();
      this.switchUser(syncData.id);
      return { success: true, message: `✅ ${syncData.name} hesabı başarıyla bu cihaza senkronize edildi!` };
    } catch (err) {
      return { success: false, message: 'Kod çözülürken hata oluştu: ' + err.message };
    }
  },

  // ── Dosya Olarak Yedek Dışa Aktar ──
  exportBackup() {
    const backup = {
      appName: 'Huffaz',
      version: '5.0',
      exportedAt: new Date().toISOString(),
      user: this._activeUser
    };
    const str = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', str);
    dl.setAttribute('download', `huffaz_yedek_${this._activeUser.id}_${new Date().toISOString().slice(0,10)}.json`);
    dl.click();
    if (typeof showToast === 'function') showToast('📥 Yedek dosyası indirildi!', 'success');
  },

  // ── Dosya Olarak Yedek İçe Aktar ──
  importBackup(fileContent) {
    try {
      const parsed = JSON.parse(fileContent);
      const u = parsed.user || parsed;
      if (!u || !u.id || !u.data) {
        return { success: false, message: 'Geçersiz Huffaz yedek dosyası.' };
      }
      this._users[u.id] = u;
      this.saveUsers();
      this.switchUser(u.id);
      return { success: true, message: `✅ ${u.name} hesabı başarıyla yüklendi!` };
    } catch (err) {
      return { success: false, message: 'Dosya okunurken hata oluştu: ' + err.message };
    }
  },

  // ── UI Enjeksiyonu ──
  injectAuthUI() {
    // Header sağ kısmına profil butonu ekle
    const appBars = document.querySelectorAll('.app-bar');
    appBars.forEach(bar => {
      if (!bar.querySelector('.auth-header-btn')) {
        const btn = document.createElement('button');
        btn.className = 'app-bar-btn auth-header-btn';
        btn.style.marginLeft = 'auto';
        btn.innerHTML = `<span class="auth-btn-icon">👤</span> <span class="auth-btn-name">${this._activeUser.name}</span>`;
        btn.addEventListener('click', () => this.openAuthModal());
        bar.appendChild(btn);
      }
    });

    // Modal HTML'ini sayfaya ekle
    if (!document.getElementById('auth-modal-overlay')) {
      const modal = document.createElement('div');
      modal.id = 'auth-modal-overlay';
      modal.className = 'auth-modal-overlay hidden';
      modal.innerHTML = `
        <div class="auth-modal-card">
          <div class="auth-modal-header">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.4rem">👤</span>
              <h3 id="auth-modal-title">Kişisel Hesap & Senkronizasyon</h3>
            </div>
            <button class="auth-modal-close" onclick="Auth.closeAuthModal()">✕</button>
          </div>

          <div class="auth-modal-body">
            <!-- Profil Bilgi Kartı -->
            <div class="auth-profile-box">
              <div class="auth-avatar">☪</div>
              <div style="flex:1">
                <div class="auth-profile-name" id="modal-user-name">${this._activeUser.name}</div>
                <div class="auth-profile-status" id="modal-user-status">
                  ${this.isGuest() ? 'Misafir Modu' : 'Kayıtlı Profil'}
                </div>
              </div>
            </div>

            <!-- İstatistik Özeti -->
            <div class="auth-stats-grid">
              <div class="auth-stat-card">
                <div class="auth-stat-val" id="auth-stat-mem">0</div>
                <div class="auth-stat-lbl">Ezber Ayet</div>
              </div>
              <div class="auth-stat-card">
                <div class="auth-stat-val" id="auth-stat-bm">0</div>
                <div class="auth-stat-lbl">Yer İmi</div>
              </div>
              <div class="auth-stat-card">
                <div class="auth-stat-val" id="auth-stat-lp">Sayfa 1</div>
                <div class="auth-stat-lbl">Son Konum</div>
              </div>
            </div>

            <!-- İşlem Sekmeleri -->
            <div class="auth-tabs">
              <button class="auth-tab active" data-tab="login" onclick="Auth.setModalTab('login')">Giriş / Kayıt</button>
              <button class="auth-tab" data-tab="sync" onclick="Auth.setModalTab('sync')">📲 Cihaz Eşleme (Senkron)</button>
              <button class="auth-tab" data-tab="password" onclick="Auth.setModalTab('password')">🔑 Şifre Değiştir</button>
              <button class="auth-tab" data-tab="profiles" onclick="Auth.setModalTab('profiles')">👥 Profiller</button>
            </div>

            <!-- 1. Giriş / Kayıt Paneli -->
            <div id="auth-tab-login" class="auth-tab-content active">
              <div class="auth-input-group">
                <label for="auth-username">Kullanıcı Adı:</label>
                <input id="auth-username" type="text" class="auth-field" placeholder="Örn: Ahmet veya Furkan">
              </div>
              <div class="auth-input-group">
                <label for="auth-password">Şifre / PIN <span style="color:var(--red-600);font-weight:700">* (Zorunlu)</span>:</label>
                <input id="auth-password" type="password" class="auth-field" placeholder="En az 3 karakterli şifreniz">
              </div>
              <div style="display:flex;gap:10px;margin-top:14px">
                <button id="btn-auth-login" class="btn btn-primary" style="flex:1" onclick="Auth.handleLoginBtn()">Giriş Yap</button>
                <button id="btn-auth-register" class="btn btn-gold" style="flex:1" onclick="Auth.handleRegisterBtn()">Yeni Kayıt Ol</button>
              </div>
              ${!this.isGuest() ? '<button class="btn btn-ghost" style="width:100%;margin-top:8px;color:var(--red-600)" onclick="Auth.logout()">Çıkış Yap (Misafir Moduna Dön)</button>' : ''}
            </div>

            <!-- 2. Cihaz Eşleme & Senkronizasyon Paneli (1-Tıkla Aktarım) -->
            <div id="auth-tab-sync" class="auth-tab-content hidden">
              <div style="background:var(--green-50);border:1px solid var(--green-200);border-radius:var(--r-m);padding:14px;margin-bottom:14px">
                <div style="font-weight:800;color:var(--green-950);margin-bottom:4px;font-size:.92rem">
                  🔗 1-Tıkla Tablet / Telefon Senkronizasyonu
                </div>
                <p style="font-size:.82rem;color:var(--gray-600);line-height:1.5;margin-bottom:10px">
                  Bilgisayardaki tüm ezber ve benzer ayet listelerinizi tabletinize veya telefonunuza anında aktarın:
                </p>
                <button class="btn btn-primary" style="width:100%;padding:11px;font-weight:700" onclick="Auth.handleCopySyncLink()">
                  📋 Senkronizasyon Linkini Kopyala
                </button>
              </div>

              <div style="border-top:1px dashed var(--gray-200);padding-top:14px">
                <div style="font-weight:700;font-size:.85rem;color:var(--gray-800);margin-bottom:8px">
                  📥 Eşleme Kodu ile Giriş Yap (Tablette Yapıştırın):
                </div>
                <div style="display:flex;gap:8px">
                  <input id="input-sync-code" type="text" class="auth-field" placeholder="Eşleme kodunu buraya yapıştırın..." style="font-size:.82rem">
                  <button class="btn btn-gold" style="white-space:nowrap;padding:8px 14px" onclick="Auth.handleApplySyncCode()">Aktar</button>
                </div>
              </div>

              <div style="display:flex;gap:10px;margin-top:14px">
                <button class="btn btn-sm btn-outline" style="flex:1" onclick="Auth.exportBackup()">📁 Dosya Olarak İndir</button>
                <label class="btn btn-sm btn-outline" style="flex:1;text-align:center;cursor:pointer">
                  📁 Dosyadan Yükle
                  <input type="file" id="auth-import-file" accept=".json" style="display:none" onchange="Auth.handleImportFile(event)">
                </label>
              </div>
            </div>

            <!-- 3. Şifre Değiştir Paneli -->
            <div id="auth-tab-password" class="auth-tab-content hidden">
              <div class="auth-input-group">
                <label for="auth-old-pw">Mevcut Şifre:</label>
                <input id="auth-old-pw" type="password" class="auth-field" placeholder="Eski şifreniz">
              </div>
              <div class="auth-input-group">
                <label for="auth-new-pw">Yeni Şifre:</label>
                <input id="auth-new-pw" type="password" class="auth-field" placeholder="Yeni şifreniz (En az 3 karakter)">
              </div>
              <div class="auth-input-group">
                <label for="auth-new-pw2">Yeni Şifre (Tekrar):</label>
                <input id="auth-new-pw2" type="password" class="auth-field" placeholder="Yeni şifrenizi tekrar yazın">
              </div>
              <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:11px" onclick="Auth.handleChangePasswordBtn()">
                💾 Şifreyi Güncelle
              </button>
            </div>

            <!-- 4. Profiller Listesi -->
            <div id="auth-tab-profiles" class="auth-tab-content hidden">
              <div id="auth-profiles-list" class="auth-profiles-list"></div>
            </div>

          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  },

  updateHeaderBadge() {
    const badgeNames = document.querySelectorAll('.auth-btn-name');
    badgeNames.forEach(span => {
      span.textContent = this._activeUser.name;
    });
  },

  openAuthModal() {
    this.updateModalStats();
    this.renderProfilesList();
    $('auth-modal-overlay').classList.remove('hidden');
  },

  closeAuthModal() {
    $('auth-modal-overlay').classList.add('hidden');
  },

  setModalTab(tabId) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.toggle('hidden', c.id !== `auth-tab-${tabId}`));
  },

  updateModalStats() {
    $('modal-user-name').textContent = this._activeUser.name;
    $('modal-user-status').textContent = this.isGuest() ? 'Misafir Profili' : 'Kayıtlı Profil';

    if (typeof Memorized !== 'undefined') {
      $('auth-stat-mem').textContent = Memorized.count();
    }
    if (typeof Bookmarks !== 'undefined') {
      $('auth-stat-bm').textContent = Bookmarks.count();
    }
    if (typeof LastPage !== 'undefined') {
      $('auth-stat-lp').textContent = `Sayfa ${LastPage.get()}`;
    }
  },

  renderProfilesList() {
    const container = $('auth-profiles-list');
    if (!container) return;
    container.innerHTML = '';

    Object.values(this._users).forEach(u => {
      const isCurrent = (u.id === this._activeUser.id);
      const memCount = u.data && u.data.memorized ? u.data.memorized.length : 0;
      const simCount = u.data && u.data.similarLists ? u.data.similarLists.length : 0;
      const row = document.createElement('div');
      row.className = 'auth-profile-item' + (isCurrent ? ' active' : '');
      row.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:700;font-size:.9rem">${u.name} ${isCurrent ? '<span class="badge badge-green" style="font-size:.68rem">Aktif</span>' : ''}</div>
          <div style="font-size:.75rem;color:var(--gray-500)">${memCount} ezber · ${simCount} liste · Son sayfa: ${u.data.lastPage || 1}</div>
        </div>
        ${!isCurrent ? `<button class="btn btn-sm btn-secondary" onclick="Auth.switchUser('${u.id}')">Geç</button>` : ''}
      `;
      container.appendChild(row);
    });
  },

  handleLoginBtn() {
    const uInput = $('auth-username');
    const pInput = $('auth-password');
    const res = this.login(uInput.value, pInput.value);
    if (res.success) {
      this.closeAuthModal();
    } else {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  handleRegisterBtn() {
    const uInput = $('auth-username');
    const pInput = $('auth-password');
    const res = this.register(uInput.value, pInput.value);
    if (res.success) {
      this.closeAuthModal();
    } else {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  handleCopySyncLink() {
    if (this.isGuest()) {
      if (typeof showToast === 'function') showToast('⚠️ Lütfen önce bir hesap açın veya giriş yapın.', 'error');
      else alert('Lütfen önce bir hesap açın.');
      return;
    }
    const link = this.generateSyncLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        if (typeof showToast === 'function') showToast('📋 Senkronizasyon linki kopyalandı! Tabletinizde açın.', 'success');
        else alert('Senkronizasyon linki kopyalandı: ' + link);
      }).catch(() => {
        prompt('Aşağıdaki linki kopyalayıp tabletinizde açın:', link);
      });
    } else {
      prompt('Aşağıdaki linki kopyalayıp tabletinizde açın:', link);
    }
  },

  handleApplySyncCode() {
    const input = $('input-sync-code');
    const res = this.importSyncCode(input ? input.value : '');
    if (res.success) {
      if (typeof showToast === 'function') showToast(res.message, 'success');
      this.closeAuthModal();
    } else {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  handleChangePasswordBtn() {
    const oldP = $('auth-old-pw') ? $('auth-old-pw').value : '';
    const newP = $('auth-new-pw') ? $('auth-new-pw').value : '';
    const newP2 = $('auth-new-pw2') ? $('auth-new-pw2').value : '';
    const res = this.changePassword(oldP, newP, newP2);
    if (res.success) {
      if (typeof showToast === 'function') showToast('🔑 ' + res.message, 'success');
      else alert(res.message);
      if ($('auth-old-pw')) $('auth-old-pw').value = '';
      if ($('auth-new-pw')) $('auth-new-pw').value = '';
      if ($('auth-new-pw2')) $('auth-new-pw2').value = '';
    } else {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const res = this.importBackup(e.target.result);
      if (res.success) {
        if (typeof showToast === 'function') showToast(res.message, 'success');
        this.closeAuthModal();
      } else {
        alert(res.message);
      }
    };
    reader.readAsText(file);
  }
};

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', () => Auth.init());
