/**
 * Expense Dashboard & Wealth Manager
 * Dynamic Web Application - Reactive State, SVG Charts & Local Storage Persistence
 */

(() => {
  'use strict';

  // --- 1. CONSTANTS & DEFAULT DATA ---
  const CATEGORIES = [
    'Meals',
    'Food',
    'Travel',
    'Stationery',
    'Subscriptions',
    'Books & Courses',
    'Health',
    'Entertainment',
    'Hostel & Utilities',
    'Gifts',
    'Other'
  ];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const STORAGE_KEY = 'rupeetrack_expense_dashboard_v1';

  const DEFAULT_STATE = {
    allotment: {
      totalMoney: 20000,
      cashAllotted: 8000,
      onlineAllotted: 12000
    },
    expenses: [
      {
        id: '1',
        day: 30,
        month: 'Oct',
        year: 2026,
        date: '2026-10-30',
        description: 'Lunch – canteen',
        category: 'Meals',
        mode: 'Cash',
        amount: 120
      }
    ]
  };

  // --- 2. CLOUD SYNC & AUTHENTICATION ENGINE ---
  const USERS_KEY = 'wasp_registered_users_v1';
  const CURRENT_USER_KEY = 'wasp_current_session_v1';
  const FIREBASE_CONFIG_KEY = 'wasp_firebase_config_v1';

  // Unified Cloud Manager (Firebase + Local Storage Fallback)
  const CloudManager = {
    isConfigured: false,
    db: null,
    auth: null,
    unsubscribeFirestore: null,

    getConfig() {
      try {
        const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (stored) return JSON.parse(stored);
      } catch (e) {}
      return window.DEFAULT_FIREBASE_CONFIG || null;
    },

    saveConfig(cfg) {
      try {
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(cfg));
      } catch (e) {}
    },

    clearConfig() {
      try {
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
      } catch (e) {}
      this.isConfigured = false;
      this.db = null;
      this.auth = null;
    },

    init() {
      const cfg = this.getConfig();
      if (window.firebase && cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.trim() !== '') {
        try {
          if (!firebase.apps.length) {
            firebase.initializeApp(cfg);
          }
          this.auth = firebase.auth();
          this.db = firebase.firestore();
          this.isConfigured = true;
          this.setupAuthObserver();
          this.updateUiIndicators(true);
          return true;
        } catch (err) {
          console.warn('Firebase initialization error:', err);
          this.isConfigured = false;
        }
      }
      this.updateUiIndicators(false);
      return false;
    },

    updateUiIndicators(isCloud) {
      const pill = document.getElementById('cloudSyncStatusPill');
      const text = document.getElementById('cloudStatusText');
      const badge = document.getElementById('cloudStatusBadge');

      if (pill && text) {
        if (isCloud) {
          pill.className = 'cloud-status-pill pill-cloud';
          pill.title = 'Cloud Sync: Connected to Firebase Cloud Database';
          text.textContent = 'Cloud Active';
        } else {
          pill.className = 'cloud-status-pill pill-local';
          pill.title = 'Cloud Sync: Local Mode (Configure Firebase in Settings to sync across devices)';
          text.textContent = 'Local';
        }
      }

      if (badge) {
        if (isCloud) {
          badge.className = 'badge badge-cash';
          badge.textContent = '🟢 Connected to Cloud';
        } else {
          badge.className = 'badge badge-category';
          badge.textContent = '🟠 Local Mode (Offline)';
        }
      }
    },

    setupAuthObserver() {
      if (!this.auth) return;
      this.auth.onAuthStateChanged(async (fbUser) => {
        if (fbUser) {
          const userSession = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email.split('@')[0],
            email: fbUser.email.toLowerCase(),
            isCloud: true
          };
          AuthManager.setCurrentUser(userSession);
          this.subscribeToUserFirestore(fbUser.uid);
        } else {
          if (this.unsubscribeFirestore) {
            this.unsubscribeFirestore();
            this.unsubscribeFirestore = null;
          }
          AuthManager.setCurrentUser(null);
          appState = loadState();
          syncSettingsInputs();
          renderUserProfileWidget();
          renderAll();
        }
      });
    },

    subscribeToUserFirestore(uid) {
      if (!this.db) return;
      if (this.unsubscribeFirestore) {
        this.unsubscribeFirestore();
      }

      this.unsubscribeFirestore = this.db.collection('users').doc(uid).onSnapshot(async (doc) => {
        if (doc.exists) {
          const cloudData = doc.data();
          if (cloudData.allotment && Array.isArray(cloudData.expenses)) {
            appState = cloudData;
            // Also cache locally
            localStorage.setItem(getUserStorageKey(), JSON.stringify(appState));
            syncSettingsInputs();
            renderUserProfileWidget();
            renderAll();
          }
        } else {
          // Initialize doc with current app state
          await this.saveToFirestore(uid, appState);
        }
      }, (err) => {
        console.warn('Firestore subscription error:', err);
      });
    },

    async saveToFirestore(uid, data) {
      if (!this.db) return;
      try {
        await this.db.collection('users').doc(uid).set({
          allotment: data.allotment,
          expenses: data.expenses,
          lastUpdated: new Date().toISOString()
        });
      } catch (err) {
        console.error('Failed to sync to Firestore:', err);
      }
    }
  };

  // Local Storage Auth Manager (Fallback & Local Profile Manager)
  const AuthManager = {
    getUsers() {
      try {
        const u = localStorage.getItem(USERS_KEY);
        return u ? JSON.parse(u) : {};
      } catch (e) {
        return {};
      }
    },

    saveUsers(users) {
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
      } catch (e) {}
    },

    getCurrentUser() {
      try {
        const s = localStorage.getItem(CURRENT_USER_KEY);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    },

    setCurrentUser(user) {
      try {
        if (user) {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        } else {
          localStorage.removeItem(CURRENT_USER_KEY);
        }
      } catch (e) {}
    },

    async hashPassword(password, salt) {
      const enc = new TextEncoder();
      const data = enc.encode(salt + ':' + password);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    generateSalt() {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async register(name, email, password) {
      const cleanEmail = email.trim().toLowerCase();

      // Cloud registration if connected
      if (CloudManager.isConfigured && CloudManager.auth) {
        try {
          const cred = await CloudManager.auth.createUserWithEmailAndPassword(cleanEmail, password);
          if (cred.user) {
            await cred.user.updateProfile({ displayName: name.trim() });
          }
          return { id: cred.user.uid, name: name.trim(), email: cleanEmail };
        } catch (fbErr) {
          throw new Error(fbErr.message || 'Firebase Registration failed.');
        }
      }

      // Local registration
      const users = this.getUsers();
      if (users[cleanEmail]) {
        throw new Error('An account with this email already exists.');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }
      const salt = this.generateSalt();
      const hash = await this.hashPassword(password, salt);
      const newUser = {
        id: 'u_' + Date.now(),
        name: name.trim(),
        email: cleanEmail,
        salt,
        hash,
        createdAt: new Date().toISOString()
      };
      users[cleanEmail] = newUser;
      this.saveUsers(users);
      this.setCurrentUser({ id: newUser.id, name: newUser.name, email: cleanEmail });
      return newUser;
    },

    async login(email, password) {
      const cleanEmail = email.trim().toLowerCase();

      // Cloud login if connected
      if (CloudManager.isConfigured && CloudManager.auth) {
        try {
          const cred = await CloudManager.auth.signInWithEmailAndPassword(cleanEmail, password);
          return {
            id: cred.user.uid,
            name: cred.user.displayName || cleanEmail.split('@')[0],
            email: cleanEmail
          };
        } catch (fbErr) {
          throw new Error(fbErr.message || 'Firebase Sign In failed.');
        }
      }

      // Local login
      const users = this.getUsers();
      const user = users[cleanEmail];
      if (!user) {
        throw new Error('No account found with this email.');
      }
      const hash = await this.hashPassword(password, user.salt);
      if (hash !== user.hash) {
        throw new Error('Incorrect password. Please try again.');
      }
      this.setCurrentUser({ id: user.id, name: user.name, email: cleanEmail });
      return user;
    },

    async logout() {
      if (CloudManager.isConfigured && CloudManager.auth) {
        try {
          await CloudManager.auth.signOut();
        } catch (e) {}
      }
      this.setCurrentUser(null);
    }
  };

  function getUserStorageKey() {
    const cur = AuthManager.getCurrentUser();
    return cur ? `wasp_userdata_${cur.email}` : 'wasp_userdata_guest';
  }

  // --- 3. STATE MANAGEMENT ---
  let appState = loadState();

  function loadState() {
    try {
      const key = getUserStorageKey();
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.allotment && Array.isArray(parsed.expenses)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function saveState() {
    try {
      const key = getUserStorageKey();
      localStorage.setItem(key, JSON.stringify(appState));

      // Push to Cloud Firestore if connected
      const cur = AuthManager.getCurrentUser();
      if (CloudManager.isConfigured && cur && cur.id) {
        CloudManager.saveToFirestore(cur.id, appState);
      }
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  // --- 4. FORMATTING HELPERS ---
  const formatINR = (val) => {
    const num = Number(val) || 0;
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
      maximumFractionDigits: 2
    });
  };

  const formatPercent = (val) => {
    const num = Number(val) || 0;
    return (num * 100).toFixed(1) + '%';
  };

  function parseEntryDate(entry) {
    if (entry.date) return new Date(entry.date);
    const mIdx = MONTHS.indexOf(entry.month);
    return new Date(entry.year, mIdx >= 0 ? mIdx : 0, entry.day);
  }

  function formatDateReadable(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = MONTHS[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    return `${day} ${month} ${year}`;
  }

  // --- 4. DOM ELEMENTS ---
  const elements = {
    currentDateDisplay: document.getElementById('currentDateDisplay'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    
    // KPIs
    kpiTotalMoney: document.getElementById('kpiTotalMoney'),
    kpiTotalMoneySub: document.getElementById('kpiTotalMoneySub'),
    kpiTotalSpent: document.getElementById('kpiTotalSpent'),
    kpiTotalSpentSub: document.getElementById('kpiTotalSpentSub'),
    kpiMoneyLeft: document.getElementById('kpiMoneyLeft'),
    kpiMoneyLeftSub: document.getElementById('kpiMoneyLeftSub'),
    kpiCashLeft: document.getElementById('kpiCashLeft'),
    kpiCashLeftSub: document.getElementById('kpiCashLeftSub'),
    kpiOnlineBalance: document.getElementById('kpiOnlineBalance'),
    kpiOnlineBalanceSub: document.getElementById('kpiOnlineBalanceSub'),
    kpiLatestMonthLabel: document.getElementById('kpiLatestMonthLabel'),
    kpiLatestMonth: document.getElementById('kpiLatestMonth'),
    kpiLatestMonthSub: document.getElementById('kpiLatestMonthSub'),
    kpiTransactionsCount: document.getElementById('kpiTransactionsCount'),
    kpiAvgPerEntry: document.getElementById('kpiAvgPerEntry'),
    kpiTopCategory: document.getElementById('kpiTopCategory'),
    kpiTopCategorySub: document.getElementById('kpiTopCategorySub'),

    // Allotment Table & Progress
    allotTotalMoney: document.getElementById('allotTotalMoney'),
    allotTotalMoneyPct: document.getElementById('allotTotalMoneyPct'),
    allotCash: document.getElementById('allotCash'),
    allotCashPct: document.getElementById('allotCashPct'),
    allotOnline: document.getElementById('allotOnline'),
    allotOnlinePct: document.getElementById('allotOnlinePct'),
    allotUnallocated: document.getElementById('allotUnallocated'),
    allotUnallocatedPct: document.getElementById('allotUnallocatedPct'),
    allotSpentSoFar: document.getElementById('allotSpentSoFar'),
    allotSpentPct: document.getElementById('allotSpentPct'),
    allotCashLeft: document.getElementById('allotCashLeft'),
    allotCashLeftPct: document.getElementById('allotCashLeftPct'),
    allotOnlineLeft: document.getElementById('allotOnlineLeft'),
    allotOnlineLeftPct: document.getElementById('allotOnlineLeftPct'),
    allotMoneyLeft: document.getElementById('allotMoneyLeft'),
    allotMoneyLeftPct: document.getElementById('allotMoneyLeftPct'),
    cashUsedText: document.getElementById('cashUsedText'),
    cashProgressBar: document.getElementById('cashProgressBar'),
    totalUsedText: document.getElementById('totalUsedText'),
    totalProgressBar: document.getElementById('totalProgressBar'),

    // Category summary table
    summaryCategoryTableBody: document.getElementById('summaryCategoryTableBody'),
    categoryTableTotal: document.getElementById('categoryTableTotal'),
    categoryTableEntries: document.getElementById('categoryTableEntries'),

    // Log Sheet
    logTableBody: document.getElementById('logTableBody'),
    emptyLogState: document.getElementById('emptyLogState'),

    // Ledger
    ledgerTableBody: document.getElementById('ledgerTableBody'),
    ledgerSummarySubtitle: document.getElementById('ledgerSummarySubtitle'),

    // Category Drilldown
    categoryDrilldownSelect: document.getElementById('categoryDrilldownSelect'),
    categoryDrilldownBanner: document.getElementById('categoryDrilldownBanner'),
    catDrilldownAmountEntries: document.getElementById('catDrilldownAmountEntries'),
    catDrilldownAvgShare: document.getElementById('catDrilldownAvgShare'),
    categoryDrilldownTableBody: document.getElementById('categoryDrilldownTableBody'),
    emptyCategoryState: document.getElementById('emptyCategoryState'),

    // Settings
    moneyAllotmentForm: document.getElementById('moneyAllotmentForm'),
    inputTotalMoney: document.getElementById('inputTotalMoney'),
    inputCashAllotted: document.getElementById('inputCashAllotted'),
    inputOnlineAllotted: document.getElementById('inputOnlineAllotted'),
    allotmentSavedMsg: document.getElementById('allotmentSavedMsg'),
    categoriesPillList: document.getElementById('categoriesPillList'),
    resetSampleDataBtn: document.getElementById('resetSampleDataBtn'),
    clearAllDataBtn: document.getElementById('clearAllDataBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),

    // Cloud Sync Settings
    firebaseConfigForm: document.getElementById('firebaseConfigForm'),
    fbApiKey: document.getElementById('fbApiKey'),
    fbProjectId: document.getElementById('fbProjectId'),
    fbAuthDomain: document.getElementById('fbAuthDomain'),
    fbAppId: document.getElementById('fbAppId'),
    disconnectCloudBtn: document.getElementById('disconnectCloudBtn'),
    cloudSavedIndicator: document.getElementById('cloudSavedIndicator'),

    // Modal
    expenseModal: document.getElementById('expenseModal'),
    modalTitle: document.getElementById('modalTitle'),
    openAddModalBtn: document.getElementById('openAddModalBtn'),
    openAddModalBtn2: document.getElementById('openAddModalBtn2'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    expenseForm: document.getElementById('expenseForm'),
    editEntryId: document.getElementById('editEntryId'),
    formDay: document.getElementById('formDay'),
    formMonth: document.getElementById('formMonth'),
    formYear: document.getElementById('formYear'),
    formDescription: document.getElementById('formDescription'),
    formCategory: document.getElementById('formCategory'),
    formPaymentMode: document.getElementById('formPaymentMode'),
    formAmount: document.getElementById('formAmount'),

    // Theme Toggle
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeToggleIcon: document.getElementById('themeToggleIcon'),

    // Auth Elements
    userProfileWidget: document.getElementById('userProfileWidget'),
    authModal: document.getElementById('authModal'),
    authModalTitle: document.getElementById('authModalTitle'),
    closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),
    authTabLogin: document.getElementById('authTabLogin'),
    authTabRegister: document.getElementById('authTabRegister'),
    authAlert: document.getElementById('authAlert'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    registerName: document.getElementById('registerName'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    continueGuestBtn: document.getElementById('continueGuestBtn'),

    // Toast
    toastNotification: document.getElementById('toastNotification')
  };

  // --- 5. INITIALIZATION ---
  function init() {
    // Current date header
    const now = new Date();
    elements.currentDateDisplay.textContent = `As of ${formatDateReadable(now)}`;

    // Sync Theme icon
    updateThemeIcon();

    // Initialize Cloud Sync (Firebase or Local)
    CloudManager.init();

    // Populate Cloud Config inputs in Settings
    const fbCfg = CloudManager.getConfig();
    if (fbCfg) {
      if (elements.fbApiKey) elements.fbApiKey.value = fbCfg.apiKey || '';
      if (elements.fbProjectId) elements.fbProjectId.value = fbCfg.projectId || '';
      if (elements.fbAuthDomain) elements.fbAuthDomain.value = fbCfg.authDomain || '';
      if (elements.fbAppId) elements.fbAppId.value = fbCfg.appId || '';
    }

    // Render User session widget
    renderUserProfileWidget();

    // Populate dropdowns
    populateFormDropdowns();
    populateCategorySelector();
    populateSettingsPills();

    // Fill settings inputs
    elements.inputTotalMoney.value = appState.allotment.totalMoney;
    elements.inputCashAllotted.value = appState.allotment.cashAllotted;
    elements.inputOnlineAllotted.value = appState.allotment.onlineAllotted;

    // Attach Event Listeners
    setupEventListeners();
    setupAuthListeners();

    // Initial Render
    renderAll();
  }

  function renderUserProfileWidget() {
    const user = AuthManager.getCurrentUser();
    const container = elements.userProfileWidget;
    if (!container) return;
    container.innerHTML = '';

    if (user) {
      const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
      const badge = document.createElement('div');
      badge.className = 'user-badge';
      badge.innerHTML = `
        <span class="user-avatar-circle">${escapeHtml(initial)}</span>
        <span class="user-name-text" title="${escapeHtml(user.email)}">${escapeHtml(user.name || user.email)}</span>
        <button type="button" class="btn-signout" id="userSignOutBtn" title="Log Out">Log Out</button>
      `;
      container.appendChild(badge);

      const signoutBtn = badge.querySelector('#userSignOutBtn');
      if (signoutBtn) {
        signoutBtn.addEventListener('click', () => {
          AuthManager.logout();
          appState = loadState();
          syncSettingsInputs();
          renderUserProfileWidget();
          renderAll();
          showToast('Signed out successfully');
        });
      }
    } else {
      const signinBtn = document.createElement('button');
      signinBtn.type = 'button';
      signinBtn.className = 'btn-signin-header';
      signinBtn.innerHTML = `👤 Sign In / Register`;
      signinBtn.addEventListener('click', openAuthModal);
      container.appendChild(signinBtn);
    }
  }

  function syncSettingsInputs() {
    elements.inputTotalMoney.value = appState.allotment.totalMoney;
    elements.inputCashAllotted.value = appState.allotment.cashAllotted;
    elements.inputOnlineAllotted.value = appState.allotment.onlineAllotted;
  }

  function openAuthModal() {
    hideAuthAlert();
    elements.authModal.showModal();
  }

  function closeAuthModal() {
    elements.authModal.close();
  }

  function showAuthAlert(msg, type = 'error') {
    elements.authAlert.textContent = msg;
    elements.authAlert.className = `auth-alert alert-${type}`;
    elements.authAlert.style.display = 'block';
  }

  function hideAuthAlert() {
    elements.authAlert.style.display = 'none';
  }

  function setupAuthListeners() {
    // Switch between Sign In and Register
    elements.authTabLogin.addEventListener('click', () => {
      elements.authTabLogin.classList.add('active');
      elements.authTabRegister.classList.remove('active');
      elements.loginForm.style.display = 'block';
      elements.registerForm.style.display = 'none';
      elements.authModalTitle.textContent = 'Account Sign In';
      hideAuthAlert();
    });

    elements.authTabRegister.addEventListener('click', () => {
      elements.authTabRegister.classList.add('active');
      elements.authTabLogin.classList.remove('active');
      elements.loginForm.style.display = 'none';
      elements.registerForm.style.display = 'block';
      elements.authModalTitle.textContent = 'Create New Account';
      hideAuthAlert();
    });

    // Close buttons
    elements.closeAuthModalBtn.addEventListener('click', closeAuthModal);
    elements.continueGuestBtn.addEventListener('click', () => {
      closeAuthModal();
      showToast('Continuing as Guest / Demo Mode');
    });

    // Password visibility toggle buttons
    document.querySelectorAll('.btn-toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          const isPass = input.type === 'password';
          input.type = isPass ? 'text' : 'password';
          btn.textContent = isPass ? '🔒' : '👁️';
        }
      });
    });

    // Sign In Submission
    elements.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthAlert();
      const email = elements.loginEmail.value;
      const pass = elements.loginPassword.value;
      try {
        const user = await AuthManager.login(email, pass);
        closeAuthModal();
        appState = loadState();
        syncSettingsInputs();
        renderUserProfileWidget();
        renderAll();
        showToast(`Welcome back, ${user.name || user.email}!`);
      } catch (err) {
        showAuthAlert(err.message, 'error');
      }
    });

    // Register Submission
    elements.registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAuthAlert();
      const name = elements.registerName.value;
      const email = elements.registerEmail.value;
      const pass = elements.registerPassword.value;
      try {
        const user = await AuthManager.register(name, email, pass);
        // Save initial default state for new user
        saveState();
        closeAuthModal();
        appState = loadState();
        syncSettingsInputs();
        renderUserProfileWidget();
        renderAll();
        showToast(`Account created! Welcome, ${user.name}!`);
      } catch (err) {
        showAuthAlert(err.message, 'error');
      }
    });
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('wasp-color-theme', newTheme);
    } catch (e) {}
    updateThemeIcon();
    renderAll();
    showToast(`Switched to ${newTheme} mode`);
  }

  function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (elements.themeToggleIcon) {
      elements.themeToggleIcon.textContent = isDark ? '☀️' : '🌙';
    }
  }

  function getThemeColor(varName, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  }

  function populateFormDropdowns() {
    // Days 1 to 31
    elements.formDay.innerHTML = '';
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      elements.formDay.appendChild(opt);
    }

    // Years 2024 to 2040
    elements.formYear.innerHTML = '';
    for (let y = 2024; y <= 2040; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === 2026) opt.selected = true;
      elements.formYear.appendChild(opt);
    }

    // Categories
    elements.formCategory.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      elements.formCategory.appendChild(opt);
    });
  }

  function populateCategorySelector() {
    elements.categoryDrilldownSelect.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      elements.categoryDrilldownSelect.appendChild(opt);
    });
  }

  function populateSettingsPills() {
    elements.categoriesPillList.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const span = document.createElement('span');
      span.className = 'badge badge-category';
      span.textContent = cat;
      elements.categoriesPillList.appendChild(span);
    });
  }

  // --- 6. CORE CALCULATIONS & RENDERING ---
  function calculateMetrics() {
    const totalMoney = Number(appState.allotment.totalMoney) || 0;
    const cashAllotted = Number(appState.allotment.cashAllotted) || 0;
    const onlineAllotted = Number(appState.allotment.onlineAllotted) || 0;
    const unallocated = totalMoney - cashAllotted - onlineAllotted;

    let totalSpent = 0;
    let cashSpent = 0;
    let onlineSpent = 0;

    const categoryTotals = {};
    const categoryCounts = {};
    CATEGORIES.forEach(c => {
      categoryTotals[c] = 0;
      categoryCounts[c] = 0;
    });

    const monthlyTotals = {};

    appState.expenses.forEach(item => {
      const amt = Number(item.amount) || 0;
      totalSpent += amt;

      if (item.mode === 'Cash') {
        cashSpent += amt;
      } else {
        onlineSpent += amt;
      }

      if (categoryTotals.hasOwnProperty(item.category)) {
        categoryTotals[item.category] += amt;
        categoryCounts[item.category] += 1;
      } else {
        categoryTotals[item.category] = (categoryTotals[item.category] || 0) + amt;
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      }

      const d = parseEntryDate(item);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyTotals[mKey] = (monthlyTotals[mKey] || 0) + amt;
    });

    const cashLeft = cashAllotted - cashSpent;
    const onlineLeft = onlineAllotted - onlineSpent;
    const moneyLeft = totalMoney - totalSpent;

    const cashUsedPct = cashAllotted > 0 ? (cashSpent / cashAllotted) : 0;
    const totalUsedPct = totalMoney > 0 ? (totalSpent / totalMoney) : 0;

    // Top Category
    let topCat = '–';
    let topCatAmt = 0;
    Object.entries(categoryTotals).forEach(([cat, val]) => {
      if (val > topCatAmt) {
        topCatAmt = val;
        topCat = cat;
      }
    });

    // Latest month
    const mKeys = Object.keys(monthlyTotals).sort();
    const latestMonthKey = mKeys.length > 0 ? mKeys[mKeys.length - 1] : null;
    const latestMonthSpend = latestMonthKey ? monthlyTotals[latestMonthKey] : 0;

    return {
      totalMoney,
      cashAllotted,
      onlineAllotted,
      unallocated,
      totalSpent,
      cashSpent,
      onlineSpent,
      cashLeft,
      onlineLeft,
      moneyLeft,
      cashUsedPct,
      totalUsedPct,
      categoryTotals,
      categoryCounts,
      topCat,
      topCatAmt,
      latestMonthKey,
      latestMonthSpend,
      monthlyTotals
    };
  }

  function renderAll() {
    const m = calculateMetrics();

    // 1. Render KPIs
    elements.kpiTotalMoney.textContent = formatINR(m.totalMoney);
    elements.kpiTotalMoneySub.textContent = `Cash ${formatINR(m.cashAllotted)} · Online ${formatINR(m.onlineAllotted)}`;

    elements.kpiTotalSpent.textContent = formatINR(m.totalSpent);
    elements.kpiTotalSpentSub.textContent = `${appState.expenses.length} entries`;

    elements.kpiMoneyLeft.textContent = formatINR(m.moneyLeft);
    elements.kpiMoneyLeftSub.textContent = m.totalMoney > 0
      ? `${formatPercent(m.moneyLeft / m.totalMoney)} remaining`
      : 'Enter total money in Settings';

    elements.kpiCashLeft.textContent = formatINR(m.cashLeft);
    elements.kpiCashLeftSub.textContent = `of ${formatINR(m.cashAllotted)} cash · ${m.cashAllotted > 0 ? formatPercent(m.cashLeft / m.cashAllotted) : '0%'} remaining`;

    elements.kpiOnlineBalance.textContent = formatINR(m.onlineLeft);
    elements.kpiOnlineBalanceSub.textContent = `of ${formatINR(m.onlineAllotted)} online · ${m.onlineAllotted > 0 ? formatPercent(m.onlineLeft / m.onlineAllotted) : '0%'} remaining`;

    if (m.latestMonthKey) {
      const [yr, mo] = m.latestMonthKey.split('-');
      const moName = MONTHS[parseInt(mo, 10) - 1];
      elements.kpiLatestMonthLabel.textContent = `LATEST MONTH · ${moName.toUpperCase()} ${yr}`;
      elements.kpiLatestMonth.textContent = formatINR(m.latestMonthSpend);
    } else {
      elements.kpiLatestMonthLabel.textContent = 'LATEST MONTH';
      elements.kpiLatestMonth.textContent = '₹0';
    }

    elements.kpiTransactionsCount.textContent = appState.expenses.length;
    const avgSpend = appState.expenses.length > 0 ? (m.totalSpent / appState.expenses.length) : 0;
    elements.kpiAvgPerEntry.textContent = `Avg ${formatINR(avgSpend)} per entry`;

    elements.kpiTopCategory.textContent = m.topCat;
    elements.kpiTopCategorySub.textContent = m.totalSpent > 0 && m.topCatAmt > 0
      ? `${formatPercent(m.topCatAmt / m.totalSpent)} of spend · ${formatINR(m.topCatAmt)}`
      : 'No spending yet';

    // 2. Render Allotment Table
    elements.allotTotalMoney.textContent = formatINR(m.totalMoney);
    elements.allotTotalMoneyPct.textContent = '100%';

    elements.allotCash.textContent = formatINR(m.cashAllotted);
    elements.allotCashPct.textContent = m.totalMoney > 0 ? formatPercent(m.cashAllotted / m.totalMoney) : '0%';

    elements.allotOnline.textContent = formatINR(m.onlineAllotted);
    elements.allotOnlinePct.textContent = m.totalMoney > 0 ? formatPercent(m.onlineAllotted / m.totalMoney) : '0%';

    elements.allotUnallocated.textContent = formatINR(m.unallocated);
    elements.allotUnallocatedPct.textContent = m.totalMoney > 0 ? formatPercent(m.unallocated / m.totalMoney) : '0%';

    elements.allotSpentSoFar.textContent = formatINR(m.totalSpent);
    elements.allotSpentPct.textContent = m.totalMoney > 0 ? formatPercent(m.totalSpent / m.totalMoney) : '0%';

    elements.allotCashLeft.textContent = formatINR(m.cashLeft);
    elements.allotCashLeftPct.textContent = m.totalMoney > 0 ? formatPercent(m.cashLeft / m.totalMoney) : '0%';

    elements.allotOnlineLeft.textContent = formatINR(m.onlineLeft);
    elements.allotOnlineLeftPct.textContent = m.totalMoney > 0 ? formatPercent(m.onlineLeft / m.totalMoney) : '0%';

    elements.allotMoneyLeft.textContent = formatINR(m.moneyLeft);
    elements.allotMoneyLeftPct.textContent = m.totalMoney > 0 ? formatPercent(m.moneyLeft / m.totalMoney) : '0%';

    // Progress Bars
    const cashCap = Math.min(100, Math.max(0, m.cashUsedPct * 100));
    elements.cashProgressBar.style.width = `${cashCap}%`;
    elements.cashUsedText.textContent = `${cashCap.toFixed(0)}%`;

    const totalCap = Math.min(100, Math.max(0, m.totalUsedPct * 100));
    elements.totalProgressBar.style.width = `${totalCap}%`;
    elements.totalUsedText.textContent = `${totalCap.toFixed(0)}%`;

    // 3. Render Summary Category Table
    renderSummaryCategoryTable(m);

    // 4. Render Log Table
    renderLogTable();

    // 5. Render Sorted Ledger Table
    renderLedgerTable(m);

    // 6. Render Category Drilldown
    renderCategoryDrilldown(m);

    // 7. Render SVG Charts
    renderMoneyStandsChart(m);
    renderCategoryShareChart(m);
    renderCategoryComparisonChart(m);
    renderMonthlyTrendChart(m);
  }

  function renderSummaryCategoryTable(m) {
    const tbody = elements.summaryCategoryTableBody;
    tbody.innerHTML = '';

    CATEGORIES.forEach(cat => {
      const amt = m.categoryTotals[cat] || 0;
      const count = m.categoryCounts[cat] || 0;
      const share = m.totalSpent > 0 ? (amt / m.totalSpent) : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="font-bold">${cat}</td>
        <td class="text-right">${formatINR(amt)}</td>
        <td class="text-right">${formatPercent(share)}</td>
        <td class="text-right">${count}</td>
      `;
      tbody.appendChild(tr);
    });

    elements.categoryTableTotal.textContent = formatINR(m.totalSpent);
    elements.categoryTableEntries.textContent = appState.expenses.length;
  }

  function renderLogTable() {
    const tbody = elements.logTableBody;
    tbody.innerHTML = '';

    if (appState.expenses.length === 0) {
      elements.emptyLogState.style.display = 'block';
      return;
    }
    elements.emptyLogState.style.display = 'none';

    appState.expenses.forEach((item, index) => {
      const tr = document.createElement('tr');
      const d = parseEntryDate(item);
      const isCash = item.mode === 'Cash';
      const badgeClass = isCash ? 'badge-cash' : 'badge-online';
      const badgeIcon = isCash ? '💵 Cash' : '💳 Online';

      tr.innerHTML = `
        <td class="text-center text-muted">${index + 1}</td>
        <td class="text-center font-bold text-input">${item.day}</td>
        <td class="text-center font-bold text-input">${item.month}</td>
        <td class="text-center font-bold text-input">${item.year}</td>
        <td class="text-center text-muted">${formatDateReadable(d)}</td>
        <td class="font-bold">${escapeHtml(item.description)}</td>
        <td class="text-center"><span class="badge badge-category">${item.category}</span></td>
        <td class="text-center"><span class="badge ${badgeClass}">${badgeIcon}</span></td>
        <td class="text-right font-bold">${formatINR(item.amount)}</td>
        <td class="text-center">
          <button type="button" class="btn btn-secondary btn-icon-sm" data-action="edit" data-id="${item.id}" title="Edit">✎</button>
          <button type="button" class="btn btn-danger btn-icon-sm" data-action="delete" data-id="${item.id}" title="Delete">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderLedgerTable(m) {
    const tbody = elements.ledgerTableBody;
    tbody.innerHTML = '';

    // Sort items chronologically: oldest to newest
    const sorted = [...appState.expenses].sort((a, b) => parseEntryDate(a) - parseEntryDate(b));

    elements.ledgerSummarySubtitle.textContent = `All expenses, oldest → newest · ${formatINR(m.totalSpent)} · ${sorted.length} entries`;

    let runningTotal = 0;
    sorted.forEach((item, index) => {
      runningTotal += Number(item.amount) || 0;
      const d = parseEntryDate(item);
      const isCash = item.mode === 'Cash';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center text-muted">${index + 1}</td>
        <td class="text-center">${formatDateReadable(d)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="text-center"><span class="badge badge-category">${item.category}</span></td>
        <td class="text-center"><span class="badge ${isCash ? 'badge-cash' : 'badge-online'}">${isCash ? '💵 Cash' : '💳 Online'}</span></td>
        <td class="text-right font-bold">${formatINR(item.amount)}</td>
        <td class="text-right font-bold text-accent">${formatINR(runningTotal)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderCategoryDrilldown(m) {
    const selectedCat = elements.categoryDrilldownSelect.value || CATEGORIES[0];
    const catExpenses = appState.expenses
      .filter(item => item.category === selectedCat)
      .sort((a, b) => parseEntryDate(a) - parseEntryDate(b));

    const totalCatAmt = catExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const count = catExpenses.length;
    const avg = count > 0 ? (totalCatAmt / count) : 0;
    const share = m.totalSpent > 0 ? (totalCatAmt / m.totalSpent) : 0;

    elements.catDrilldownAmountEntries.textContent = `${formatINR(totalCatAmt)} · ${count} entries`;
    elements.catDrilldownAvgShare.textContent = count > 0
      ? `Avg ${formatINR(avg)} per entry · ${formatPercent(share)} of all spend`
      : 'No entries in this category yet';

    const tbody = elements.categoryDrilldownTableBody;
    tbody.innerHTML = '';

    if (count === 0) {
      elements.emptyCategoryState.style.display = 'block';
      return;
    }
    elements.emptyCategoryState.style.display = 'none';

    let running = 0;
    catExpenses.forEach((item, index) => {
      running += Number(item.amount) || 0;
      const d = parseEntryDate(item);
      const isCash = item.mode === 'Cash';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center text-muted">${index + 1}</td>
        <td class="text-center">${formatDateReadable(d)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="text-center"><span class="badge ${isCash ? 'badge-cash' : 'badge-online'}">${isCash ? '💵 Cash' : '💳 Online'}</span></td>
        <td class="text-right font-bold">${formatINR(item.amount)}</td>
        <td class="text-right font-bold text-accent">${formatINR(running)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- 7. PURE SVG CHART RENDERERS ---
  const PALETTE = [
    '#2A9D8F', '#264653', '#E76F51', '#F4A261', '#E9C46A',
    '#457B9D', '#1D3557', '#E63946', '#8338EC', '#3A86FF', '#FB5607'
  ];

  function renderMoneyStandsChart(m) {
    const container = document.getElementById('moneyStandsChart');
    const legend = document.getElementById('moneyChartLegend');
    container.innerHTML = '';
    legend.innerHTML = '';

    const slices = [
      { label: 'Spent', value: Math.max(0, m.totalSpent), color: '#C0392B' },
      { label: 'Cash left', value: Math.max(0, m.cashLeft), color: '#10B981' },
      { label: 'Online left', value: Math.max(0, m.onlineLeft), color: '#2563EB' },
      { label: 'Unallocated', value: Math.max(0, m.unallocated), color: '#9CA3AF' }
    ].filter(s => s.value > 0);

    const totalVal = slices.reduce((sum, s) => sum + s.value, 0);

    if (totalVal === 0) {
      container.innerHTML = `<p class="empty-state">No money data configured.</p>`;
      return;
    }

    const svg = createDonutSvg(slices, totalVal, 220, 220, 55);
    container.appendChild(svg);

    // Legend
    slices.forEach(s => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-color" style="background-color: ${s.color};"></span>
        <span>${s.label}: <strong>${formatINR(s.value)}</strong> (${formatPercent(s.value / totalVal)})</span>
      `;
      legend.appendChild(item);
    });
  }

  function renderCategoryShareChart(m) {
    const container = document.getElementById('categoryShareChart');
    const legend = document.getElementById('categoryShareLegend');
    container.innerHTML = '';
    legend.innerHTML = '';

    const slices = [];
    CATEGORIES.forEach((cat, i) => {
      const val = m.categoryTotals[cat] || 0;
      if (val > 0) {
        slices.push({
          label: cat,
          value: val,
          color: PALETTE[i % PALETTE.length]
        });
      }
    });

    const totalVal = slices.reduce((sum, s) => sum + s.value, 0);

    if (totalVal === 0) {
      container.innerHTML = `<p class="empty-state">No category spending recorded yet.</p>`;
      return;
    }

    const svg = createDonutSvg(slices, totalVal, 220, 220, 55);
    container.appendChild(svg);

    // Legend
    slices.forEach(s => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-color" style="background-color: ${s.color};"></span>
        <span>${s.label}: <strong>${formatINR(s.value)}</strong> (${formatPercent(s.value / totalVal)})</span>
      `;
      legend.appendChild(item);
    });
  }

  function createDonutSvg(slices, total, width, height, innerRadius) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 10;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    let startAngle = 0;

    slices.forEach(slice => {
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', getDonutArc(cx, cy, radius, innerRadius, startAngle, endAngle));
      path.setAttribute('fill', slice.color);
      path.innerHTML = `<title>${slice.label}: ${formatINR(slice.value)} (${formatPercent(slice.value / total)})</title>`;
      svg.appendChild(path);

      startAngle = endAngle;
    });

    // Center text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy + 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', getThemeColor('--color-chart-text', '#1B263B'));
    text.textContent = formatINR(total);
    svg.appendChild(text);

    return svg;
  }

  function getDonutArc(cx, cy, rOut, rIn, startA, endA) {
    if (endA - startA >= 2 * Math.PI - 0.0001) {
      endA = startA + 2 * Math.PI - 0.0001;
    }
    const x1 = cx + rOut * Math.cos(startA - Math.PI / 2);
    const y1 = cy + rOut * Math.sin(startA - Math.PI / 2);
    const x2 = cx + rOut * Math.cos(endA - Math.PI / 2);
    const y2 = cy + rOut * Math.sin(endA - Math.PI / 2);

    const x3 = cx + rIn * Math.cos(endA - Math.PI / 2);
    const y3 = cy + rIn * Math.sin(endA - Math.PI / 2);
    const x4 = cx + rIn * Math.cos(startA - Math.PI / 2);
    const y4 = cy + rIn * Math.sin(startA - Math.PI / 2);

    const largeArc = endA - startA > Math.PI ? 1 : 0;

    return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  }

  function renderCategoryComparisonChart(m) {
    const container = document.getElementById('categoryComparisonChart');
    container.innerHTML = '';

    const catData = CATEGORIES.map(cat => ({
      label: cat,
      val: m.categoryTotals[cat] || 0
    }));

    const maxVal = Math.max(...catData.map(c => c.val), 100);

    const width = 440;
    const barHeight = 16;
    const gap = 6;
    const labelWidth = 120;
    const height = catData.length * (barHeight + gap) + 20;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);

    const textColor = getThemeColor('--color-chart-text', '#1B263B');
    const mutedColor = getThemeColor('--color-chart-muted', '#6B7280');
    const emptyBarColor = getThemeColor('--color-progress-track', '#E5E7EB');

    catData.forEach((d, i) => {
      const y = i * (barHeight + gap) + 10;
      const barWidth = ((width - labelWidth - 70) * (d.val / maxVal));

      // Label
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', labelWidth - 10);
      txt.setAttribute('y', y + barHeight - 4);
      txt.setAttribute('text-anchor', 'end');
      txt.setAttribute('font-size', '11');
      txt.setAttribute('font-weight', '600');
      txt.setAttribute('fill', textColor);
      txt.textContent = d.label;
      svg.appendChild(txt);

      // Bar
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', labelWidth);
      rect.setAttribute('y', y);
      rect.setAttribute('width', Math.max(2, barWidth));
      rect.setAttribute('height', barHeight);
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', d.val > 0 ? getThemeColor('--color-teal', '#2A9D8F') : emptyBarColor);
      svg.appendChild(rect);

      // Value text
      const valTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      valTxt.setAttribute('x', labelWidth + Math.max(2, barWidth) + 8);
      valTxt.setAttribute('y', y + barHeight - 4);
      valTxt.setAttribute('font-size', '11');
      valTxt.setAttribute('font-weight', 'bold');
      valTxt.setAttribute('fill', d.val > 0 ? textColor : mutedColor);
      valTxt.textContent = formatINR(d.val);
      svg.appendChild(valTxt);
    });

    container.appendChild(svg);
  }

  function renderMonthlyTrendChart(m) {
    const container = document.getElementById('monthlyTrendChart');
    container.innerHTML = '';

    // Generate last 6 months list
    const monthList = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTHS[dt.getMonth()]} ${dt.getFullYear().toString().slice(-2)}`;
      monthList.push({ key: k, label, val: m.monthlyTotals[k] || 0 });
    }

    const maxVal = Math.max(...monthList.map(c => c.val), 200);

    const width = 420;
    const height = 220;
    const padX = 40;
    const padY = 30;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;
    const barW = 32;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);

    const gridColor = getThemeColor('--color-chart-grid', '#E5E7EB');
    const barTextColor = getThemeColor('--color-chart-text', '#1B263B');
    const xLabelColor = getThemeColor('--color-chart-muted', '#6B7280');
    const activeBarFill = getThemeColor('--color-teal', '#2A9D8F');
    const inactiveBarFill = getThemeColor('--color-progress-track', '#E2E8F0');

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padY + (plotH / 4) * i;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padX);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width - padX);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', gridColor);
      line.setAttribute('stroke-dasharray', '2,2');
      svg.appendChild(line);
    }

    const step = plotW / monthList.length;

    monthList.forEach((item, i) => {
      const x = padX + i * step + (step - barW) / 2;
      const h = (item.val / maxVal) * plotH;
      const y = padY + (plotH - h);

      // Bar
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barW);
      rect.setAttribute('height', Math.max(3, h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', item.val > 0 ? activeBarFill : inactiveBarFill);
      svg.appendChild(rect);

      // Bar Value
      if (item.val > 0) {
        const vTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        vTxt.setAttribute('x', x + barW / 2);
        vTxt.setAttribute('y', y - 6);
        vTxt.setAttribute('text-anchor', 'middle');
        vTxt.setAttribute('font-size', '10');
        vTxt.setAttribute('font-weight', 'bold');
        vTxt.setAttribute('fill', barTextColor);
        vTxt.textContent = formatINR(item.val);
        svg.appendChild(vTxt);
      }

      // X Label
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', x + barW / 2);
      txt.setAttribute('y', height - 8);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '11');
      txt.setAttribute('font-weight', '600');
      txt.setAttribute('fill', xLabelColor);
      txt.textContent = item.label;
      svg.appendChild(txt);
    });

    container.appendChild(svg);
  }

  // --- 8. EVENT HANDLERS ---
  function setupEventListeners() {
    // Theme Toggle
    if (elements.themeToggleBtn) {
      elements.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // OS Theme Preference sync
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('wasp-color-theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        updateThemeIcon();
        renderAll();
      }
    });

    // Tabs Navigation
    elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.tabButtons.forEach(b => b.classList.remove('active'));
        elements.tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const pane = document.getElementById(targetId);
        if (pane) pane.classList.add('active');
      });
    });

    // Category Drilldown Select
    elements.categoryDrilldownSelect.addEventListener('change', () => {
      const m = calculateMetrics();
      renderCategoryDrilldown(m);
    });

    // Allotment Form Save
    elements.moneyAllotmentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const total = Number(elements.inputTotalMoney.value) || 0;
      const cash = Number(elements.inputCashAllotted.value) || 0;
      const online = Number(elements.inputOnlineAllotted.value) || 0;

      appState.allotment = {
        totalMoney: total,
        cashAllotted: cash,
        onlineAllotted: online
      };
      saveState();
      renderAll();

      elements.allotmentSavedMsg.classList.add('show');
      setTimeout(() => elements.allotmentSavedMsg.classList.remove('show'), 2000);
      showToast('Money pool allotments updated successfully!');
    });

    // Cloud Sync Configuration Form Save
    if (elements.firebaseConfigForm) {
      elements.firebaseConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfg = {
          apiKey: elements.fbApiKey.value.trim(),
          projectId: elements.fbProjectId.value.trim(),
          authDomain: elements.fbAuthDomain.value.trim(),
          appId: elements.fbAppId.value.trim()
        };
        CloudManager.saveConfig(cfg);
        const success = CloudManager.init();
        if (success) {
          if (elements.cloudSavedIndicator) {
            elements.cloudSavedIndicator.classList.add('show');
            setTimeout(() => elements.cloudSavedIndicator.classList.remove('show'), 2500);
          }
          showToast('Connected to Firebase Cloud! Cross-device sync is now active.');
        } else {
          showToast('Saved. Please verify your Firebase project keys.');
        }
      });
    }

    // Disconnect Cloud button
    if (elements.disconnectCloudBtn) {
      elements.disconnectCloudBtn.addEventListener('click', () => {
        CloudManager.clearConfig();
        if (elements.fbApiKey) elements.fbApiKey.value = '';
        if (elements.fbProjectId) elements.fbProjectId.value = '';
        if (elements.fbAuthDomain) elements.fbAuthDomain.value = '';
        if (elements.fbAppId) elements.fbAppId.value = '';
        CloudManager.updateUiIndicators(false);
        showToast('Switched to Local / Offline mode.');
      });
    }

    // Modal Opening
    const openModal = () => {
      elements.modalTitle.textContent = 'Add Expense Entry';
      elements.editEntryId.value = '';
      elements.expenseForm.reset();
      const now = new Date();
      elements.formDay.value = now.getDate();
      elements.formMonth.value = MONTHS[now.getMonth()];
      elements.formYear.value = now.getFullYear();
      elements.expenseModal.showModal();
    };

    elements.openAddModalBtn.addEventListener('click', openModal);
    elements.openAddModalBtn2.addEventListener('click', openModal);

    // Modal Closing
    elements.closeModalBtn.addEventListener('click', () => elements.expenseModal.close());
    elements.cancelModalBtn.addEventListener('click', () => elements.expenseModal.close());

    // Expense Form Submission
    elements.expenseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = elements.editEntryId.value || String(Date.now());
      const day = parseInt(elements.formDay.value, 10);
      const month = elements.formMonth.value;
      const year = parseInt(elements.formYear.value, 10);
      const desc = elements.formDescription.value.trim();
      const category = elements.formCategory.value;
      const mode = elements.formPaymentMode.value;
      const amount = parseFloat(elements.formAmount.value);

      const mIdx = MONTHS.indexOf(month);
      const isoDate = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const newEntry = {
        id,
        day,
        month,
        year,
        date: isoDate,
        description: desc,
        category,
        mode,
        amount
      };

      const existingIndex = appState.expenses.findIndex(x => x.id === id);
      if (existingIndex >= 0) {
        appState.expenses[existingIndex] = newEntry;
        showToast('Expense updated successfully!');
      } else {
        appState.expenses.push(newEntry);
        showToast(`Added ${formatINR(amount)} for ${desc} (${mode})`);
      }

      saveState();
      renderAll();
      elements.expenseModal.close();
    });

    // Table Actions (Edit & Delete delegation)
    elements.logTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      if (action === 'delete') {
        const item = appState.expenses.find(x => x.id === id);
        if (confirm(`Are you sure you want to delete "${item?.description || 'this entry'}"?`)) {
          appState.expenses = appState.expenses.filter(x => x.id !== id);
          saveState();
          renderAll();
          showToast('Entry deleted');
        }
      } else if (action === 'edit') {
        const item = appState.expenses.find(x => x.id === id);
        if (item) {
          elements.modalTitle.textContent = 'Edit Expense Entry';
          elements.editEntryId.value = item.id;
          elements.formDay.value = item.day;
          elements.formMonth.value = item.month;
          elements.formYear.value = item.year;
          elements.formDescription.value = item.description;
          elements.formCategory.value = item.category;
          elements.formPaymentMode.value = item.mode;
          elements.formAmount.value = item.amount;
          elements.expenseModal.showModal();
        }
      }
    });

    // Reset Sample Data
    elements.resetSampleDataBtn.addEventListener('click', () => {
      if (confirm('Reset all data to default sample figures?')) {
        appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveState();
        elements.inputTotalMoney.value = appState.allotment.totalMoney;
        elements.inputCashAllotted.value = appState.allotment.cashAllotted;
        elements.inputOnlineAllotted.value = appState.allotment.onlineAllotted;
        renderAll();
        showToast('Reset to default sample figures');
      }
    });

    // Clear All Log Rows
    elements.clearAllDataBtn.addEventListener('click', () => {
      if (confirm('Clear all logged transactions? Your money allotment pool will be kept.')) {
        appState.expenses = [];
        saveState();
        renderAll();
        showToast('All transaction log entries cleared');
      }
    });

    // Export CSV
    elements.exportCsvBtn.addEventListener('click', exportToCsv);
  }

  function exportToCsv() {
    if (appState.expenses.length === 0) {
      alert('No expense entries to export.');
      return;
    }

    const headers = ['#', 'DAY', 'MONTH', 'YEAR', 'DATE', 'DESCRIPTION', 'CATEGORY', 'PAYMENT MODE', 'AMOUNT'];
    const rows = appState.expenses.map((e, idx) => [
      idx + 1,
      e.day,
      e.month,
      e.year,
      e.date,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.category}"`,
      e.mode,
      e.amount
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expense_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported Expense Log to CSV');
  }

  function showToast(msg) {
    const toast = elements.toastNotification;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- 9. START APP ---
  document.addEventListener('DOMContentLoaded', init);
})();
