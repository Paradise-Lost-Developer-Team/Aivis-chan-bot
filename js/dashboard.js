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
        this.currentTab = 'overview';
        this.isLoggedIn = false;
        this.user = null;
        this.init();
    }

    async init() {
        // サーバーセッションで認証状態を確認（localStorageは使わない）
        try {
            const session = await fetch('/api/session', { credentials: 'include' }).then(r => r.json());
            if (session && session.authenticated) {
                this.isLoggedIn = true;
                this.user = session.user || null;
                this.showDashboard();
                // 認証済みのみプレミアム状態を確認
                this.checkPremiumStatus();
            } else {
                console.warn('User not authenticated.');
            }
        } catch (e) {
            console.error('Failed to check session:', e);
        }

        this.setupDiscordLogin();
        this.setupLogout();

        // Update user UI regardless of authenticated state
        // (fills #user-display, #user-avatar, shows/hides logout button)
        this.loadUserInfo();

        // If initial session check did not find an authenticated user,
        // poll briefly to handle the case where the OAuth redirect arrives
        // and the session cookie becomes available just after load.
        if (!this.isLoggedIn) {
            const maxAttempts = 10; // 最大待機回数（秒）
            for (let i = 0; i < maxAttempts; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    const s = await fetch('/api/session', { credentials: 'include' }).then(r => r.json());
                    if (s && s.authenticated) {
                        this.isLoggedIn = true;
                        this.user = s.user || null;
                        console.log('Session detected after polling, showing dashboard.');
                        this.showDashboard();
                        this.checkPremiumStatus();
                        break;
                    }
                } catch (err) {
                    // ignore transient errors while polling
                }
            }
        }
    }

    // ログインページを表示する処理は不要になったため削除しました

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
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }

    // ログアウト処理
    logout() {
        // サーバーセッションを破棄
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
            // Use relative path that server.js can proxy or handle
            const response = await fetch('/api/bot-stats', { 
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch bot stats: ${response.status} ${response.statusText}`);
            }
            
             const data = await response.json();

             document.getElementById('total-servers').textContent = data.total_bots || 0;
             document.getElementById('total-users').textContent = data.total_bots ? Math.floor(Math.random() * 10000) + 1000 : 0; // 仮のデータ
             document.getElementById('online-bots').textContent = data.online_bots || 0;
             document.getElementById('vc-connections').textContent = data.total_bots ? Math.floor(Math.random() * 500) + 50 : 0; // 仮のデータ

             this.renderBotStatus(data.bots || []);
         } catch (error) {
             console.error('Failed to load overview data:', error);
            logger.error(`Bot統計の取得に失敗: ${error.message}`);
            
            // Show fallback data
            document.getElementById('total-servers').textContent = '0';
            document.getElementById('total-users').textContent = '0';
            document.getElementById('online-bots').textContent = '0';
            document.getElementById('vc-connections').textContent = '0';
            
            // Render empty bot status
            const container = document.getElementById('bot-status-list');
            if (container) {
                container.innerHTML = '<div class="bot-item offline"><div class="bot-name">データ取得エラー</div><div class="bot-status offline">オフライン</div></div>';
            }
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

            if (this.isLoggedIn && this.user) {
                // Determine a friendly display name
                const name = this.user.displayName || this.user.username || this.user.name || this.user.tag || 'ユーザー';
                displayEl.textContent = name;

                // Avatar handling (support common shapes)
                if (avatarEl) {
                    let avatarSrc = '';
                    if (this.user.avatarUrl) avatarSrc = this.user.avatarUrl;
                    else if (this.user.avatar && this.user.id) avatarSrc = `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png?size=128`;
                    else if (this.user.avatarPath) avatarSrc = this.user.avatarPath;

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
    loadGuilds(isManualRefresh = false) {
        if (isManualRefresh) {
            logger.info('Manually refreshing server list...');
        } else {
            logger.info('Loading server information...');
        }
        
        console.log('[Dashboard] Loading server information...');
        
        const serverListContainer = document.getElementById('server-list');
        if (!serverListContainer) {
            console.error("[Dashboard] Element 'server-list' not found. Unable to display servers.");
            return;
        }

        // ローディング表示
        serverListContainer.innerHTML = '<li class="server-item loading"><span>読み込み中...</span></li>';

        // デバッグ: 現在のセッション状態を確認
        fetch('/api/session', { 
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        })
            .then(response => response.json())
            .then(session => {
                console.log('[Dashboard] Current session:', session);
                logger.info(`Session status: ${session.authenticated ? 'authenticated' : 'not authenticated'}`);
            })
            .catch(err => {
                console.error('[Dashboard] Failed to check session:', err);
            });

        fetch('/api/servers', { 
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        })
            .then(response => {
                console.log('[Dashboard] /api/servers response status:', response.status);
                console.log('[Dashboard] Response headers:', Object.fromEntries(response.headers.entries()));
                
                if (response.status === 401) {
                    console.warn('[Dashboard] 401 Unauthorized - User not authenticated');
                    logger.error('認証が必要です。ログインしてください。');
                    serverListContainer.innerHTML = '<li class="server-item error"><span>ログインが必要です</span></li>';
                    throw new Error('Authentication required');
                }
                
                if (!response.ok) {
                    throw new Error(`Server list endpoint returned ${response.status}: ${response.statusText}`);
                }
                
                return response.json();
            })
            .then(data => {
                console.log('[Dashboard] Servers loaded:', data);
                console.log('[Dashboard] Data type:', typeof data);
                console.log('[Dashboard] Is array:', Array.isArray(data));
                logger.info(`Servers loaded: ${Array.isArray(data) ? data.length : 0} servers`);
                
                if (!Array.isArray(data)) {
                    console.error('[Dashboard] Server response is not an array:', typeof data);
                    throw new Error(`Server list response is not an array: ${typeof data}`);
                }
                
                if (data.length === 0) {
                    console.warn('[Dashboard] No servers returned');
                    logger.warn('Botが参加しているサーバーが見つかりません');
                    serverListContainer.innerHTML = '<li class="server-item"><span>サーバーが見つかりませんでした</span></li>';
                    return;
                }
                
                serverListContainer.innerHTML = '';

                data.forEach((server, index) => {
                    console.log(`[Dashboard] Rendering server ${index + 1}:`, server.name, server.id);
                    
                    const listItem = document.createElement('li');
                    listItem.className = 'server-item';
                    listItem.setAttribute('data-server-id', server.id);

                    const icon = document.createElement('img');
                    icon.src = server.iconUrl || '/default-icon.svg';
                    icon.alt = `${server.name} icon`;
                    icon.classList.add('server-icon');
                    
                    // アイコンの読み込みエラー時のフォールバック
                    icon.onerror = function() {
                        const fallbackIcon = document.createElement('div');
                        fallbackIcon.className = 'server-icon server-icon-fallback';
                        fallbackIcon.textContent = server.name.charAt(0).toUpperCase();
                        fallbackIcon.title = server.name;
                        fallbackIcon.style.cssText = 'width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold;';
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
                    statusIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #28a745; display: inline-block; margin-right: 6px;';
                    const statusText = document.createElement('span');
                    statusText.textContent = 'オンライン';
                    statusText.style.cssText = 'color: #666; font-size: 12px;';
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
                    });
                });
                
                // 自動で最初のサーバーを選択して設定を読み込む（初回のみ）
                if (!isManualRefresh && data.length > 0) {
                    const firstId = data[0].id;
                    setTimeout(() => this.selectServer(firstId), 100);
                }
                
                if (isManualRefresh) {
                    this.showSuccessToast('サーバー一覧を更新しました');
                }
            })
            .catch(error => {
                console.error('[Dashboard] サーバー一覧の取得に失敗:', error);
                console.error('[Dashboard] Error stack:', error.stack);
                logger.error(`サーバー一覧の取得に失敗: ${error.message}`);
                
                if (serverListContainer) {
                    serverListContainer.innerHTML = '<li class="server-item error"><span>サーバー一覧の読み込みに失敗しました</span></li>';
                }
                
                if (isManualRefresh) {
                    this.showErrorToast('サーバー一覧の更新に失敗しました');
                }
            });
    }

    // ギルド情報の定期更新を開始（削除または無効化）
    startGuildUpdates() {
        // 定期的な自動更新は無効化
        // ユーザーが手動で更新ボタンを押すまでリロードしない
        console.log('Automatic guild updates disabled. Use manual refresh button.');
        logger.info('自動更新は無効です。更新が必要な場合は手動で更新してください。');
        
        // 手動更新ボタンのイベントリスナーを設定
        const refreshButton = document.getElementById('refresh-servers-btn');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                console.log('Manual refresh triggered');
                this.loadGuilds(true); // 手動更新フラグを立てる
            });
        }
    }
}

// グローバルインスタンスを作成
const dashboard = new Dashboard();
