/* ================================================================
   auth.js — Huffaz Kullanıcı Hesap Sistemi ve Veri Senkronizasyonu
   Tüm sayfalarda kullanıcı bazlı veri yönetimi ve cihazlar arası aktarım sağlar.
================================================================ */
'use strict';

const Auth = {
  LS_USERS: 'huffaz_accounts_v1',
  LS_ACTIVE_USER: 'huffaz_active_user_id',

  _users: {},
  _activeUser: null,

  init() {
    this.loadUsers();
    this.loadActiveUser();
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
          testScore: { total: 0, correct: 0 }
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

  register(username, password) {
    username = username.trim();
    if (!username) return { success: false, message: 'Kullanıcı adı boş olamaz.' };
    const id = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!id) return { success: false, message: 'Geçersiz kullanıcı adı.' };
    if (this._users[id]) return { success: false, message: 'Bu kullanıcı adı zaten mevcut.' };

    // Mevcut aktif kullanıcının verilerini yeni hesaba aktar
    const initialData = this._activeUser ? JSON.parse(JSON.stringify(this._activeUser.data)) : {
      memorized: [],
      bookmarks: [],
      lastPage: 1,
      spreadMode: 'single',
      testScore: { total: 0, correct: 0 }
    };

    const newUser = {
      id,
      name: username,
      password: password || '',
      createdAt: Date.now(),
      data: initialData
    };

    this._users[id] = newUser;
    this.saveUsers();
    this.switchUser(id);
    return { success: true, message: `Hoş geldiniz, ${username}!` };
  },

  login(username, password) {
    username = username.trim();
    const id = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const user = this._users[id];
    if (!user) return { success: false, message: 'Kullanıcı bulunamadı.' };
    if (user.password && user.password !== password) {
      return { success: false, message: 'Şifre hatalı.' };
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
    if (newPw !== confirmPw) {
      return { success: false, message: 'Yeni şifreler birbiriyle eşleşmiyor.' };
    }
    this._activeUser.password = newPw;
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

    // Memorized ve Bookmarks yeniden yükle
    if (typeof Memorized !== 'undefined' && Memorized.load) Memorized.load();
    if (typeof Bookmarks !== 'undefined' && Bookmarks.load) Bookmarks.load();

    this.updateHeaderBadge();
    if (typeof showToast === 'function') {
      showToast(`Aktif Profil: ${this._activeUser.name}`, 'success');
    }
    // Sayfayı hafifçe yenile veya render fonksiyonunu tetikle
    setTimeout(() => location.reload(), 400);
  },

  // ── Veri Dışa Aktar (Yedek İndir) ──
  exportBackup() {
    const backup = {
      appName: 'Huffaz',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      user: {
        id: this._activeUser.id,
        name: this._activeUser.name,
        data: this._activeUser.data
      }
    };
    const str = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', str);
    dl.setAttribute('download', `huffaz_yedek_${this._activeUser.id}_${new Date().toISOString().slice(0,10)}.json`);
    dl.click();
    if (typeof showToast === 'function') showToast('📥 Yedek dosyası indirildi!', 'success');
  },

  // ── Veri İçe Aktar (Yedek Yükle) ──
  importBackup(fileContent) {
    try {
      const parsed = JSON.parse(fileContent);
      if (!parsed || !parsed.user || !parsed.user.data) {
        return { success: false, message: 'Geçersiz Huffaz yedek dosyası.' };
      }
      const u = parsed.user;
      const targetId = u.id || 'imported_user';
      this._users[targetId] = {
        id: targetId,
        name: u.name || targetId,
        password: '',
        createdAt: Date.now(),
        data: u.data
      };
      this.saveUsers();
      this.switchUser(targetId);
      return { success: true, message: 'Yedek başarıyla yüklendi!' };
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
                <div class="auth-profile-status" id="modal-user-status">${this.isGuest() ? 'Misafir Modu' : 'Kayıtlı Kullanıcı'}</div>
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
              <button class="auth-tab" data-tab="password" onclick="Auth.setModalTab('password')">🔑 Şifre Değiştir</button>
              <button class="auth-tab" data-tab="sync" onclick="Auth.setModalTab('sync')">📥 Yedekle</button>
              <button class="auth-tab" data-tab="profiles" onclick="Auth.setModalTab('profiles')">👥 Profiller</button>
            </div>

            <!-- 1. Giriş / Kayıt Paneli -->
            <div id="auth-tab-login" class="auth-tab-content active">
              <div class="auth-input-group">
                <label for="auth-username">Kullanıcı Adı:</label>
                <input id="auth-username" type="text" class="auth-field" placeholder="Örn: hafiz_ahmet">
              </div>
              <div class="auth-input-group">
                <label for="auth-password">Şifre / PIN (isteğe bağlı):</label>
                <input id="auth-password" type="password" class="auth-field" placeholder="Şifreniz">
              </div>
              <div style="display:flex;gap:10px;margin-top:14px">
                <button class="btn btn-primary" style="flex:1" onclick="Auth.handleLoginBtn()">Giriş Yap</button>
                <button class="btn btn-gold" style="flex:1" onclick="Auth.handleRegisterBtn()">Yeni Kayıt Ol</button>
              </div>
              ${!this.isGuest() ? '<button class="btn btn-ghost" style="width:100%;margin-top:8px;color:var(--red-600)" onclick="Auth.logout()">Çıkış Yap (Misafir Moduna Dön)</button>' : ''}
            </div>

            <!-- 2. Şifre Değiştir Paneli -->
            <div id="auth-tab-password" class="auth-tab-content hidden">
              <div class="auth-input-group">
                <label for="auth-old-pw">Mevcut Şifre (varsa):</label>
                <input id="auth-old-pw" type="password" class="auth-field" placeholder="Eski şifreniz">
              </div>
              <div class="auth-input-group">
                <label for="auth-new-pw">Yeni Şifre / PIN:</label>
                <input id="auth-new-pw" type="password" class="auth-field" placeholder="Yeni şifreniz">
              </div>
              <div class="auth-input-group">
                <label for="auth-new-pw2">Yeni Şifre (Tekrar):</label>
                <input id="auth-new-pw2" type="password" class="auth-field" placeholder="Yeni şifrenizi tekrar yazın">
              </div>
              <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:11px" onclick="Auth.handleChangePasswordBtn()">
                💾 Şifreyi Güncelle
              </button>
            </div>

            <!-- 3. Yedekle & Senkronize Et Paneli -->
            <div id="auth-tab-sync" class="auth-tab-content hidden">
              <p style="font-size:.82rem;color:var(--gray-600);margin-bottom:14px;line-height:1.5">
                Ezberlediğiniz tüm ayetleri, yer imlerinizi ve okuma geçmişinizi diğer telefon, tablet veya bilgisayarlarınıza kolayca aktarabilirsiniz.
              </p>
              <div style="display:flex;flex-direction:column;gap:10px">
                <button class="btn btn-success" onclick="Auth.exportBackup()" style="width:100%;padding:12px">
                  📥 Bu Cihazdaki Verileri Yedekle (İndir)
                </button>
                <label class="btn btn-outline" style="width:100%;padding:12px;text-align:center;cursor:pointer">
                  📤 Yedek Dosyasını İçe Aktar (Yükle)
                  <input type="file" id="auth-import-file" accept=".json" style="display:none" onchange="Auth.handleImportFile(event)">
                </label>
              </div>
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
    $('modal-user-status').textContent = this.isGuest() ? 'Misafir Profili' : 'Kayıtlı Kullanıcı';
    
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
      const row = document.createElement('div');
      row.className = 'auth-profile-item' + (isCurrent ? ' active' : '');
      row.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:700;font-size:.9rem">${u.name} ${isCurrent ? '<span class="badge badge-green" style="font-size:.68rem">Aktif</span>' : ''}</div>
          <div style="font-size:.75rem;color:var(--gray-500)">${memCount} ezber ayet · Son sayfa: ${u.data.lastPage || 1}</div>
        </div>
        ${!isCurrent ? `<button class="btn btn-sm btn-secondary" onclick="Auth.switchUser('${u.id}')">Geç</button>` : ''}
      `;
      container.appendChild(row);
    });
  },

  handleLoginBtn() {
    const u = $('auth-username').value;
    const p = $('auth-password').value;
    const res = this.login(u, p);
    if (res.success) {
      this.closeAuthModal();
    } else {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  handleRegisterBtn() {
    const u = $('auth-username').value;
    const p = $('auth-password').value;
    const res = this.register(u, p);
    if (res.success) {
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
