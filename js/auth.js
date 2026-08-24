/* ================================================================
   auth.js — Huffaz Kullanıcı Hesap Sistemi ve Gerçek Zamanlı Bulut Senkronizasyonu
   Cihazlar arası (Bilgisayar, Tablet, Telefon) anlık hesap ve veri senkronizasyonu sağlar.
================================================================ */
'use strict';

const Auth = {
  LS_USERS: 'huffaz_accounts_v4',
  LS_ACTIVE_USER: 'huffaz_active_user_id_v4',

  // Global Bulut Veritabanı (Cihazlar arası senkronizasyon için)
  CLOUD_API: 'https://api.restful-api.dev/objects',
  REGISTRY_ID: 'ff8081819ff5b11001a033f67e6b0f58',

  _users: {},
  _activeUser: null,
  _syncTimeout: null,

  init() {
    // Önceki tüm yerel hesap ve test verilerini temizle (Kullanıcı talebi)
    try {
      [
        'huffaz_accounts_v1', 'huffaz_accounts_v2', 'huffaz_accounts_v3',
        'huffaz_active_user_id', 'huffaz_active_user_id_v2', 'huffaz_active_user_id_v3',
        'huffaz_similar_lists_v1', 'huffaz_memorized_v1', 'huffaz_bookmarks_v1'
      ].forEach(k => {
        if (localStorage.getItem(k)) localStorage.removeItem(k);
      });
    } catch (e) {
      console.warn('Storage cleanup error:', e);
    }

    this.loadUsers();
    this.loadActiveUser();
    this.injectAuthUI();

    // Arka planda aktif kullanıcının bulut verisini kontrol et ve senkronize et
    if (!this.isGuest() && this._activeUser.cloudId) {
      this.pullCloudSync(false);
    }
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

  // ── Bulut Kayıt (Tüm Cihazlarda Benzersiz & Senkron) ──
  async register(username, password) {
    username = username.trim();
    if (!username) return { success: false, message: 'Kullanıcı adı boş olamaz.' };
    const id = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!id) return { success: false, message: 'Geçersiz kullanıcı adı.' };

    // 1. Bulut Ana Kayıt Defterini Al
    let registry = await this.fetchCloudRegistry();
    if (registry && registry.users && registry.users[id]) {
      return {
        success: false,
        message: `⚠️ "${username}" kullanıcı adı başka bir cihazda zaten oluşturulmuş! Lütfen "Giriş Yap" sekmesinden şifrenizle giriş yapın.`
      };
    }

    // 2. Mevcut aktif kullanıcının verilerini yeni hesaba aktar
    const initialData = this._activeUser ? JSON.parse(JSON.stringify(this._activeUser.data)) : {
      memorized: [],
      bookmarks: [],
      lastPage: 1,
      spreadMode: 'single',
      testScore: { total: 0, correct: 0 },
      similarLists: []
    };

    // 3. Bulutta Kullanıcı Nesnesi Oluştur
    let cloudId = null;
    try {
      const res = await fetch(this.CLOUD_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `huffaz_user_${id}`,
          data: {
            username,
            id,
            password: password || '',
            createdAt: Date.now(),
            ...initialData
          }
        })
      });
      if (res.ok) {
        const doc = await res.json();
        cloudId = doc.id;
      }
    } catch (err) {
      console.warn('Bulut kullanıcı oluşturma uyarısı:', err);
    }

    // 4. Bulut Kayıt Defterini Güncelle
    if (cloudId) {
      await this.updateCloudRegistry(id, {
        cloudId,
        name: username,
        password: password || '',
        createdAt: Date.now()
      });
    }

    const newUser = {
      id,
      name: username,
      password: password || '',
      cloudId,
      createdAt: Date.now(),
      data: initialData
    };

    this._users[id] = newUser;
    this.saveUsers();
    this.switchUser(id);
    return { success: true, message: `Hoş geldiniz, ${username}! Hesabınız oluşturuldu ve buluta kaydedildi.` };
  },

  // ── Bulut Giriş (Farklı Cihazlardan Anında Giriş ve Veri İndirme) ──
  async login(username, password) {
    username = username.trim();
    const id = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!id) return { success: false, message: 'Lütfen geçerli bir kullanıcı adı girin.' };

    // 1. Önce Bulut Kayıt Defterini Sorgula
    const registry = await this.fetchCloudRegistry();
    let cloudUser = registry && registry.users ? registry.users[id] : null;

    if (!cloudUser) {
      // Yerelde var mı kontrol et
      if (this._users[id]) {
        cloudUser = this._users[id];
      }
    }

    if (!cloudUser) {
      return {
        success: false,
        message: `⚠️ "${username}" adında kayıtlı bir hesap bulunamadı. Lütfen "Yeni Kayıt Ol" sekmesinden hesabınızı oluşturun.`
      };
    }

    if (cloudUser.password && cloudUser.password !== password) {
      return { success: false, message: 'Şifre hatalı.' };
    }

    // 2. Kullanıcının Canlı Bulut Verisini İndir
    let userData = this._users[id] ? this._users[id].data : {
      memorized: [],
      bookmarks: [],
      lastPage: 1,
      spreadMode: 'single',
      testScore: { total: 0, correct: 0 },
      similarLists: []
    };

    if (cloudUser.cloudId) {
      try {
        const res = await fetch(`${this.CLOUD_API}/${cloudUser.cloudId}`);
        if (res.ok) {
          const doc = await res.json();
          if (doc && doc.data) {
            userData = {
              memorized: doc.data.memorized || [],
              bookmarks: doc.data.bookmarks || [],
              lastPage: doc.data.lastPage || 1,
              spreadMode: doc.data.spreadMode || 'single',
              testScore: doc.data.testScore || { total: 0, correct: 0 },
              similarLists: doc.data.similarLists || []
            };
          }
        }
      } catch (err) {
        console.warn('Bulut kullanıcı verisi çekilemedi:', err);
      }
    }

    // 3. Yerel Cihaza Kaydet ve Aktif Kullanıcı Yap
    this._users[id] = {
      id,
      name: cloudUser.name || username,
      password: cloudUser.password || '',
      cloudId: cloudUser.cloudId || null,
      createdAt: cloudUser.createdAt || Date.now(),
      data: userData
    };

    this.saveUsers();
    this.switchUser(id);
    return { success: true, message: `Giriş başarılı! ${username} hesabınızın tüm ezber ve listeleri bu cihaza yüklendi.` };
  },

  // ── Otomatik Bulut Senkronizasyonu (Değişiklikleri Buluta İt) ──
  pushCloudSync() {
    if (this.isGuest() || !this._activeUser || !this._activeUser.cloudId) return;

    clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(async () => {
      try {
        await fetch(`${this.CLOUD_API}/${this._activeUser.cloudId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `huffaz_user_${this._activeUser.id}`,
            data: {
              username: this._activeUser.name,
              id: this._activeUser.id,
              password: this._activeUser.password || '',
              updatedAt: Date.now(),
              ...this._activeUser.data
            }
          })
        });
        console.log('Bulut senkronizasyonu tamamlandı (Otomatik Kayıt).');
      } catch (err) {
        console.warn('Bulut senkronizasyonu başarısız:', err);
      }
    }, 600);
  },

  // ── Buluttan Veri Çekme (Pull) ──
  async pullCloudSync(showNotification = true) {
    if (this.isGuest() || !this._activeUser || !this._activeUser.cloudId) return;

    try {
      const res = await fetch(`${this.CLOUD_API}/${this._activeUser.cloudId}`);
      if (res.ok) {
        const doc = await res.json();
        if (doc && doc.data) {
          this._activeUser.data = {
            memorized: doc.data.memorized || [],
            bookmarks: doc.data.bookmarks || [],
            lastPage: doc.data.lastPage || 1,
            spreadMode: doc.data.spreadMode || 'single',
            testScore: doc.data.testScore || { total: 0, correct: 0 },
            similarLists: doc.data.similarLists || []
          };
          this._users[this._activeUser.id] = this._activeUser;
          this.saveUsers();

          if (typeof Memorized !== 'undefined' && Memorized.load) Memorized.load();
          if (typeof Bookmarks !== 'undefined' && Bookmarks.load) Bookmarks.load();
          if (typeof SimilarLists !== 'undefined' && SimilarLists.load) SimilarLists.load();

          if (showNotification && typeof showToast === 'function') {
            showToast('☁️ Buluttan en güncel verileriniz yüklendi!', 'success');
          }
        }
      }
    } catch (err) {
      console.warn('Bulut verisi çekilemedi:', err);
    }
  },

  // ── Bulut Kayıt Defteri Yardımcıları ──
  async fetchCloudRegistry() {
    try {
      const res = await fetch(`${this.CLOUD_API}/${this.REGISTRY_ID}`);
      if (res.ok) {
        const doc = await res.json();
        return doc && doc.data ? doc.data : { users: {} };
      }
    } catch (err) {
      console.warn('Kayıt defteri okuma hatası:', err);
    }
    return { users: {} };
  },

  async updateCloudRegistry(userId, userData) {
    try {
      const current = await this.fetchCloudRegistry();
      if (!current.users) current.users = {};
      current.users[userId] = userData;

      await fetch(`${this.CLOUD_API}/${this.REGISTRY_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'huffaz_global_registry_v1',
          data: current
        })
      });
    } catch (err) {
      console.warn('Kayıt defteri güncelleme hatası:', err);
    }
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
    this.pushCloudSync();
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

  // ── Veri Dışa Aktar (Yedek İndir) ──
  exportBackup() {
    const backup = {
      appName: 'Huffaz',
      version: '3.0',
      exportedAt: new Date().toISOString(),
      user: {
        id: this._activeUser.id,
        name: this._activeUser.name,
        cloudId: this._activeUser.cloudId || null,
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
        cloudId: u.cloudId || null,
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
              <h3 id="auth-modal-title">Kişisel Hesap & Bulut Senkronizasyon</h3>
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
                  ${this.isGuest() ? 'Misafir Modu' : '☁️ Canlı Bulut Senkronizasyonu Aktif'}
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
              <button class="auth-tab" data-tab="password" onclick="Auth.setModalTab('password')">🔑 Şifre Değiştir</button>
              <button class="auth-tab" data-tab="sync" onclick="Auth.setModalTab('sync')">📥 Yedekle</button>
              <button class="auth-tab" data-tab="profiles" onclick="Auth.setModalTab('profiles')">👥 Cihaz Profilleri</button>
            </div>

            <!-- 1. Giriş / Kayıt Paneli -->
            <div id="auth-tab-login" class="auth-tab-content active">
              <div class="auth-input-group">
                <label for="auth-username">Kullanıcı Adı:</label>
                <input id="auth-username" type="text" class="auth-field" placeholder="Örn: Ahmet veya hafiz_ahmet">
              </div>
              <div class="auth-input-group">
                <label for="auth-password">Şifre / PIN (isteğe bağlı):</label>
                <input id="auth-password" type="password" class="auth-field" placeholder="Şifreniz">
              </div>
              <div style="display:flex;gap:10px;margin-top:14px">
                <button id="btn-auth-login" class="btn btn-primary" style="flex:1" onclick="Auth.handleLoginBtn()">Giriş Yap</button>
                <button id="btn-auth-register" class="btn btn-gold" style="flex:1" onclick="Auth.handleRegisterBtn()">Yeni Kayıt Ol</button>
              </div>
              <p style="font-size:.78rem;color:var(--gray-500);text-align:center;margin-top:10px">
                ☁️ Hesabınız bulut üzerinden bilgisayar, tablet ve telefonlarınızda otomatik senkronize olur.
              </p>
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
                Ezberlediğiniz tüm ayetleri, yer imlerinizi ve benzer ayet listelerinizi dosya olarak da yedekleyebilirsiniz.
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
    $('modal-user-status').textContent = this.isGuest() ? 'Misafir Profili' : '☁️ Canlı Bulut Senkronizasyonu Aktif';

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

  async handleLoginBtn() {
    const uInput = $('auth-username');
    const pInput = $('auth-password');
    const btn = $('btn-auth-login');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Giriş yapılıyor...';

    try {
      const res = await this.login(uInput.value, pInput.value);
      if (res.success) {
        this.closeAuthModal();
      } else {
        if (typeof showToast === 'function') showToast(res.message, 'error');
        else alert(res.message);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  },

  async handleRegisterBtn() {
    const uInput = $('auth-username');
    const pInput = $('auth-password');
    const btn = $('btn-auth-register');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Kaydediliyor...';

    try {
      const res = await this.register(uInput.value, pInput.value);
      if (res.success) {
        this.closeAuthModal();
      } else {
        if (typeof showToast === 'function') showToast(res.message, 'error');
        else alert(res.message);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
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
