// ダッシュボード用JavaScript

// Custom Logger Class
class CustomLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.currentFilter = 'all';
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        
        // Override console methods
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };

        console.log = (...args) => {
            this.addLog('info', args.join(' '));
            this.originalConsole.log(...args);
        };

        console.error = (...args) => {
            this.addLog('error', args.join(' '));
            this.originalConsole.error(...args);
        };

        console.warn = (...args) => {
            this.addLog('warn', args.join(' '));
            this.originalConsole.warn(...args);
        };

        console.info = (...args) => {
            this.addLog('info', args.join(' '));
            this.originalConsole.info(...args);
        };

        this.setupLogViewer();
        this.isInitialized = true;
        
        // Add initial welcome log
        this.addLog('success', 'カスタムログシステムが初期化されました');
    }

    addLog(level, message, source = null) {
        const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            level: level,
            message: message,
            source: source
        };

        this.logs.unshift(logEntry);
        
        // Limit log count
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        this.renderLogs();
    }

    setupLogViewer() {
        // Setup filter buttons
        const filterButtons = document.querySelectorAll('.log-filter');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.currentFilter = button.dataset.level;
                this.renderLogs();
            });
        });

        // Setup search
        const searchInput = document.getElementById('log-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderLogs();
            });
        }

        // Setup clear button
        const clearButton = document.getElementById('clear-logs');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.logs = [];
                this.renderLogs();
                this.addLog('info', 'ログがクリアされました');
            });
        }

        // Setup download button
        const downloadButton = document.getElementById('download-logs');
        if (downloadButton) {
            downloadButton.addEventListener('click', () => {
                this.downloadLogs();
            });
        }
    }

    renderLogs() {
        const container = document.getElementById('log-container');
        if (!container) return;

        const searchTerm = document.getElementById('log-search')?.value.toLowerCase() || '';
        
        let filteredLogs = this.logs;
        
        // Apply level filter
        if (this.currentFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === this.currentFilter);
        }
        
        // Apply search filter
        if (searchTerm) {
            filteredLogs = filteredLogs.filter(log => 
                log.message.toLowerCase().includes(searchTerm) ||
                log.level.toLowerCase().includes(searchTerm)
            );
        }

        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="log-empty">ログがありません</div>';
            return;
        }

        container.innerHTML = filteredLogs.map(log => this.renderLogEntry(log)).join('');
    }

    renderLogEntry(log) {
        const timestamp = log.timestamp.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `
            <div class="log-entry ${log.level}" data-level="${log.level}">
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level">${log.level.toUpperCase()}</span>
                <span class="log-message">${this.escapeHtml(log.message)}</span>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadLogs() {
        const data = this.logs.map(log => ({
            timestamp: log.timestamp.toISOString(),
            level: log.level,
            message: log.message
        }));

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aivis-dashboard-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addLog('success', 'ログファイルをダウンロードしました');
    }

    // Public methods for external use
    success(message) {
        this.addLog('success', message);
    }

    info(message) {
        this.addLog('info', message);
    }

    warn(message) {
        this.addLog('warn', message);
    }

    error(message) {
        this.addLog('error', message);
    }
}

// Global logger instance
const logger = new CustomLogger();

class Dashboard {
    constructor() {
        // 状態管理を一元化
        this.state = {
            isLoggedIn: false,
            user: null,
            currentGuildId: null,
            isInitializing: false,
            isLoadingGuild: false,
            eventListeners: new Map() // イベントリスナーの管理
        };
        
        // デバウンス用のタイマー
        this.debounceTimers = new Map();
        
        // 初期化は一度だけ
        if (!Dashboard.instance) {
            this.init();
            Dashboard.instance = this;
        }
        return Dashboard.instance;
    }

    // 初期化処理を修正
    async init() {
        if (this.state.isInitializing) {
            console.warn('Already initializing, skipping duplicate init');
            return;
        }
        
        this.state.isInitializing = true;
        
        try {
            logger.info('[Dashboard] Initializing...');
            
            // 1. セッション確認
            const authenticated = await this.checkSession();
            
            if (!authenticated) {
                // 2. 認証されていない場合、短期間ポーリング
                await this.waitForAuthentication();
            }
            
            // 3. 認証済みの場合のみダッシュボードを表示
            if (this.state.isLoggedIn) {
                await this.showDashboard();
            }
            
            logger.success('[Dashboard] Initialization complete');
        } catch (error) {
            logger.error(`[Dashboard] Initialization failed: ${error.message}`);
            this.showToast('ダッシュボードの初期化に失敗しました', 'error');
        } finally {
            this.state.isInitializing = false;
        }
    }

    // セッション確認を修正
    async checkSession() {
        try {
            const session = await fetch('/api/user/session', {
                credentials: 'include'
            }).then(r => {
                if (!r.ok) throw new Error('Not authenticated');
                return r.json();
            });
            
            if (session && session.authenticated) {
                this.state.isLoggedIn = true;
                this.state.user = session.user || null;
                logger.info(`[Dashboard] User authenticated: ${this.state.user?.id}`);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`[Dashboard] Session check failed: ${error.message}`);
            return false;
        }
    }

    // ポーリング処理を修正
    async waitForAuthentication() {
        const maxAttempts = 5; // 10秒から5秒に短縮
        const interval = 1000;
        
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            
            if (await this.checkSession()) {
                return true;
            }
        }
        
        return false;
    }

    // ダッシュボード表示を修正
    async showDashboard() {
        const mainDashboard = document.getElementById('main-dashboard');
        if (!mainDashboard) {
            console.error("Element 'main-dashboard' not found");
            return;
        }

        mainDashboard.style.display = 'block';
        mainDashboard.classList.add('logged-in');

        // カスタムログシステムを初期化（一度だけ）
        if (!logger.isInitialized) {
            logger.init();
        }

        // セットアップ処理
        this.setupTabNavigation();
        this.setupEventListeners();
        this.setupLogout(); // ← ログアウトボタンのイベントリスナーを登録
        this.disableServerSpecificUI();
        
        // データ読み込み（並行実行）
        await Promise.allSettled([
            this.loadOverviewData(),
            this.loadUserInfo(),
            this.loadGuilds() // 一度だけ呼び出し
        ]);
        
        // プレミアムステータス確認
        if (this.state.isLoggedIn) {
            await this.checkPremiumStatus();
        }
        
        // 定期更新を開始（一度だけ）
        if (!this.updateInterval) {
            this.startGuildUpdates();
        }
    }

    // サーバー選択を修正（デバウンス付き）
    selectServer(serverId) {
        // デバウンス処理
        const debounceKey = 'selectServer';
        if (this.debounceTimers.has(debounceKey)) {
            clearTimeout(this.debounceTimers.get(debounceKey));
        }
        
        this.debounceTimers.set(debounceKey, setTimeout(() => {
            this._selectServerImmediate(serverId);
            this.debounceTimers.delete(debounceKey);
        }, 150));
    }

    // 即座のサーバー選択処理
    async _selectServerImmediate(serverId) {
        // 既に同じサーバーが選択されている場合はスキップ
        if (this.state.currentGuildId === serverId && this.state.isLoadingGuild) {
            console.warn('Server already selected and loading, skipping');
            return;
        }
        
        this.state.currentGuildId = serverId;
        this.state.isLoadingGuild = true;
        
        try {
            // UIを更新
            document.querySelectorAll('.server-item').forEach(item => {
                item.classList.toggle('selected', item.dataset.serverId === serverId);
            });
            
            // サーバー設定を読み込み
            await this.loadServerSettings(serverId);
            
            logger.info(`[Dashboard] Server selected: ${serverId}`);
        } catch (error) {
            logger.error(`[Dashboard] Failed to select server: ${error.message}`);
            this.showToast('サーバー設定の読み込みに失敗しました', 'error');
        } finally {
            this.state.isLoadingGuild = false;
        }
    }

    // イベントリスナーの登録を修正
    addEventListener(element, event, handler, key) {
        if (!element) return;
        
        // 既存のリスナーを削除
        if (this.state.eventListeners.has(key)) {
            const { element: oldEl, event: oldEvent, handler: oldHandler } = 
                this.state.eventListeners.get(key);
            oldEl?.removeEventListener(oldEvent, oldHandler);
        }
        
        // 新しいリスナーを登録
        element.addEventListener(event, handler);
        this.state.eventListeners.set(key, { element, event, handler });
    }

    // ギルド読み込みを修正
    async loadGuilds() {
        console.log('[Dashboard] Loading servers...');
        
        const serverListContainer = document.getElementById('server-list');
        if (!serverListContainer) {
            console.error("Element 'server-list' not found");
            return;
        }

        try {
            const response = await fetch('/api/servers', { 
                credentials: 'include' 
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[Dashboard] Servers loaded:', data.length);
            
            // 既存のリスナーをクリア
            serverListContainer.innerHTML = '';

            if (data.length === 0) {
                serverListContainer.innerHTML = 
                    '<li style="padding: 12px; color: #999;">参加しているサーバーがありません</li>';
                return;
            }

            // サーバーリストを表示
            data.forEach((server, index) => {
                const listItem = this.createServerListItem(server);
                serverListContainer.appendChild(listItem);
                
                // イベントリスナーを登録（キーで管理）
                this.addEventListener(
                    listItem,
                    'click',
                    () => this.selectServer(server.id),
                    `server-${server.id}`
                );
            });

            // 最初のサーバーを自動選択（初回のみ）
            if (data.length > 0 && !this.state.currentGuildId) {
                // 非同期でサーバーを選択
                setTimeout(() => this.selectServer(data[0].id), 0);
            }
            
        } catch (error) {
            console.error('[Dashboard] Failed to load servers:', error);
            serverListContainer.innerHTML = 
                '<li style="padding: 12px; color: #f44336;">サーバーの読み込みに失敗しました</li>';
        }
    }

    // サーバーリストアイテムを作成
    createServerListItem(server) {
        const listItem = document.createElement('li');
        listItem.className = 'server-item';
        listItem.dataset.serverId = server.id;

        const icon = document.createElement('img');
        icon.src = server.iconUrl || '/default-icon.svg';
        icon.alt = `${server.name} icon`;
        icon.classList.add('server-icon');
        
        icon.onerror = function() {
            const fallbackIcon = document.createElement('div');
            fallbackIcon.className = 'server-icon server-icon-fallback';
            fallbackIcon.textContent = server.name.charAt(0).toUpperCase();
            fallbackIcon.title = server.name;
            this.parentNode.replaceChild(fallbackIcon, this);
        };

        const serverInfo = document.createElement('div');
        serverInfo.className = 'server-info';

        const name = document.createElement('div');
        name.className = 'server-name';
        name.textContent = server.name;

        const status = document.createElement('div');
        status.className = 'server-status';
        status.innerHTML = `
            <span class="status-indicator"></span>
            <span>オンライン</span>
        `;

        serverInfo.appendChild(name);
        serverInfo.appendChild(status);
        listItem.appendChild(icon);
        listItem.appendChild(serverInfo);

        return listItem;
    }

    // サーバー設定読み込みを修正
    async loadServerSettings(serverId) {
        if (!serverId) {
            console.warn('[Dashboard] No serverId provided');
            return;
        }

        console.log(`[Dashboard] Loading settings for server: ${serverId}`);
        
        try {
            // 並行して設定を読み込み
            const [settingsRes, personalRes, dictionaryRes] = await Promise.allSettled([
                fetch(`/api/settings/${serverId}`, { credentials: 'include' }),
                fetch(`/api/personal-settings/${serverId}`, { credentials: 'include' }),
                fetch(`/api/dictionary/${serverId}`, { credentials: 'include' })
            ]);

            // 設定を適用
            if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
                const data = await settingsRes.value.json();
                if (data.settings) {
                    this.applySettings(data.settings);
                }
            }

            // 個人設定を適用
            if (personalRes.status === 'fulfilled' && personalRes.value.ok) {
                const data = await personalRes.value.json();
                if (data.settings) {
                    this.applyPersonalSettings(data.settings);
                }
            }

            // 辞書を適用
            if (dictionaryRes.status === 'fulfilled' && dictionaryRes.value.ok) {
                const data = await dictionaryRes.value.json();
                if (data.dictionary) {
                    localStorage.setItem('dictionary-entries', JSON.stringify(data.dictionary));
                    this.renderDictionaryEntries();
                }
            }

            // 話者とチャンネルを読み込み
            await this.populateSpeakersAndChannels(serverId);
            
            // UIを有効化
            this.enableServerSpecificUI();
            
            logger.success(`[Dashboard] Settings loaded for server: ${serverId}`);
            
        } catch (error) {
            console.error('[Dashboard] Failed to load server settings:', error);
            logger.error('サーバー設定の読み込みに失敗しました');
            this.showToast('設定の読み込みに失敗しました', 'error');
        }
    }

    // 定期更新を修正
    startGuildUpdates() {
        // 既存のインターバルをクリア
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        console.log('[Dashboard] Starting periodic guild updates (every 60s)');
        
        // 定期更新を開始（60秒ごと）
        this.updateInterval = setInterval(() => {
            if (this.state.isLoggedIn && !this.state.isLoadingGuild) {
                this.loadOverviewData(); // 統計情報のみ更新
            }
        }, 60000);
    }

    // クリーンアップ処理
    cleanup() {
        // インターバルをクリア
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // イベントリスナーをすべて削除
        this.state.eventListeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.state.eventListeners.clear();
        
        // デバウンスタイマーをクリア
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
        
        logger.info('[Dashboard] Cleanup complete');
    }

    // ダッシュボードを表示
    showDashboard() {
        const mainDashboard = document.getElementById('main-dashboard');
        if (mainDashboard) {
            mainDashboard.style.display = 'block';
            mainDashboard.classList.add('logged-in');
        } else {
            console.error("Element 'main-dashboard' not found. Unable to display dashboard.");
        }

        // カスタムログシステムを初期化
        logger.init();

        // ダッシュボードの初期化
        this.setupTabNavigation();
        this.loadOverviewData();
        this.setupEventListeners();
        // Do not load or show server-specific settings until a server is selected.
        // This keeps the UI clean and avoids showing per-server data from localStorage
        // before the user chooses a server.
        this.disableServerSpecificUI();
        // Note: loadAutoConnectSettings is global-ish and can remain.
        this.loadAutoConnectSettings();
        this.loadGuilds(); // ギルド情報を読み込む
        this.startGuildUpdates(); // 定期更新を開始
    }

    // Discordログインのセットアップ
    setupDiscordLogin() {
        const loginBtn = document.getElementById('discord-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                // サーバー側のルートへ（Freeをデフォルトに）
                window.location.href = '/auth/discord/free';
            });
        }
    }

    // フロントからのOAuth開始や設定取得は廃止（サーバーに委譲）

    // ログアウトのセットアップ
    setupLogout() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            // 既存のリスナーを削除してから新規登録（重複防止）
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
            
            newLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
            
            logger.info('[Dashboard] Logout button initialized');
        } else {
            console.warn('[Dashboard] Logout button element not found');
        }
    }

    // ログアウト処理
    logout() {
        logger.info('[Dashboard] Logging out...');
        
        // ローカルデータをクリア
        try {
            localStorage.removeItem('bot-settings');
            localStorage.removeItem('personal-settings');
            localStorage.removeItem('dictionary-entries');
            localStorage.removeItem('auto-connect-settings');
            logger.info('[Dashboard] Local storage cleared');
        } catch (error) {
            console.error('[Dashboard] Failed to clear local storage:', error);
        }
        
        // クリーンアップ処理を実行
        this.cleanup();
        
        // サーバーセッションを破棄してリダイレクト
        window.location.href = '/logout';
    }

    // プレミアムステータスを確認
    async checkPremiumStatus() {
        try {
            // プレミアムステータスを確認するAPIを呼び出し
            const response = await fetch('/api/premium-status', { credentials: 'include' });

            if (response.ok) {
                const premiumData = await response.json();
                this.handlePremiumStatus(premiumData);
            } else {
                console.warn('Failed to check premium status');
                this.showPremiumTab(false);
            }
        } catch (error) {
            console.error('Error checking premium status:', error);
            this.showPremiumTab(false);
        }
    }

    // プレミアムステータスを処理
    handlePremiumStatus(premiumData) {
        const isPremium = premiumData.isPremium || false;
        this.showPremiumTab(isPremium);

        if (isPremium) {
            this.updatePremiumBadge(premiumData);
            this.loadPremiumSettings();
            this.loadPremiumStats();
        }
    }

    // プレミアムタブの表示/非表示
    showPremiumTab(show) {
        const premiumTab = document.getElementById('premium-tab');
        if (premiumTab) {
            premiumTab.style.display = show ? 'inline-block' : 'none';
        }
    }

    // プレミアムバッジを更新
    updatePremiumBadge(premiumData) {
        const badge = document.getElementById('premium-badge');
        const details = document.getElementById('premium-details');

        if (premiumData.isPremium) {
            badge.textContent = 'プレミアム会員';
            badge.className = 'premium-badge active';

            const expiryDate = new Date(premiumData.expiryDate).toLocaleDateString('ja-JP');
            details.innerHTML = `
                <p><strong>会員種別:</strong> ${premiumData.tier || 'スタンダード'}</p>
                <p><strong>有効期限:</strong> ${expiryDate}</p>
                <p><strong>特典:</strong> 高度なTTS設定、優先処理、カスタム辞書、詳細統計</p>
            `;
        } else {
            badge.textContent = '無料会員';
            badge.className = 'premium-badge inactive';
            details.innerHTML = `
                <p>プレミアム機能を利用するには、プレミアム会員登録が必要です。</p>
                <p><a href="/premium" target="_blank">プレミアム登録はこちら</a></p>
            `;
        }
    }

    // プレミアム設定を読み込む
    async loadPremiumSettings() {
        try {
            const response = await fetch('/api/premium-settings');
            if (response.ok) {
                const settings = await response.json();
                this.applyPremiumSettings(settings);
            }
        } catch (error) {
            console.error('Failed to load premium settings:', error);
        }
    }

    // プレミアム設定を適用
    applyPremiumSettings(settings) {
        const checkboxes = [
            'premium-tts-enabled',
            'premium-priority-enabled',
            'premium-dict-enabled',
            'premium-analytics-enabled',
            'premium-backup-enabled',
            'premium-support-enabled'
        ];

        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            const settingKey = id.replace('premium-', '').replace('-enabled', '');
            if (checkbox && settings[settingKey] !== undefined) {
                checkbox.checked = settings[settingKey];
            }
        });
    }

    // プレミアム統計を読み込む
    async loadPremiumStats() {
        try {
            const response = await fetch('/api/premium-stats');
            if (response.ok) {
                const stats = await response.json();
                this.updatePremiumStats(stats);
            }
        } catch (error) {
            console.error('Failed to load premium stats:', error);
        }
    }

    // プレミアム統計を更新
    updatePremiumStats(stats) {
        document.getElementById('premium-usage-time').textContent = `${stats.usageTime || 0}時間`;
        document.getElementById('premium-messages-processed').textContent = stats.messagesProcessed || 0;
        document.getElementById('premium-response-time').textContent = `${stats.responseTime || 0}ms`;
        document.getElementById('premium-utilization').textContent = `${stats.utilization || 0}%`;
    }

    // プレミアム設定を保存
    async savePremiumSettings() {
        const settings = {
            tts: document.getElementById('premium-tts-enabled').checked,
            priority: document.getElementById('premium-priority-enabled').checked,
            dict: document.getElementById('premium-dict-enabled').checked,
            analytics: document.getElementById('premium-analytics-enabled').checked,
            backup: document.getElementById('premium-backup-enabled').checked,
            support: document.getElementById('premium-support-enabled').checked
        };

        try {
            const response = await fetch('/api/premium-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                    this.showSuccessToast('プレミアム設定を保存しました。');
            } else {
                    this.showErrorToast('設定の保存に失敗しました。');
            }
        } catch (error) {
            console.error('Failed to save premium settings:', error);
            this.showErrorToast('設定の保存中にエラーが発生しました。');
        }
    }

    // 共通のギルドをフィルタリング
    filterCommonGuilds(userGuilds, botGuilds) {
        const botGuildIds = new Set(botGuilds.map(guild => guild.id));

        return userGuilds
            .filter(guild => botGuildIds.has(guild.id))
            .map(guild => ({
                ...guild,
                botInfo: botGuilds.find(bg => bg.id === guild.id)
            }));
    }

    // ギルドリストを表示
    renderGuilds(guilds) {
        const container = document.getElementById('guilds-list');

        if (guilds.length === 0) {
            container.innerHTML = '<div class="no-guilds">Botが参加しているギルドが見つかりません</div>';
            return;
        }

        container.innerHTML = '';

        guilds.forEach(guild => {
            const guildElement = this.createGuildElement(guild);
            container.appendChild(guildElement);
        });
    }

    // ギルド要素を作成
    createGuildElement(guild) {
        const guildDiv = document.createElement('div');
        guildDiv.className = 'guild-item';

        const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;

        const memberCount = guild.approximate_member_count || '不明';
        const botInfo = guild.botInfo || {};

        guildDiv.innerHTML = `
            <div class="guild-icon">
                ${iconUrl
                    ? `<img src="${iconUrl}" alt="${guild.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
                    : `<span>${guild.name.charAt(0).toUpperCase()}</span>`
                }
            </div>
            <div class="guild-info">
                <div class="guild-name">${guild.name}</div>
                <div class="guild-details">
                    メンバー: ${memberCount}
                    ${guild.owner ? '<span class="guild-owner">オーナー</span>' : ''}
                    ${botInfo.online ? '<span style="color: #28a745;">● Botオンライン</span>' : '<span style="color: #dc3545;">● Botオフライン</span>'}
                </div>
            </div>
        `;

        return guildDiv;
    }

    // エラーメッセージを表示
    showGuildsError(message) {
        const container = document.getElementById('guilds-list');
        container.innerHTML = `<div class="no-guilds">${message}</div>`;
    }

    // OAuth2コールバック処理やコード交換はサーバー側に移行済みのため不要

    setupTabNavigation() {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });
    }

    switchTab(tabId) {
        // タブのアクティブ状態を更新
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        // コンテンツの表示を切り替え
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');

        this.currentTab = tabId;
    }

    async loadOverviewData() {
        try {
            const response = await fetch('/api/bot-stats');
            const data = await response.json();

            document.getElementById('total-servers').textContent = data.total_bots || 0;
            document.getElementById('total-users').textContent = 
    data.total_bots ? Math.floor(Math.random() * 10000) + 1000 : 0; // ランダム値
            document.getElementById('online-bots').textContent = data.online_bots || 0;
            document.getElementById('vc-connections').textContent = data.total_bots ? Math.floor(Math.random() * 500) + 50 : 0; // 仮のデータ

            this.renderBotStatus(data.bots || []);
        } catch (error) {
            console.error('Failed to load overview data:', error);
        }
    }

    renderBotStatus(bots) {
        const container = document.getElementById('bot-status-list');
        container.innerHTML = '';

        const botNames = ['1st', '2nd', '3rd', '4th', '5th', '6th', 'Pro/Premium'];

        bots.forEach((bot, index) => {
            const botItem = document.createElement('div');
            botItem.className = `bot-item ${bot.success ? 'online' : 'offline'}`;

            botItem.innerHTML = `
                <div class="bot-name">Aivis-chan Bot ${botNames[index] || 'Unknown'}</div>
                <div class="bot-status ${bot.success ? 'online' : 'offline'}">
                    ${bot.success ? 'オンライン' : 'オフライン'}
                </div>
            `;

            container.appendChild(botItem);
        });
    }

    setupEventListeners() {
        // 辞書機能
        const addDictButton = document.getElementById('add-dictionary-entry');
        if (addDictButton) {
            addDictButton.addEventListener('click', () => {
                this.addDictionaryEntry();
            });
        }

        // 設定保存
        const saveSettingsButton = document.getElementById('save-settings');
        if (saveSettingsButton) {
            saveSettingsButton.addEventListener('click', () => {
                this.saveSettings();
            });
        }

        // 個人設定保存
        const savePersonalButton = document.getElementById('save-personal');
        if (savePersonalButton) {
            savePersonalButton.addEventListener('click', () => {
                this.savePersonalSettings();
            });
        }

        // 辞書設定保存
        const saveDictionaryButton = document.getElementById('save-dictionary');
        if (saveDictionaryButton) {
            saveDictionaryButton.addEventListener('click', () => {
                this.saveDictionarySettings();
            });
        }

        // 自動接続設定保存（存在しない場合はスキップ）
        const saveAutoConnectButton = document.getElementById('save-auto-connect');
        if (saveAutoConnectButton) {
            saveAutoConnectButton.addEventListener('click', () => {
                this.saveAutoConnectSettings();
            });
        }

        // プレミアム設定保存
        const premiumSaveBtn = document.getElementById('save-premium-settings');
        if (premiumSaveBtn) {
            premiumSaveBtn.addEventListener('click', () => {
                this.savePremiumSettings();
            });
        }

        // スライダーの値表示
        this.setupSliderValues();
    }

    // Disable inputs/buttons/areas that are specific to a selected server
    // until the user explicitly selects a server. This prevents showing
    // settings/dictionary/personal settings content prematurely.
    disableServerSpecificUI() {
        // IDs referenced across settings/personal/dictionary handlers
        const ids = [
            // settings
            'default-speaker','default-speed','default-pitch','default-tempo','default-volume','default-intonation',
            'auto-join-voice','auto-join-text','temp-voice','auto-leave','ignore-bots','max-queue','save-settings',
            // personal
            'personal-speaker','personal-speed','personal-pitch','personal-tempo','personal-volume','personal-intonation',
            'notify-joined','notify-left','notify-error','log-messages','public-stats','save-personal',
            // dictionary
            'dictionary-entries','new-word','new-pronunciation','new-accent','new-word-type','add-dictionary-entry','save-dictionary'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            try {
                if ('disabled' in el) el.disabled = true;
                // For container elements (like ul for dictionary entries) hide contents
                if (el.tagName === 'UL' || el.tagName === 'DIV' || el.tagName === 'SECTION') {
                    // show a placeholder message
                    const placeholderId = `${id}-placeholder`;
                    // avoid duplicating placeholders
                    if (!document.getElementById(placeholderId)) {
                        const ph = document.createElement('div');
                        ph.id = placeholderId;
                        ph.className = 'server-placeholder';
                        ph.textContent = 'サーバーを選択してください';
                        ph.style.color = '#666';
                        ph.style.padding = '8px 10px';
                        ph.style.fontStyle = 'italic';
                        el.style.display = 'none';
                        el.parentNode && el.parentNode.insertBefore(ph, el);
                    }
                }
            } catch (e) {
                // ignore
            }
        });
    }

    // Re-enable server-specific UI after a server has been selected and
    // settings/dictionary/personal settings have been (attempted) loaded.
    enableServerSpecificUI() {
        const ids = [
            'default-speaker','default-speed','default-pitch','default-tempo','default-volume','default-intonation',
            'auto-join-voice','auto-join-text','temp-voice','auto-leave','ignore-bots','max-queue','save-settings',
            'personal-speaker','personal-speed','personal-pitch','personal-tempo','personal-volume','personal-intonation',
            'notify-joined','notify-left','notify-error','log-messages','public-stats','save-personal',
            'dictionary-entries','new-word','new-pronunciation','new-accent','new-word-type','add-dictionary-entry','save-dictionary'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            try {
                if ('disabled' in el) el.disabled = false;
                if (el.tagName === 'UL' || el.tagName === 'DIV' || el.tagName === 'SECTION') {
                    const placeholder = document.getElementById(`${id}-placeholder`);
                    if (placeholder) placeholder.parentNode.removeChild(placeholder);
                    el.style.display = '';
                }
            } catch (e) {
                // ignore
            }
        });
    }

    setupSliderValues() {
        const sliders = [
            { id: 'default-speed', valueId: 'speed-value' },
            { id: 'default-pitch', valueId: 'pitch-value' },
            { id: 'default-tempo', valueId: 'tempo-value' },
            { id: 'default-volume', valueId: 'volume-value' },
            { id: 'default-intonation', valueId: 'intonation-value' },
            { id: 'personal-speed', valueId: 'personal-speed-value' },
            { id: 'personal-pitch', valueId: 'personal-pitch-value' },
            { id: 'personal-tempo', valueId: 'personal-tempo-value' },
            { id: 'personal-volume', valueId: 'personal-volume-value' },
            { id: 'personal-intonation', valueId: 'personal-intonation-value' }
        ];

        sliders.forEach(({ id, valueId }) => {
            const slider = document.getElementById(id);
            const valueDisplay = document.getElementById(valueId);

            if (slider && valueDisplay) {
                slider.addEventListener('input', () => {
                    valueDisplay.textContent = slider.value;
                });
            }
        });
    }

    async addDictionaryEntry() {
        const word = document.getElementById('new-word').value.trim();
        const pronunciation = document.getElementById('new-pronunciation').value.trim();
        const accent = document.getElementById('new-accent').value.trim();
        const wordType = document.getElementById('new-word-type').value;

        if (!word || !pronunciation) {
            this.showToast('単語と発音を入力してください。', 'warn');
            return;
        }

        try {
            // 辞書エントリを保存（実際のAPIがないのでローカルストレージを使用）
            const entries = this.getDictionaryEntries();
            const newEntry = { 
                word, 
                pronunciation, 
                accent: accent || null,
                wordType: wordType || null,
                id: Date.now() 
            };
            entries.push(newEntry);
            localStorage.setItem('dictionary-entries', JSON.stringify(entries));

            // フォームをクリア
            document.getElementById('new-word').value = '';
            document.getElementById('new-pronunciation').value = '';
            document.getElementById('new-accent').value = '';
            document.getElementById('new-word-type').value = '';
            
            this.renderDictionaryEntries();
            
            logger.success(`辞書エントリが追加されました: ${word} → ${pronunciation}`);
            this.showSuccessToast('辞書エントリが追加されました。');
        } catch (error) {
            console.error('Failed to add dictionary entry:', error);
            logger.error('辞書エントリーの追加に失敗しました');
            this.showErrorToast('辞書エントリの追加に失敗しました。');
        }
    }

    getDictionaryEntries() {
        try {
            return JSON.parse(localStorage.getItem('dictionary-entries') || '[]');
        } catch {
            return [];
        }
    }

    renderDictionaryEntries() {
        const entries = this.getDictionaryEntries();
        const container = document.getElementById('dictionary-entries');
        container.innerHTML = '';

        if (entries.length === 0) {
            container.innerHTML = '<li style="color: #666; padding: 10px;">辞書エントリーがありません</li>';
            return;
        }

        entries.forEach(entry => {
            const listItem = document.createElement('li');
            listItem.className = 'dictionary-entry';

            // 品詞の日本語表示
            const wordTypeText = {
                'PROPER_NOUN': '固有名詞',
                'COMMON_NOUN': '普通名詞',
                'VERB': '動詞',
                'ADJECTIVE': '形容詞',
                'ADVERB': '副詞'
            }[entry.wordType] || '';

            // エントリーの詳細情報を構築
            let details = `<span class="reading">${entry.pronunciation}</span>`;
            if (entry.accent) {
                details += ` <span class="accent">[${entry.accent}]</span>`;
            }
            if (wordTypeText) {
                details += ` <span class="word-type">(${wordTypeText})</span>`;
            }

            listItem.innerHTML = `
                <div class="entry-info">
                    <span class="word">${entry.word}</span> - ${details}
                </div>
                <button onclick="dashboard.deleteDictionaryEntry(${entry.id})">削除</button>
            `;

            container.appendChild(listItem);
        });
    }

    deleteDictionaryEntry(id) {
        const entries = this.getDictionaryEntries().filter(entry => entry.id !== id);
        localStorage.setItem('dictionary-entries', JSON.stringify(entries));
        this.renderDictionaryEntries();
    }

    loadDictionary() {
        this.renderDictionaryEntries();
    }

    // ローディング状態を管理する関数
    setButtonLoading(buttonId, isLoading, message = null) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        const textSpan = button.querySelector('.button-text');
        const spinnerSpan = button.querySelector('.loading-spinner');
        
        if (isLoading) {
            button.disabled = true;
            button.classList.add('loading-button');
            if (textSpan) textSpan.style.display = 'none';
            if (spinnerSpan) {
                spinnerSpan.style.display = 'inline-flex';
                if (message) {
                    spinnerSpan.textContent = `⏳ ${message}...`;
                }
            }
        } else {
            button.disabled = false;
            button.classList.remove('loading-button');
            if (textSpan) textSpan.style.display = 'inline';
            if (spinnerSpan) spinnerSpan.style.display = 'none';
        }
    }

    // 成功状態を表示する新しいメソッド
    showButtonSuccess(buttonId, message = '完了', duration = 2000) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        const textSpan = button.querySelector('.button-text');
        const originalText = textSpan ? textSpan.textContent : '';
        
        // 成功状態を表示
        button.classList.add('success-animation');
        if (textSpan) textSpan.textContent = `✅ ${message}`;
        
        // 一定時間後に元に戻す
        setTimeout(() => {
            button.classList.remove('success-animation');
            if (textSpan) textSpan.textContent = originalText;
        }, duration);
    }

    // エラー状態を表示する新しいメソッド
    showButtonError(buttonId, message = 'エラー', duration = 3000) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        const textSpan = button.querySelector('.button-text');
        const originalText = textSpan ? textSpan.textContent : '';
        
        // エラー状態を表示
        button.classList.add('error-animation');
        if (textSpan) textSpan.textContent = `❌ ${message}`;
        
        // 一定時間後に元に戻す
        setTimeout(() => {
            button.classList.remove('error-animation');
            if (textSpan) textSpan.textContent = originalText;
        }, duration);
    }

    // 汎用トースト通知 (alert の代替)
    showToast(message, type = 'info', duration = 3500) {
        try {
            // トーストコンテナを作成
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.style.position = 'fixed';
                container.style.right = '20px';
                container.style.top = '20px';
                container.style.zIndex = 10000;
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '8px';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            toast.style.minWidth = '200px';
            toast.style.padding = '10px 14px';
            toast.style.borderRadius = '6px';
            toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            toast.style.color = '#fff';
            toast.style.fontSize = '14px';
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 200ms ease, transform 200ms ease';

            // 色分け
            if (type === 'success') {
                toast.style.background = '#28a745';
            } else if (type === 'error') {
                toast.style.background = '#d9534f';
            } else if (type === 'warn' || type === 'warning') {
                toast.style.background = '#ff9800';
            } else {
                toast.style.background = '#333';
            }

            container.appendChild(toast);

            // 表示アニメーション
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            // 自動消去
            const timeout = setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 220);
            }, duration);

            // クリックで即時閉じる
            toast.addEventListener('click', () => {
                clearTimeout(timeout);
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 160);
            });
        } catch (e) {
            console.error('showToast error', e);
        }
    }

    showSuccessToast(message, duration = 3000) { this.showToast(message, 'success', duration); }
    showErrorToast(message, duration = 4000) { this.showToast(message, 'error', duration); }
    showInfoToast(message, duration = 3000) { this.showToast(message, 'info', duration); }

    async saveSettings() {
        this.setButtonLoading('save-settings', true, '音声設定を保存中');
        
        const settings = {
            defaultSpeaker: document.getElementById('default-speaker').value,
            defaultSpeed: parseFloat(document.getElementById('default-speed').value),
            defaultPitch: parseFloat(document.getElementById('default-pitch').value),
            defaultTempo: parseFloat(document.getElementById('default-tempo').value),
            defaultVolume: parseFloat(document.getElementById('default-volume').value),
            defaultIntonation: parseFloat(document.getElementById('default-intonation').value),
            autoJoinVoice: document.getElementById('auto-join-voice').value,
            autoJoinText: document.getElementById('auto-join-text').value,
            tempVoice: document.getElementById('temp-voice').checked,
            autoLeave: document.getElementById('auto-leave').checked,
            ignoreBots: document.getElementById('ignore-bots').checked
        };

        try {
            // ローカルストレージに保存（バックアップ用）
            localStorage.setItem('bot-settings', JSON.stringify(settings));

            // サーバーに保存（現在選択されているギルドID）
            const guildId = this.getCurrentGuildId();
            if (guildId) {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        guildId: guildId,
                        settings: settings
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Settings saved to server:', result);
                    logger.success('音声設定が正常に保存されました');
                    this.showButtonSuccess('save-settings', '保存完了');
                } else {
                    console.error('Failed to save settings to server:', response.statusText);
                    logger.error(`設定保存に失敗しました: ${response.statusText}`);
                    this.showButtonError('save-settings', '保存失敗');
                }
            } else {
                this.showButtonSuccess('save-settings', '保存完了');
            }

            this.showSuccessToast('設定を保存しました。');
        } catch (error) {
            console.error('Failed to save settings:', error);
            logger.error('設定保存中にエラーが発生しました');
            this.showButtonError('save-settings', 'エラー発生');
            this.showErrorToast('設定の保存中にエラーが発生しました。');
        } finally {
            this.setButtonLoading('save-settings', false);
        }
    }

    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('bot-settings') || '{}');

            if (settings.defaultSpeaker) document.getElementById('default-speaker').value = settings.defaultSpeaker;
            if (settings.defaultSpeed) {
                document.getElementById('default-speed').value = settings.defaultSpeed;
                document.getElementById('speed-value').textContent = settings.defaultSpeed;
            }
            if (settings.defaultPitch) {
                document.getElementById('default-pitch').value = settings.defaultPitch;
                document.getElementById('pitch-value').textContent = settings.defaultPitch;
            }
            if (settings.autoLeave) document.getElementById('auto-leave').value = settings.autoLeave;
            if (settings.maxQueue) document.getElementById('max-queue').value = settings.maxQueue;
            if (settings.ignoreBots !== undefined) document.getElementById('ignore-bots').checked = settings.ignoreBots;
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async savePersonalSettings() {
        // ローディング状態を開始
        this.setButtonLoading('save-personal', true, '個人設定を保存中');

        const settings = {
            personalSpeaker: document.getElementById('personal-speaker').value,
            personalSpeed: parseFloat(document.getElementById('personal-speed').value),
            personalPitch: parseFloat(document.getElementById('personal-pitch').value),
            personalTempo: parseFloat(document.getElementById('personal-tempo').value),
            personalVolume: parseFloat(document.getElementById('personal-volume').value),
            personalIntonation: parseFloat(document.getElementById('personal-intonation').value)
        };

        try {
            // ローカルストレージに保存（バックアップ用）
            localStorage.setItem('personal-settings', JSON.stringify(settings));

            // サーバーに保存（現在選択されているギルドID）
            const guildId = this.getCurrentGuildId();
            if (guildId) {
                const response = await fetch('/api/personal-settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        guildId: guildId,
                        settings: settings
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Personal settings saved to server:', result);
                    logger.success('個人設定が正常に保存されました');
                    this.showButtonSuccess('save-personal', '保存完了');
                } else {
                    console.error('Failed to save personal settings to server:', response.statusText);
                    logger.error(`個人設定保存に失敗しました: ${response.statusText}`);
                    this.showButtonError('save-personal', '保存失敗');
                }
            } else {
                this.showButtonSuccess('save-personal', '保存完了');
            }

            this.showSuccessToast('個人設定を保存しました。');
        } catch (error) {
            console.error('Failed to save personal settings:', error);
            logger.error('個人設定保存中にエラーが発生しました');
            this.showButtonError('save-personal', 'エラー発生');
            this.showErrorToast('個人設定の保存中にエラーが発生しました。');
        } finally {
            // ローディング状態を終了
            this.setButtonLoading('save-personal', false);
        }
    }

    loadPersonalSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('personal-settings') || '{}');

            if (settings.personalSpeaker) document.getElementById('personal-speaker').value = settings.personalSpeaker;
            if (settings.personalSpeed) {
                document.getElementById('personal-speed').value = settings.personalSpeed;
                document.getElementById('personal-speed-value').textContent = settings.personalSpeed;
            }
            if (settings.personalPitch) {
                document.getElementById('personal-pitch').value = settings.personalPitch;
                document.getElementById('personal-pitch-value').textContent = settings.personalPitch;
            }
            if (settings.notifyJoined !== undefined) document.getElementById('notify-joined').checked = settings.notifyJoined;
            if (settings.notifyLeft !== undefined) document.getElementById('notify-left').checked = settings.notifyLeft;
            if (settings.notifyError !== undefined) document.getElementById('notify-error').checked = settings.notifyError;
            if (settings.logMessages !== undefined) document.getElementById('log-messages').checked = settings.logMessages;
            if (settings.publicStats !== undefined) document.getElementById('public-stats').checked = settings.publicStats;
        } catch (error) {
            console.error('Failed to load personal settings:', error);
        }
    }

    async saveDictionarySettings() {
        this.setButtonLoading('save-dictionary', true, '辞書設定を保存中');
        
        try {
            // 現在の辞書エントリーを取得
            const entries = this.getDictionaryEntries();
            
            // ローカルストレージに保存（バックアップ用）
            localStorage.setItem('dictionary-entries', JSON.stringify(entries));

            // サーバーに保存（現在選択されているギルドID）
            const guildId = this.getCurrentGuildId();
            if (guildId) {
                const response = await fetch('/api/dictionary', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        guildId: guildId,
                        dictionary: entries
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Dictionary saved to server:', result);
                    logger.success('辞書設定が正常に保存されました');
                    this.showButtonSuccess('save-dictionary', '保存完了');
                } else {
                    console.error('Failed to save dictionary to server:', response.statusText);
                    logger.error(`辞書設定保存に失敗しました: ${response.statusText}`);
                    this.showButtonError('save-dictionary', '保存失敗');
                }
            } else {
                this.showButtonSuccess('save-dictionary', '保存完了');
            }

            this.showSuccessToast('辞書設定を保存しました。');
        } catch (error) {
            console.error('Failed to save dictionary settings:', error);
            logger.error('辞書設定保存中にエラーが発生しました');
            this.showButtonError('save-dictionary', 'エラー発生');
            this.showErrorToast('辞書設定の保存に失敗しました。');
        } finally {
            this.setButtonLoading('save-dictionary', false);
        }
    }

    async saveAutoConnectSettings() {
        const settings = {
            enabled: document.getElementById('auto-connect-enabled').checked,
            channel: document.getElementById('auto-connect-channel').value,
            delay: document.getElementById('auto-connect-delay').value
        };

        try {
            localStorage.setItem('auto-connect-settings', JSON.stringify(settings));
            this.showSuccessToast('自動接続設定を保存しました。');
        } catch (error) {
            console.error('Failed to save auto-connect settings:', error);
        }
    }

    loadAutoConnectSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('auto-connect-settings') || '{}');

            if (settings.enabled !== undefined) document.getElementById('auto-connect-enabled').checked = settings.enabled;
            if (settings.channel) document.getElementById('auto-connect-channel').value = settings.channel;
            if (settings.delay) document.getElementById('auto-connect-delay').value = settings.delay;
        } catch (error) {
            console.error('Failed to load auto-connect settings:', error);
        }
    }

    async loadUserInfo() {
        try {
            const displayEl = document.getElementById('user-display');
            const avatarEl = document.getElementById('user-avatar');
            const logoutBtn = document.getElementById('logout-btn');
            const loginBtn = document.getElementById('discord-login-btn');

            if (!displayEl) return;

            if (this.state.isLoggedIn && this.state.user) {
                // Determine a friendly display name
                const name = this.state.user.displayName || this.state.user.username || this.state.user.name || this.state.user.tag || 'ユーザー';
                displayEl.textContent = name;

                // Avatar handling (support common shapes)
                if (avatarEl) {
                    let avatarSrc = '';
                    if (this.state.user.avatarUrl) avatarSrc = this.state.user.avatarUrl;
                    else if (this.state.user.avatar && this.state.user.id) avatarSrc = `https://cdn.discordapp.com/avatars/${this.state.user.id}/${this.state.user.avatar}.png?size=128`;
                    else if (this.state.user.avatarPath) avatarSrc = this.state.user.avatarPath;

                    if (avatarSrc) {
                        avatarEl.src = avatarSrc;
                        avatarEl.style.display = '';
                        avatarEl.alt = `${name} avatar`;
                    } else {
                        avatarEl.style.display = 'none';
                    }
                }

                if (logoutBtn) logoutBtn.style.display = '';
                if (loginBtn) loginBtn.style.display = 'none';

                logger.info(`User info loaded: ${name}`);
            } else {
                // Not logged in
                displayEl.textContent = '未ログイン';
                if (avatarEl) {
                    avatarEl.style.display = 'none';
                    avatarEl.src = '';
                }
                if (logoutBtn) logoutBtn.style.display = 'none';
                if (loginBtn) loginBtn.style.display = '';

                logger.info('User not authenticated (UI updated)');
            }
        } catch (e) {
            console.error('Error updating user UI:', e);
        }
    }

    // ギルド情報を読み込む
    loadGuilds() {
        console.log('Loading server information...');
        const serverListContainer = document.getElementById('server-list');
        if (!serverListContainer) {
            console.error("Element 'server-list' not found. Unable to display servers.");
            return;
        }

        fetch('/api/servers')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Servers loaded:', data);
                serverListContainer.innerHTML = '';

                data.forEach(server => {
                    const listItem = document.createElement('li');
                    listItem.className = 'server-item';
                    listItem.setAttribute('data-server-id', server.id);

                    const icon = document.createElement('img');
                    icon.src = server.iconUrl || '/default-icon.svg';
                    icon.alt = `${server.name} icon`;
                    icon.classList.add('server-icon');
                    
                    // アイコンの読み込みエラー時のフォールバック
                    icon.onerror = function() {
                        // SVGアイコンの代わりにテキストベースのアイコンを使用
                        const fallbackIcon = document.createElement('div');
                        fallbackIcon.className = 'server-icon server-icon-fallback';
                        fallbackIcon.textContent = server.name.charAt(0).toUpperCase();
                        fallbackIcon.title = server.name;
                        this.parentNode.replaceChild(fallbackIcon, this);
                    };

                    const serverInfo = document.createElement('div');
                    serverInfo.className = 'server-info';

                    const name = document.createElement('div');
                    name.className = 'server-name';
                    name.textContent = server.name;

                    const status = document.createElement('div');
                    status.className = 'server-status';
                    const statusIndicator = document.createElement('span');
                    statusIndicator.className = 'status-indicator';
                    const statusText = document.createElement('span');
                    statusText.textContent = 'オンライン';
                    status.appendChild(statusIndicator);
                    status.appendChild(statusText);

                    serverInfo.appendChild(name);
                    serverInfo.appendChild(status);

                    listItem.appendChild(icon);
                    listItem.appendChild(serverInfo);
                    serverListContainer.appendChild(listItem);

                    // クリックイベントを追加
                    listItem.addEventListener('click', () => {
                        this.selectServer(server.id);
                    }); // イベントリスナーが削除されない
                });
                // 自動で最初のサーバーを選択して設定を読み込む
                if (data.length > 0) {
                    const firstId = data[0].id;
                    // defer によって DOM が安定してから選択処理を行う
                    setTimeout(() => this.selectServer(firstId), 0);
                }
            })
            .catch(error => {
                console.error('Failed to load servers:', error);
                serverListContainer.innerHTML = '<li style="padding: 12px; color: #f44336;">サーバーの読み込みに失敗しました</li>';
            });
    }

    // サーバー選択処理
    selectServer(serverId, serverName) {
        console.log(`Selected server: ${serverName} (${serverId})`);
        
        // 現在の選択を解除
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('selected');
        });

        // 新しい選択を設定
        const selectedItem = document.querySelector(`[data-server-id="${serverId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // ここで選択されたサーバーの設定画面を表示する処理を追加
        this.loadServerSettings(serverId, serverName);
    }

    // 現在選択されているサーバーのIDを取得
    getCurrentGuildId() {
        const selectedServer = document.querySelector('.server-item.selected');
        if (selectedServer) {
            return selectedServer.getAttribute('data-server-id');
        }
        
        // デフォルトで最初のサーバーを選択
        const firstServer = document.querySelector('.server-item');
        if (firstServer) {
            firstServer.classList.add('selected');
            return firstServer.getAttribute('data-server-id');
        }
        
        return null;
    }

    // サーバーを選択
    selectServer(serverId) {
        // 既存の選択を解除
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 新しいサーバーを選択
        const serverElement = document.querySelector(`[data-server-id="${serverId}"]`);
        if (serverElement) {
            serverElement.classList.add('selected');
            this.loadServerSettings(serverId);
        }
    }

    // サーバー設定読み込み
    async loadServerSettings(serverId) {
        if (!serverId) return;

        // Reentrancy guard: prevent infinite recursion if this function is triggered
        // again while already loading the same server.
        if (!this._loadingServerState) this._loadingServerState = { active: false, id: null };
        if (this._loadingServerState.active && this._loadingServerState.id === serverId) {
            console.warn(`Re-entrant call detected — skipping`);
            return; // ガードはあるが、複数の箇所から呼ばれる可能性
        }

        this._loadingServerState.active = true;
        this._loadingServerState.id = serverId;

        console.log(`Loading settings for server: ${serverId}`);
        
        try {
            // サーバー設定を読み込み
            const settingsResponse = await fetch(`/api/settings/${serverId}`);
            if (settingsResponse.ok) {
                const settingsData = await settingsResponse.json();
                if (settingsData.settings) {
                    this.applySettings(settingsData.settings);
                }
            }

            // 個人設定を読み込み
            const personalResponse = await fetch(`/api/personal-settings/${serverId}`);
            if (personalResponse.ok) {
                const personalData = await personalResponse.json();
                if (personalData.settings) {
                    this.applyPersonalSettings(personalData.settings);
                }
            }

            // 辞書を読み込み
            const dictionaryResponse = await fetch(`/api/dictionary/${serverId}`);
            if (dictionaryResponse.ok) {
                const dictionaryData = await dictionaryResponse.json();
                if (dictionaryData.dictionary) {
                    localStorage.setItem('dictionary-entries', JSON.stringify(dictionaryData.dictionary));
                    this.renderDictionaryEntries();
                }
            }
            // サーバー関連の補助データ（話者リストやチャンネル）を読み込み/反映
            try {
                await this.populateSpeakersAndChannels(serverId);
                // Enable server-specific UI after attempting to populate speakers/channels
                // so that settings, personal settings and dictionary become interactive.
                this.enableServerSpecificUI();
            } catch (e) {
                console.warn('populateSpeakersAndChannels failed', e);
            }
        } catch (error) {
            console.error('Failed to load server settings:', error);
        } finally {
            // clear guard
            if (this._loadingServerState) {
                this._loadingServerState.active = false;
                this._loadingServerState.id = null;
            }
        }
    }

    // 話者候補やチャンネル候補を取得して select に反映する
    async populateSpeakersAndChannels(guildId) {
        console.log(`populateSpeakersAndChannels called for guildId=${guildId}`);
        // 1) 話者一覧を取得（まずはギルド/ボット固有のエンドポイントを試行し、フォールバックで一般的なエンドポイントへ）
        const speakerSelectIds = ['default-speaker', 'personal-speaker'];
        let speakers = [];

        // 保存されている選択値を保持
        const previousValues = {};
        speakerSelectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) previousValues[id] = el.value;
        });

        // UI に読み込みプレースホルダを表示
        speakerSelectIds.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '読み込み中...';
            sel.appendChild(opt);
            sel.disabled = true;
        });

        // Avoid Mixed Content: if the page is served over HTTPS, do not attempt
        // to fetch insecure http:// cluster addresses from the browser.
        const isSecure = window.location.protocol === 'https:';
        const insecureDirectUrls = [
            'http://localhost:10101/speakers',
            'http://aivisspeech-engine:10101/speakers',
            'http://aivisspeech-engine.aivis-chan-bot.svc.cluster.local:10101/speakers'
        ];

        if (isSecure) {
            console.log('HTTPS page: skipping direct http:// engine endpoints to avoid mixed-content blocking');
        }

        const tryUrls = [
            `/api/guilds/${guildId}/speakers`,
            `/api/bots/${guildId}/speakers`,
            '/api/tts/speakers', // server-side proxy preferred
            '/speakers'         // may be blocked by CORS or mixed-content
        ].concat(isSecure ? [] : insecureDirectUrls);

        for (const url of tryUrls) {
            try {
                console.log(`Trying speaker URL: ${url}`);
                const resp = await fetch(url, { credentials: 'include' });
                if (resp) console.log(`Response status for ${url}:`, resp.status);
                if (resp && resp.ok) {
                    let body;
                    try {
                        body = await resp.json();
                    } catch (e) {
                        console.log(`Failed to parse JSON from ${url}:`, e && e.message ? e.message : e);
                        body = null;
                    }

                    // Normalize several possible response shapes:
                    //  - Array of strings or objects => use directly
                    //  - { speakers: [...] } => use body.speakers
                    //  - Object map { id: name, ... } => convert to array
                    let candidate = [];
                    if (Array.isArray(body) && body.length > 0) {
                        candidate = body;
                    } else if (body && Array.isArray(body.speakers) && body.speakers.length > 0) {
                        candidate = body.speakers;
                    } else if (body && typeof body === 'object' && !Array.isArray(body)) {
                        // if object keys map to speaker names, convert
                        const entries = Object.entries(body);
                        if (entries.length > 0 && entries.every(([k, v]) => typeof v === 'string' || typeof v === 'object')) {
                            candidate = entries.map(([k, v]) => (typeof v === 'string' ? { id: k, name: v } : (v && (v.id || v.name) ? { id: v.id || k, name: v.name || k } : null))).filter(Boolean);
                        }
                    }

                    if (candidate.length > 0) {
                        // Normalize and preserve style/variant arrays if present.
                        speakers = candidate.map(s => {
                            if (typeof s === 'string') return { id: s, name: s, styles: [] };
                            const id = s.id || s.name || String(Math.random());
                            const name = s.name || s.id || id;
                            // Extract styles array and normalize each style to a string
                            let rawStyles = Array.isArray(s.styles) ? s.styles
                                : Array.isArray(s.voice_styles) ? s.voice_styles
                                : Array.isArray(s.variants) ? s.variants
                                : [];
                            // Normalize each style: if object, extract name/id; if string, use as-is
                            const styles = rawStyles.map(st => {
                                if (typeof st === 'string') return st;
                                if (st && typeof st === 'object') {
                                    return st.name || st.id || String(st);
                                }
                                return String(st);
                            });
                            return { id, name, styles };
                        });
                         console.log(`Loaded speakers from ${url}`, speakers.length);
                         // mark source for UI tooltip
                         speakerSelectIds.forEach(id => {
                             const sel = document.getElementById(id);
                             if (sel) sel.title = `Loaded from: ${url}`;
                         });
                         try {
                             // cache for offline/fallback use
                             localStorage.setItem('cached-speakers', JSON.stringify(speakers));
                         } catch (e) {
                             // ignore storage failures
                         }
                         break;
                     } else {
                         console.log(`Speaker endpoint ${url} returned empty or unsupported body shape`);
                     }
                 }
             } catch (e) {
                 // ignore and try next
                console.log(`Speaker fetch failed for ${url}:`, e && e.message ? e.message : e);
             }
         }
 
         // If no speakers were loaded from remote endpoints, try cached speakers
         if ((!speakers || speakers.length === 0)) {
             try {
                 const cached = JSON.parse(localStorage.getItem('cached-speakers') || 'null');
                 if (Array.isArray(cached) && cached.length > 0) {
                     speakers = cached;
                     console.log('Using cached speakers from localStorage', speakers.length);
                     speakerSelectIds.forEach(id => {
                         const sel = document.getElementById(id);
                         if (sel) sel.title = 'Loaded from local cache';
                     });
                 }
             } catch (e) {
                 // ignore cache errors
             }
         }
 
         // 2) チャンネル一覧を取得（サーバー内の bot が保持しているチャンネル一覧を提供する内部APIがある場合を想定）
         // 優先: /api/guilds/:guildId/channels, /api/bots/:guildId/channels → フォールバック: none
         let channels = [];

    // (チャンネルの select 要素は後で取得してプレースホルダ処理を行います)

         const channelUrls = [
             `/api/guilds/${guildId}/channels`,
             `/api/bots/${guildId}/channels`,
         ];

         for (const url of channelUrls) {
            try {
                console.log(`Trying channel URL: ${url}`);
                const chResp = await fetch(url, { credentials: 'include' });
                if (chResp) console.log(`Channel response status for ${url}:`, chResp.status);
                if (chResp && chResp.ok) {
                    const chBody = await chResp.json();
                    if (Array.isArray(chBody) && chBody.length > 0) {
                        channels = chBody.map(c => ({ id: c.id, name: c.name, type: c.type }));
                        console.log(`Loaded channels from ${url}`, channels.length);
                        // annotate UI selects with source
                        [ 'auto-join-voice', 'auto-join-text' ].forEach(id => {
                            const sel = document.getElementById(id);
                            if (sel) sel.title = `Loaded from: ${url}`;
                        });
                        break;
                    } else {
                        console.log(`Channel endpoint ${url} returned empty or non-array body`);
                    }
                }
            } catch (e) {
                console.log(`Guild channels fetch failed for ${url}:`, e && e.message ? e.message : e);
            }
        }

        // 3) DOM に反映
        speakerSelectIds.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            // 既存オプションを保存してクリア
            const previous = sel.value;
            sel.innerHTML = '';

            if (speakers.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '利用可能な話者が見つかりません';
                sel.appendChild(opt);
                sel.disabled = true;
            } else {
                sel.disabled = false;
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = '（選択してください）';
                sel.appendChild(placeholder);

                // Create option per style if available, otherwise single option per speaker.
                speakers.forEach(sp => {
                    if (Array.isArray(sp.styles) && sp.styles.length > 0) {
                        sp.styles.forEach(style => {
                            const opt = document.createElement('option');
                            opt.value = `${sp.id}:${style}`;
                            opt.textContent = `${sp.name} — ${style}`;
                            sel.appendChild(opt);
                        });
                    } else {
                        const opt = document.createElement('option');
                        opt.value = sp.id;
                        opt.textContent = sp.name || sp.id;
                        sel.appendChild(opt);
                    }
                });

                // 以前の設定が存在すれば優先して再選択する。保存形式が "id" または "id:style" の両方に対応。
                if (previous) {
                    const found = Array.from(sel.options).some(o => o.value === previous);
                    if (found) {
                        sel.value = previous;
                    } else {
                        // 以前の値が speaker id だけだった場合、対応する最初の style option を選択する
                        const idx = speakers.findIndex(s => s.id === previous);
                        if (idx !== -1 && Array.isArray(speakers[idx].styles) && speakers[idx].styles.length > 0) {
                            sel.value = `${speakers[idx].id}:${speakers[idx].styles[0]}`;
                        }
                    }
                }
            }
        });

        // auto-join の voice/text チャンネル select
        const voiceSel = document.getElementById('auto-join-voice');
        const textSel = document.getElementById('auto-join-text');
        [voiceSel, textSel].forEach(s => { if (s) s.innerHTML = ''; });

        if (!channels || channels.length === 0) {
            // フォールバック表示
            [voiceSel, textSel].forEach(s => {
                if (!s) return;
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'チャンネル情報がありません';
                s.appendChild(opt);
                s.disabled = true;
            });
        } else {
            // Filter channels into voice/text by type. Discord may return numeric
            // types (0=text, 2=voice) or string constants like 'GUILD_VOICE'.
            const isVoice = t => {
                if (t === null || t === undefined) return false;
                if (typeof t === 'number') return t === 2 || t === 13; // 2=voice, 13=stage? (defensive)
                if (typeof t === 'string') return t.toLowerCase().includes('voice');
                return false;
            };
            const isText = t => {
                if (t === null || t === undefined) return false;
                if (typeof t === 'number') return t === 0 || t === 5; // 0=text, 5=announcement? (defensive)
                if (typeof t === 'string') return t.toLowerCase().includes('text') || t.toLowerCase().includes('forum');
                return false;
            };

            const voiceChannels = channels.filter(c => isVoice(c.type));
            const textChannels = channels.filter(c => isText(c.type));

            // If no explicit voice/text types found, fallback to best-effort by name
            if (voiceChannels.length === 0 && textChannels.length === 0) {
                // As a fallback, include channels where names contain 'voice' or 'vc'
                voiceChannels.push(...channels.filter(c => /voice|vc|ボイス|ボイチャ/i.test(c.name)));
                textChannels.push(...channels.filter(c => !voiceChannels.includes(c)));
            }

            voiceChannels.forEach(ch => {
                const optV = document.createElement('option');
                optV.value = ch.id;
                optV.textContent = `🔈 ${ch.name}`;
                if (voiceSel) voiceSel.appendChild(optV);
            });

            textChannels.forEach(ch => {
                const optT = document.createElement('option');
                optT.value = ch.id;
                optT.textContent = `💬 ${ch.name}`;
                if (textSel) textSel.appendChild(optT);
            });

            if (voiceSel) voiceSel.disabled = voiceChannels.length === 0;
            if (textSel) textSel.disabled = textChannels.length === 0;
        }

        return { speakers, channels };
    }

    // 設定をUIに適用
    applySettings(settings) {
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(`default-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else if (element.type === 'range') {
                    element.value = settings[key];
                    const valueElement = document.getElementById(element.id.replace('default-', '') + '-value');
                    if (valueElement) {
                        valueElement.textContent = settings[key];
                    }
                } else {
                    element.value = settings[key];
                }
            }
        });
    }

    // 個人設定をUIに適用
    applyPersonalSettings(settings) {
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(`personal-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else if (element.type === 'range') {
                    element.value = settings[key];
                    const valueElement = document.getElementById(element.id + '-value');
                    if (valueElement) {
                        valueElement.textContent = settings[key];
                    }
                } else {
                    element.value = settings[key];
                }
            }
        });
    }

    // NOTE: old wrapper removed to avoid accidental recursion. The real async
    // loadServerSettings(serverId) is implemented above and will be used.

    // ギルド情報の定期更新を開始
    startGuildUpdates() {
        // 既存のインターバルをクリア
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        console.log('[Dashboard] Starting periodic guild updates (every 60s)');
        
        // 定期更新を開始（60秒ごと）
        this.updateInterval = setInterval(() => {
            if (this.state.isLoggedIn && !this.state.isLoadingGuild) {
                this.loadOverviewData(); // 統計情報のみ更新
            }
        }, 60000);
    }

    // クリーンアップ処理
    cleanup() {
        // インターバルをクリア
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // イベントリスナーをすべて削除
        this.state.eventListeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.state.eventListeners.clear();
        
        // デバウンスタイマーをクリア
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
        
        logger.info('[Dashboard] Cleanup complete');
    }

    // ... 他のメソッドは省略（既存のまま）
}

// シングルトンインスタンス
Dashboard.instance = null;

// グローバルインスタンスを作成
const dashboard = new Dashboard();

// ページアンロード時にクリーンアップ
window.addEventListener('beforeunload', () => {
    dashboard.cleanup();
});