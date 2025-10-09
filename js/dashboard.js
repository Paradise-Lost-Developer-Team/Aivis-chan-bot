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
        this.servers = [];
        this.currentGuildId = null;
        this.currentUserId = null;
        this.serversLoaded = false;
        this.init();
    }

    async init() {
        try {
            logger.info('[Dashboard] Initializing...');
            
            // ログシステムを初期化
            logger.init();
            
            // セッション状態を確認
            const sessionResponse = await fetch('/api/session', {
                credentials: 'include'
            });
            
            if (!sessionResponse.ok) {
                logger.error('[Dashboard] Session check failed, redirecting to login');
                window.location.href = '/';
                return;
            }
            
            const sessionData = await sessionResponse.json();
            
            if (!sessionData.authenticated) {
                logger.warn('[Dashboard] User not authenticated, redirecting to login');
                window.location.href = '/';
                return;
            }
            
            this.currentUserId = sessionData.user.id;
            logger.info(`[Dashboard] User authenticated: ${this.currentUserId}`);
            
            // ユーザー情報を表示
            this.displayUserInfo(sessionData.user);
            
            // メインコンテンツを表示
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.display = 'block';
            }
            
            const dashboardContainer = document.querySelector('.dashboard-container');
            if (dashboardContainer) {
                dashboardContainer.style.display = 'flex';
            }
            
            // サーバー一覧を初回のみロード
            await this.loadServers();
            
            // イベントリスナーを設定
            this.setupEventListeners();
            
            // タブナビゲーションを設定
            this.setupTabNavigation();
            
            logger.success('[Dashboard] Initialization complete');
        } catch (error) {
            logger.error('[Dashboard] Initialization failed: ' + error.message);
            console.error('[Dashboard] Error details:', error);
            this.showError('ダッシュボードの初期化に失敗しました: ' + error.message);
        }
    }

    displayUserInfo(user) {
        try {
            logger.info('[Dashboard] Displaying user info');
            
            // ユーザー名を表示
            const userDisplay = document.getElementById('user-display');
            if (userDisplay) {
                const username = user.username || user.displayName || user.name || 'ユーザー';
                userDisplay.textContent = username;
            }
            
            // アバターを表示
            const userAvatar = document.getElementById('user-avatar');
            if (userAvatar && user.avatar && user.id) {
                const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
                userAvatar.src = avatarUrl;
                userAvatar.style.display = 'inline-block';
            }
            
            // ログアウトボタンを表示
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.style.display = 'inline-block';
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.location.href = '/logout';
                });
            }
            
            logger.success('[Dashboard] User info displayed');
        } catch (error) {
            logger.error('[Dashboard] Failed to display user info: ' + error.message);
        }
    }

    async loadServers() {
        if (this.serversLoaded) {
            logger.info('[Dashboard] Servers already loaded, skipping...');
            return;
        }

        try {
            logger.info('[Dashboard] Loading servers...');
            
            const response = await fetch('/api/servers', {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load servers: ${response.status}`);
            }
            
            this.servers = await response.json();
            this.serversLoaded = true;
            
            logger.info(`[Dashboard] Loaded ${this.servers.length} servers`);
            
            // サーバーリストを表示
            this.renderServerList();
            
        } catch (error) {
            logger.error('[Dashboard] Failed to load servers: ' + error.message);
            this.showError('サーバー一覧の読み込みに失敗しました');
        }
    }

    renderServerList() {
        const serverList = document.getElementById('server-list');
        if (!serverList) {
            logger.error('[Dashboard] server-list element not found');
            return;
        }
        
        if (this.servers.length === 0) {
            serverList.innerHTML = '<li class="no-servers">サーバーが見つかりませんでした</li>';
            return;
        }
        
        serverList.innerHTML = this.servers.map(server => `
            <li class="server-item" data-guild-id="${server.id}">
                ${server.iconUrl 
                    ? `<img src="${server.iconUrl}" alt="${this.escapeHtml(server.name)}" class="server-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                    : ''
                }
                <div class="server-icon-fallback" style="${server.iconUrl ? 'display:none;' : ''}">${this.escapeHtml(server.name.charAt(0))}</div>
                <div class="server-info">
                    <div class="server-name">${this.escapeHtml(server.name)}</div>
                    <div class="server-status">
                        <span class="status-indicator"></span>
                        <span>クリックして設定</span>
                    </div>
                </div>
            </li>
        `).join('');
        
        // サーバー選択イベントを設定
        document.querySelectorAll('.server-item').forEach(item => {
            item.addEventListener('click', () => {
                const guildId = item.dataset.guildId;
                this.selectServer(guildId);
            });
        });
        
        logger.success(`[Dashboard] Rendered ${this.servers.length} servers`);
        
        // 設定パネルに初期メッセージを表示
        this.showInitialMessage();
    }

    showInitialMessage() {
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) {
            settingsPanel.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #666;">
                    <h2 style="margin-bottom: 16px;">👈 サーバーを選択してください</h2>
                    <p>左側のサーバー一覧から設定したいサーバーをクリックしてください。</p>
                </div>
            `;
            settingsPanel.style.display = 'block';
        }
    }

    async selectServer(guildId) {
        logger.info(`[Dashboard] Server selected: ${guildId}`);
        
        // 選択状態を更新
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`.server-item[data-guild-id="${guildId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        this.currentGuildId = guildId;
        
        // ローディング表示
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) {
            settingsPanel.innerHTML = `
                <div style="padding: 40px; text-align: center;">
                    <div style="display: inline-block; width: 48px; height: 48px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="margin-top: 16px; color: #666;">設定を読み込み中...</p>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
        }
        
        // サーバー設定をロード
        await this.loadServerSettings(guildId);
    }

    async loadServerSettings(guildId) {
        logger.info(`[Dashboard] Loading settings for: ${guildId}`);
        
        try {
            // ギルド情報取得
            logger.info(`[Dashboard] Fetching guild info: /api/guilds/${guildId}`);
            
            const guildResp = await fetch(`/api/guilds/${guildId}`, {
                credentials: 'include'
            });
            
            if (!guildResp.ok) {
                const errorData = await guildResp.json().catch(() => ({}));
                throw new Error(errorData.message || `ギルド情報の取得に失敗しました (${guildResp.status})`);
            }
            
            const guildData = await guildResp.json();
            logger.info(`[Dashboard] Guild data received`);
            
            // 設定取得
            const settingsResp = await fetch(`/api/settings/${guildId}`, {
                credentials: 'include'
            });
            
            const settingsData = settingsResp.ok ? await settingsResp.json() : {};
            const settings = settingsData.settings || {};
            
            // 話者一覧を取得
            const speakersResp = await fetch('/api/speakers', {
                credentials: 'include'
            });
            
            const speakers = speakersResp.ok ? await speakersResp.json() : [];
            
            // 設定画面を表示
            this.renderSettings(guildId, guildData, settings, speakers);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to load server settings: ' + error.message);
            this.showError('サーバー設定の読み込みに失敗しました: ' + error.message);
            
            // エラー表示
            const settingsPanel = document.getElementById('settings-panel');
            if (settingsPanel) {
                settingsPanel.innerHTML = `
                    <div style="padding: 40px; text-align: center;">
                        <div style="color: #f44336; font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h3 style="color: #f44336; margin-bottom: 8px;">エラーが発生しました</h3>
                        <p style="color: #666;">${this.escapeHtml(error.message)}</p>
                        <button onclick="dashboard.selectServer('${guildId}')" style="margin-top: 16px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            再試行
                        </button>
                    </div>
                `;
            }
        }
    }

    renderSettings(guildId, guildData, settings, speakers) {
        logger.info(`[Dashboard] Rendering settings for: ${guildId}`);
        
        // 基本情報を表示
        document.getElementById('guild-id').textContent = guildData.id;
        document.getElementById('guild-name').textContent = guildData.name;
        
        // サーバーアイコン
        const guildIcon = document.getElementById('guild-icon');
        if (guildIcon) {
            if (guildData.iconUrl) {
                guildIcon.src = guildData.iconUrl;
                guildIcon.alt = `${this.escapeHtml(guildData.name)} アイコン`;
                guildIcon.style.display = 'block';
            } else {
                guildIcon.style.display = 'none';
            }
        }
        
        // ボットステータス
        this.updateBotStatus(guildId);
        
        // 設定フォームに値をセット
        this.setFormValues('default-', settings);
        
        // 話者セレクトを更新
        this.updateSpeakerSelect(speakers);
        
        // チャンネル情報を更新
        this.updateChannelInfo(guildId);
        
        // プレミアム情報を表示
        this.displayPremiumInfo(guildId);
        
        // UIを更新
        this.updateUIForSettings();
        
        logger.success(`[Dashboard] Settings rendered for: ${guildId}`);
    }

    // ボットのオンラインステータスを更新
    async updateBotStatus(guildId) {
        logger.info(`[Dashboard] Updating bot status for: ${guildId}`);
        
        try {
            const response = await fetch(`/api/bot-status/${guildId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch bot status: ${response.status}`);
            }
            
            const statusData = await response.json();
            logger.info('[Dashboard] Bot status data:', statusData);
            
            // ステータス表示要素
            const statusElement = document.getElementById('bot-status');
            if (!statusElement) return;
            
            // オンライン/オフラインのテキストと色を設定
            if (statusData.online) {
                statusElement.textContent = 'オンライン';
                statusElement.style.color = '#28a745'; // 緑
            } else {
                statusElement.textContent = 'オフライン';
                statusElement.style.color = '#dc3545'; // 赤
            }
            
            // 詳細情報を表示
            this.updateBotStatusDetails(statusData);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to update bot status: ' + error.message);
        }
    }

    // ボットの詳細ステータスを表示
    updateBotStatusDetails(statusData) {
        const detailsElement = document.getElementById('bot-status-details');
        if (!detailsElement) return;
        
        if (statusData.online) {
            detailsElement.innerHTML = `
                <p><strong>ボット名:</strong> ${this.escapeHtml(statusData.botName)}</p>
                <p><strong>サーバー参加数:</strong> ${statusData.guildsCount || 0}</p>
                <p><strong>メッセージ処理数:</strong> ${statusData.messagesProcessed || 0}</p>
                <p><strong>稼働時間:</strong> ${this.formatUptime(statusData.uptime)}</p>
            `;
        } else {
            detailsElement.innerHTML = '<p>ボットは現在オフラインです。</p>';
        }
    }

    // アップタイムをフォーマット
    formatUptime(uptime) {
        if (!uptime) return '不明';
        
        const totalSeconds = Math.floor(uptime / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours}時間 ${minutes}分 ${seconds}秒`;
    }

    // スピーカーセレクトを更新
    updateSpeakerSelect(speakers) {
        const speakerSelect = document.getElementById('default-speaker');
        if (!speakerSelect) return;
        
        // 既存のオプションをクリア
        speakerSelect.innerHTML = '';
        
        if (speakers.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '利用可能な話者が見つかりません';
            speakerSelect.appendChild(opt);
            speakerSelect.disabled = true;
        } else {
            speakerSelect.disabled = false;
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '（選択してください）';
            speakerSelect.appendChild(placeholder);

            speakers.forEach(sp => {
                const opt = document.createElement('option');
                opt.value = sp.id;
                opt.textContent = sp.name || sp.id;
                speakerSelect.appendChild(opt);
            });
        }
    }

    // チャンネル情報を更新
    async updateChannelInfo(guildId) {
        logger.info(`[Dashboard] Updating channel info for: ${guildId}`);
        
        try {
            const response = await fetch(`/api/channels/${guildId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch channels: ${response.status}`);
            }
            
            const channelsData = await response.json();
            logger.info('[Dashboard] Channels data:', channelsData);
            
            // ボイスチャンネルとテキストチャンネルを分けて表示
            this.updateChannelSelect('auto-join-voice', channelsData.voice);
            this.updateChannelSelect('auto-join-text', channelsData.text);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to update channel info: ' + error.message);
        }
    }

    // チャンネルセレクトを更新
    updateChannelSelect(selectId, channels) {
        const channelSelect = document.getElementById(selectId);
        if (!channelSelect) return;
        
        // 既存のオプションをクリア
        channelSelect.innerHTML = '';
        
        if (channels.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '利用可能なチャンネルが見つかりません';
            channelSelect.appendChild(opt);
            channelSelect.disabled = true;
        } else {
            channelSelect.disabled = false;
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '（選択してください）';
            channelSelect.appendChild(placeholder);

            channels.forEach(ch => {
                const opt = document.createElement('option');
                opt.value = ch.id;
                opt.textContent = ch.name || ch.id;
                channelSelect.appendChild(opt);
            });
        }
    }

    // プレミアム情報を表示
    async displayPremiumInfo(guildId) {
        logger.info(`[Dashboard] Displaying premium info for: ${guildId}`);
        
        try {
            const response = await fetch(`/api/premium-info/${guildId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch premium info: ${response.status}`);
            }
            
            const premiumData = await response.json();
            logger.info('[Dashboard] Premium data:', premiumData);
            
            const premiumBadge = document.getElementById('premium-badge');
            const premiumDetails = document.getElementById('premium-details');
            
            if (premiumData.isPremium) {
                premiumBadge.textContent = 'プレミアム会員';
                premiumBadge.className = 'premium-badge active';

                const expiryDate = new Date(premiumData.expiryDate).toLocaleDateString('ja-JP');
                premiumDetails.innerHTML = `
                    <p><strong>会員種別:</strong> ${premiumData.tier || 'スタンダード'}</p>
                    <p><strong>有効期限:</strong> ${expiryDate}</p>
                    <p><strong>特典:</strong> 高度なTTS設定、優先処理、カスタム辞書、詳細統計</p>
                `;
            } else {
                premiumBadge.textContent = '無料会員';
                premiumBadge.className = 'premium-badge inactive';
                premiumDetails.innerHTML = `
                    <p>プレミアム機能を利用するには、プレミアム会員登録が必要です。</p>
                    <p><a href="/premium" target="_blank">プレミアム登録はこちら</a></p>
                `;
            }
        } catch (error) {
            logger.error('[Dashboard] Failed to display premium info: ' + error.message);
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
            document.getElementById('total-users').textContent = data.total_bots ? Math.floor(Math.random() * 10000) + 1000 : 0; // 仮のデータ
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
    loadGuilds() {
        console.log('Loading server information...');
        const serverListContainer = document.getElementById('server-list');
        if (!serverListContainer) {
            console.error("Element 'server-list' not found. Unable to display servers.");
            return;
        }

        fetch('/api/servers', { credentials: 'include' })
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
                    });
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
            console.warn(`Re-entrant call to loadServerSettings(${serverId}) detected — skipping to avoid recursion`);
            console.trace();
            return;
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
                        speakers = candidate.map(s => typeof s === 'string' ? { id: s, name: s } : { id: s.id || s.name, name: s.name || s.id });
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

                speakers.forEach(sp => {
                    const opt = document.createElement('option');
                    opt.value = sp.id;
                    opt.textContent = sp.name || sp.id;
                    sel.appendChild(opt);
                });

                // 以前の設定があれば選択
                if (previous) sel.value = previous;
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

    // ギルド情報の定期更新を開始
    startGuildUpdates() {
        console.log('Starting periodic guild updates...');
        setInterval(() => {
            this.loadGuilds(); // 定期的にギルド情報を再取得
        }, 60000); // 60秒ごとに更新
    }
}

// グローバルインスタンスを作成
const dashboard = new Dashboard();