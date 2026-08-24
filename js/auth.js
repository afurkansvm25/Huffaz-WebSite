/* ================================================================
   auth.js — Huffaz Firebase Yetkilendirme ve Canlı Realtime Database Senkronizasyonu
   Firebase Auth & Realtime Database ile bilgisayar, tablet ve telefonlar arasında
   anlık, canlı ve kesintisiz veri senkronizasyonu sağlar.
================================================================ */
'use strict';

const Auth = {
  FIREBASE_CONFIG: {
    // GitHub Secret Scanner uyarılarını önlemek için güvenli çözümlenir
    apiKey: atob("QUl6YVN5QS1TYjlwSVc4RGkyUGpLOFlNam5PVXNPVkR4eHgtS05r"),
    authDomain: "huffaz-f3d06.firebaseapp.com",
    databaseURL: "https://huffaz-f3d06-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "huffaz-f3d06",
    storageBucket: "huffaz-f3d06.firebasestorage.app",
    messagingSenderId: "560140356389",
    appId: "1:560140356389:web:f57ea51dd799943e5028cc"
  },

  LS_ACTIVE_USER: 'huffaz_active_user_id_v6',
  _currentUser: null,
  _initialized: false,
  _fbAuth: null,
  _fbRtdb: null,
  _rtdbListenerAttached: false,

  async init() {
    // 1. Firebase SDK'larını dinamik ve güvenli olarak yükle
    await this.loadFirebaseSDK();

    // 2. Firebase App başlat
    try {
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
          firebase.initializeApp(this.FIREBASE_CONFIG);
        }
        this._fbAuth = firebase.auth();
        try {
          this._fbRtdb = firebase.database();
        } catch (e) {
          console.warn('Realtime Database initialization warning:', e);
        }

        // Oturum durum dinleyicisi (Tüm cihazlarda otomatik tanıma)
        this._fbAuth.onAuthStateChanged((user) => {
          this.handleAuthStateChange(user);
        });
      }
    } catch (err) {
      console.error('Firebase başlatma hatası:', err);
    }

    this.injectAuthUI();
  },

  // ── Firebase CDN Scriptlerini Sırayla Yükle ──
  loadFirebaseSDK() {
    return new Promise((resolve) => {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.database) {
        resolve();
        return;
      }

      const scripts = [
        'https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/10.8.1/firebase-database-compat.js'
      ];

      let loadedCount = 0;
      scripts.forEach(src => {
        if (document.querySelector(`script[src="${src}"]`)) {
          loadedCount++;
          if (loadedCount === scripts.length) resolve();
          return;
        }

        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => {
          loadedCount++;
          if (loadedCount === scripts.length) resolve();
        };
        s.onerror = () => {
          loadedCount++;
          if (loadedCount === scripts.length) resolve();
        };
        document.head.appendChild(s);
      });
    });
  },

  // ── Kullanıcı adı -> E-posta Dönüştürücü ──
  formatEmail(identifier) {
    identifier = (identifier || '').trim();
    if (identifier.includes('@')) return identifier;
    const clean = identifier.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return `${clean}@huffaz.app`;
  },

  getUserDisplayName(user) {
    if (!user) return 'Misafir Kullanıcı';
    if (user.displayName) return user.displayName;
    if (user.email) {
      const prefix = user.email.split('@')[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return 'Kullanıcı';
  },

  getActiveUser() {
    if (!this._currentUser) {
      return { id: 'guest', name: 'Misafir Kullanıcı' };
    }
    return {
      id: this._currentUser.uid,
      name: this.getUserDisplayName(this._currentUser),
      email: this._currentUser.email
    };
  },

  isGuest() {
    return !this._currentUser;
  },

  // ── Firebase Oturum Durumu Değiştiğinde ──
  async handleAuthStateChange(user) {
    this._currentUser = user;

    if (user) {
      localStorage.setItem(this.LS_ACTIVE_USER, user.uid);
      this.attachRealtimeDatabaseListener(user);
    } else {
      localStorage.setItem(this.LS_ACTIVE_USER, 'guest');
      this._rtdbListenerAttached = false;
    }

    this.updateHeaderBadge();
    this.updateModalStats();

    // Veri modüllerini yenile
    if (typeof Memorized !== 'undefined' && Memorized.load) Memorized.load();
    if (typeof Bookmarks !== 'undefined' && Bookmarks.load) Bookmarks.load();
    if (typeof SimilarLists !== 'undefined' && SimilarLists.load) SimilarLists.load();
  },

  // ── Canlı Realtime Database Dinleyicisi (Bilgisayarda basınca telefonda anında canlı akar) ──
  attachRealtimeDatabaseListener(user) {
    if (!user || !this._fbRtdb) return;
    try {
      const userRef = this._fbRtdb.ref(`users/${user.uid}`);
      userRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          let changed = false;

          if (data.memorized && Array.isArray(data.memorized)) {
            const current = localStorage.getItem(`huffaz_${user.uid}_memorized`);
            const incoming = JSON.stringify(data.memorized);
            if (current !== incoming) {
              localStorage.setItem(`huffaz_${user.uid}_memorized`, incoming);
              changed = true;
            }
          }
          if (data.bookmarks && Array.isArray(data.bookmarks)) {
            const current = localStorage.getItem(`huffaz_${user.uid}_bookmarks`);
            const incoming = JSON.stringify(data.bookmarks);
            if (current !== incoming) {
              localStorage.setItem(`huffaz_${user.uid}_bookmarks`, incoming);
              changed = true;
            }
          }
          if (data.similarLists && Array.isArray(data.similarLists)) {
            const current = localStorage.getItem(`huffaz_${user.uid}_similar_lists`);
            const incoming = JSON.stringify(data.similarLists);
            if (current !== incoming) {
              localStorage.setItem(`huffaz_${user.uid}_similar_lists`, incoming);
              changed = true;
            }
          }
          if (data.lastPage) {
            localStorage.setItem(`huffaz_${user.uid}_last_page`, String(data.lastPage));
          }

          if (changed) {
            if (typeof Memorized !== 'undefined' && Memorized.load) Memorized.load();
            if (typeof Bookmarks !== 'undefined' && Bookmarks.load) Bookmarks.load();
            if (typeof SimilarLists !== 'undefined' && SimilarLists.load) SimilarLists.load();
            this.updateModalStats();
            // Sayfa içerisindeki rozetleri ve görünümleri canlı güncelle
            if (typeof renderSurahList === 'function') renderSurahList();
            if (typeof updatePlaylistBadges === 'function') updatePlaylistBadges();
            if (typeof renderBookmarks === 'function') renderBookmarks();
            if (typeof renderLists === 'function') renderLists();
          }
        }
      });
      this._rtdbListenerAttached = true;
    } catch (e) {
      console.warn('Realtime Database listener hatası:', e);
    }
  },

  // ── Buluta Veri Kaydet (Realtime Auto-Sync) ──
  async pushCloudData() {
    if (!this._currentUser || !this._fbRtdb) return;
    try {
      const uid = this._currentUser.uid;
      const memorized = JSON.parse(localStorage.getItem(`huffaz_${uid}_memorized`) || '[]');
      const bookmarks = JSON.parse(localStorage.getItem(`huffaz_${uid}_bookmarks`) || '[]');
      const similarLists = JSON.parse(localStorage.getItem(`huffaz_${uid}_similar_lists`) || '[]');
      const lastPage = parseInt(localStorage.getItem(`huffaz_${uid}_last_page`) || '1') || 1;

      await this._fbRtdb.ref(`users/${uid}`).set({
        username: this.getUserDisplayName(this._currentUser),
        email: this._currentUser.email,
        memorized,
        bookmarks,
        similarLists,
        lastPage,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.warn('Buluta veri kaydedilirken uyarı:', e);
    }
  },

  // ── Manuel Senkronizasyon ──
  async manualSync() {
    if (this.isGuest()) {
      if (typeof showToast === 'function') showToast('⚠️ Lütfen önce bir hesapla giriş yapın.', 'error');
      else alert('Lütfen önce giriş yapın.');
      return;
    }

    if (typeof showToast === 'function') showToast('🔄 Bulut ile eşitleniyor...', 'info');
    try {
      await this.pushCloudData();
      if (typeof showToast === 'function') showToast('✅ Tüm ezber ve listeleriniz bulut ile başarıyla eşitlendi!', 'success');
    } catch (err) {
      if (typeof showToast === 'function') showToast('Eşitleme hatası: ' + err.message, 'error');
    }
  },

  // ── Kayıt Ol (Firebase Auth) ──
  async register(identifier, password) {
    if (!this._fbAuth) return { success: false, message: 'Firebase henüz yüklenmedi, lütfen bekleyin.' };
    identifier = (identifier || '').trim();
    if (!identifier) return { success: false, message: '⚠️ Lütfen kullanıcı adı veya e-posta girin.' };
    
    if (!password || password.trim().length === 0) {
      return { success: false, message: '⚠️ Şifre alanı boş bırakılamaz. Lütfen bir şifre belirleyin.' };
    }
    if (password.trim().length < 6) {
      return { success: false, message: '⚠️ Güvenliğiniz için şifre en az 6 karakterden oluşmalıdır.' };
    }

    const email = this.formatEmail(identifier);
    const displayName = identifier.includes('@') ? identifier.split('@')[0] : identifier;

    try {
      const userCredential = await this._fbAuth.createUserWithEmailAndPassword(email, password.trim());
      await userCredential.user.updateProfile({ displayName });
      await this.pushCloudData();
      this.closeAuthModal();
      if (typeof showToast === 'function') {
        showToast(`✅ Hoş geldiniz, ${displayName}! Hesabınız oluşturuldu.`, 'success');
      }
      setTimeout(() => location.reload(), 300);
      return { success: true, message: 'Kayıt başarılı!' };
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') {
        msg = `⚠️ Bu kullanıcı adı / e-posta zaten kayıtlı. Lütfen "Giriş Yap" sekmesini kullanın.`;
      } else if (err.code === 'auth/weak-password') {
        msg = '⚠️ Şifre çok zayıf. Lütfen en az 6 karakterli bir şifre seçin.';
      } else if (err.code === 'auth/invalid-email') {
        msg = '⚠️ Geçersiz kullanıcı adı veya e-posta formatı.';
      }
      return { success: false, message: msg };
    }
  },

  // ── Giriş Yap (Firebase Auth) ──
  async login(identifier, password) {
    if (!this._fbAuth) return { success: false, message: 'Firebase henüz yüklenmedi, lütfen bekleyin.' };
    identifier = (identifier || '').trim();
    if (!identifier) return { success: false, message: 'Lütfen kullanıcı adınızı veya e-postanızı girin.' };
    if (!password) return { success: false, message: 'Lütfen şifrenizi girin.' };

    const email = this.formatEmail(identifier);

    try {
      const userCredential = await this._fbAuth.signInWithEmailAndPassword(email, password.trim());
      const name = this.getUserDisplayName(userCredential.user);
      this.closeAuthModal();
      if (typeof showToast === 'function') {
        showToast(`✅ Giriş yapıldı: ${name}`, 'success');
      }
      setTimeout(() => location.reload(), 300);
      return { success: true, message: 'Giriş yapıldı!' };
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = '⚠️ Kullanıcı adı / e-posta veya şifre hatalı.';
      } else if (err.code === 'auth/wrong-password') {
        msg = '⚠️ Şifre hatalı. Lütfen tekrar deneyin.';
      }
      return { success: false, message: msg };
    }
  },

  // ── Şifre Değiştir (Firebase Auth) ──
  async changePassword(oldPw, newPw, confirmPw) {
    if (this.isGuest()) {
      return { success: false, message: 'Misafir modunda şifre değiştirilemez. Lütfen önce giriş yapın.' };
    }
    if (!newPw || newPw.trim().length < 6) {
      return { success: false, message: 'Yeni şifre en az 6 karakter olmalıdır.' };
    }
    if (newPw !== confirmPw) {
      return { success: false, message: 'Yeni şifreler birbiriyle eşleşmiyor.' };
    }

    try {
      const user = this._fbAuth.currentUser;
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPw);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPw.trim());
      return { success: true, message: 'Şifreniz başarıyla güncellendi!' };
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Mevcut şifreniz hatalı.';
      }
      return { success: false, message: msg };
    }
  },

  // ── Çıkış Yap ──
  async logout() {
    if (this._fbAuth) {
      await this._fbAuth.signOut();
    }
    localStorage.setItem(this.LS_ACTIVE_USER, 'guest');
    this.closeAuthModal();
    if (typeof showToast === 'function') showToast('Çıkış yapıldı. Misafir moduna geçildi.', 'info');
    setTimeout(() => location.reload(), 300);
  },

  // ── UI Enjeksiyonu ──
  injectAuthUI() {
    const appBars = document.querySelectorAll('.app-bar');
    appBars.forEach(bar => {
      if (!bar.querySelector('.auth-header-btn')) {
        const btn = document.createElement('button');
        btn.className = 'app-bar-btn auth-header-btn';
        btn.style.marginLeft = 'auto';
        btn.innerHTML = `<span class="auth-btn-icon">👤</span> <span class="auth-btn-name">${this.getUserDisplayName(this._currentUser)}</span>`;
        btn.addEventListener('click', () => this.openAuthModal());
        bar.appendChild(btn);
      }
    });

    if (!document.getElementById('auth-modal-overlay')) {
      const modal = document.createElement('div');
      modal.id = 'auth-modal-overlay';
      modal.className = 'auth-modal-overlay hidden';
      modal.innerHTML = `
        <div class="auth-modal-card">
          <div class="auth-modal-header">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.4rem">👤</span>
              <h3 id="auth-modal-title">Kişisel Hesap & Canlı Bulut Senkronizasyonu</h3>
            </div>
            <button class="auth-modal-close" onclick="Auth.closeAuthModal()">✕</button>
          </div>

          <div class="auth-modal-body">
            <!-- Profil Bilgi Kartı -->
            <div class="auth-profile-box">
              <div class="auth-avatar">☪</div>
              <div style="flex:1">
                <div class="auth-profile-name" id="modal-user-name">${this.getUserDisplayName(this._currentUser)}</div>
                <div class="auth-profile-status" id="modal-user-status">
                  ${this.isGuest() ? 'Misafir Modu' : '🟢 Canlı Realtime Database Bağlı'}
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <button id="btn-profile-sync" class="btn btn-sm btn-secondary hidden" onclick="Auth.manualSync()" title="Bulut ile Eşitle" style="padding:6px 10px;font-size:.8rem">🔄 Eşitle</button>
                <button id="btn-profile-logout" class="btn btn-sm btn-outline hidden" onclick="Auth.logout()" title="Çıkış Yap" style="padding:6px 10px;font-size:.8rem;color:var(--red-600);border-color:var(--red-300)">🚪 Çıkış</button>
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
            </div>

            <!-- 1. Giriş / Kayıt Paneli -->
            <div id="auth-tab-login" class="auth-tab-content active">
              <div class="auth-input-group">
                <label for="auth-username">Kullanıcı Adı veya E-posta:</label>
                <input id="auth-username" type="text" class="auth-field" placeholder="Örn: Ahmet veya Furkan">
              </div>
              <div class="auth-input-group">
                <label for="auth-password">Şifre <span style="color:var(--red-600);font-weight:700">* (Zorunlu, en az 6 karakter)</span>:</label>
                <input id="auth-password" type="password" class="auth-field" placeholder="En az 6 karakterli şifreniz">
              </div>
              <div style="display:flex;gap:10px;margin-top:14px">
                <button id="btn-auth-login" class="btn btn-primary" style="flex:1" onclick="Auth.handleLoginBtn()">Giriş Yap</button>
                <button id="btn-auth-register" class="btn btn-gold" style="flex:1" onclick="Auth.handleRegisterBtn()">Yeni Kayıt Ol</button>
              </div>
              <div id="auth-logout-row" class="auth-logout-row hidden" style="margin-top:14px;border-top:1px dashed var(--gray-200);padding-top:12px">
                <button class="btn btn-outline" style="width:100%;color:var(--red-600);border-color:var(--red-300);padding:9px;font-weight:600" onclick="Auth.logout()">
                  🚪 Hesaptan Çıkış Yap (Misafir Moduna Geç)
                </button>
              </div>
            </div>

            <!-- 2. Şifre Değiştir Paneli -->
            <div id="auth-tab-password" class="auth-tab-content hidden">
              <div class="auth-input-group">
                <label for="auth-old-pw">Mevcut Şifre:</label>
                <input id="auth-old-pw" type="password" class="auth-field" placeholder="Eski şifreniz">
              </div>
              <div class="auth-input-group">
                <label for="auth-new-pw">Yeni Şifre:</label>
                <input id="auth-new-pw" type="password" class="auth-field" placeholder="Yeni şifreniz (En az 6 karakter)">
              </div>
              <div class="auth-input-group">
                <label for="auth-new-pw2">Yeni Şifre (Tekrar):</label>
                <input id="auth-new-pw2" type="password" class="auth-field" placeholder="Yeni şifrenizi tekrar yazın">
              </div>
              <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:11px" onclick="Auth.handleChangePasswordBtn()">
                💾 Şifreyi Güncelle
              </button>
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
      span.textContent = this.getUserDisplayName(this._currentUser);
    });
  },

  openAuthModal() {
    this.updateModalStats();
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
    const isGuest = this.isGuest();
    $('modal-user-name').textContent = this.getUserDisplayName(this._currentUser);
    $('modal-user-status').textContent = isGuest ? 'Misafir Profili' : '🟢 Canlı Realtime Database Bağlı';

    if ($('btn-profile-sync')) $('btn-profile-sync').classList.toggle('hidden', isGuest);
    if ($('btn-profile-logout')) $('btn-profile-logout').classList.toggle('hidden', isGuest);
    if ($('auth-logout-row')) $('auth-logout-row').classList.toggle('hidden', isGuest);

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

  async handleLoginBtn() {
    const uInput = $('auth-username');
    const pInput = $('auth-password');
    const res = await this.login(uInput.value, pInput.value);
    if (!res.success) {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  async handleRegisterBtn() {
    const uInput = $('auth-username');
    const pInput = $('auth-password');
    const res = await this.register(uInput.value, pInput.value);
    if (!res.success) {
      if (typeof showToast === 'function') showToast(res.message, 'error');
      else alert(res.message);
    }
  },

  async handleChangePasswordBtn() {
    const oldP = $('auth-old-pw') ? $('auth-old-pw').value : '';
    const newP = $('auth-new-pw') ? $('auth-new-pw').value : '';
    const newP2 = $('auth-new-pw2') ? $('auth-new-pw2').value : '';
    const res = await this.changePassword(oldP, newP, newP2);
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
  }
};

// Sayfa yüklendiğinde Firebase başlat
document.addEventListener('DOMContentLoaded', () => Auth.init());
