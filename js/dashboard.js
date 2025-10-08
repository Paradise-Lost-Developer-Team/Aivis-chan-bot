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

        // Setup toggle buttons
        const toggleButton = document.getElementById('toggle-logs');
        const openButton = document.getElementById('open-logs');
        const logViewer = document.getElementById('log-viewer');

        if (toggleButton && logViewer) {
            toggleButton.addEventListener('click', () => {
                logViewer.style.display = 'none';
                if (openButton) openButton.style.display = 'block';
            });
        }

        if (openButton && logViewer) {
            openButton.addEventListener('click', () => {
                logViewer.style.display = 'flex';
                openButton.style.display = 'none';
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
        this.currentGuildId = null;
        this.servers = [];
        this.guildUpdateInterval = null;
        this.version = null;
        this.currentUserId = null; // ユーザーIDを保持
        
        logger.info('[Dashboard] Constructor initialized');
    }

    async init() {
        logger.info('[Dashboard] Initializing...');
        
        try {
            // versionパラメータを取得
            const urlParams = new URLSearchParams(window.location.search);
            this.version = urlParams.get('version');
            
            if (!this.version || (this.version !== 'free' && this.version !== 'pro')) {
                logger.error('[Dashboard] Invalid or missing version parameter');
                window.location.href = '/login?error=missing_version';
                return;
            }
            
            logger.info(`[Dashboard] Version: ${this.version}`);
            
            // バージョンタグを表示
            const versionTag = document.getElementById('version-tag');
            if (versionTag) {
                versionTag.textContent = this.version === 'free' ? 'Free版' : 'Pro版';
                versionTag.className = `version-tag version-${this.version}`;
            }
            
            // セッション確認
            const sessionResp = await fetch('/api/session', {
                credentials: 'include'
            });
            
            if (!sessionResp.ok) {
                logger.error(`[Dashboard] Session check failed: ${sessionResp.status}`);
                window.location.href = '/login';
                return;
            }
            
            const sessionData = await sessionResp.json();
            logger.info('[Dashboard] Session data:', JSON.stringify(sessionData));
            
            if (!sessionData.authenticated) {
                logger.warn('[Dashboard] Not authenticated');
                window.location.href = '/login';
                return;
            }
            
            // バージョンチェック
            if (sessionData.user.version !== this.version) {
                logger.error(`[Dashboard] Version mismatch: expected ${this.version}, got ${sessionData.user.version}`);
                window.location.href = `/login?error=version_mismatch&message=${encodeURIComponent('認証バージョンが一致しません')}`;
                return;
            }
            
            // ユーザーIDを保存
            this.currentUserId = sessionData.user.id;
            
            // ユーザー情報表示
            this.displayUserInfo(sessionData.user);
            
            // サーバー一覧読み込み
            await this.loadServers();
            
        } catch (error) {
            logger.error('[Dashboard] Init error: ' + error.message);
            this.showError('初期化に失敗しました: ' + error.message);
        }
    }

    displayUserInfo(user) {
        logger.info(`[Dashboard] Displaying user info: ${user.username}`);
        
        const userNameEl = document.getElementById('user-name');
        const userAvatarEl = document.getElementById('user-avatar');
        
        if (userNameEl) {
            userNameEl.textContent = user.username || 'Unknown';
        }
        
        if (userAvatarEl && user.avatarUrl) {
            userAvatarEl.src = user.avatarUrl;

        }
        
        logger.success('User info loaded: ' + user.username);
    }

    async loadServers() {
        logger.info('[Dashboard] Loading server information...');
        
        try {
            const response = await fetch('/api/guilds', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            logger.info(`[Dashboard] /api/guilds response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`[Dashboard] Server list error: ${response.status} - ${errorText}`);
                throw new Error(`サーバー一覧の取得に失敗しました (${response.status})`);
            }
            
            const servers = await response.json();
            
            logger.info(`[Dashboard] Response type: ${typeof servers}`);
            logger.info(`[Dashboard] Is array: ${Array.isArray(servers)}`);
            logger.info(`[Dashboard] Server count: ${servers.length}`);
            
            if (servers.length > 0) {
                logger.info(`[Dashboard] First server sample: ${JSON.stringify(servers[0])}`);
            }
            
            if (!Array.isArray(servers)) {
                logger.error('[Dashboard] Invalid servers format: ' + typeof servers);
                throw new Error('サーバーデータの形式が不正です');
            }
            
            this.servers = servers;
            
            if (servers.length === 0) {
                logger.warn('[Dashboard] ⚠️  Empty server list returned');
                logger.warn('[Dashboard] Possible causes:');
                logger.warn('[Dashboard] 1. Bot instances are offline');
                logger.warn('[Dashboard] 2. Bot not invited to any servers');
                logger.warn('[Dashboard] 3. User lacks admin permissions');
                logger.warn('[Dashboard] 4. Version mismatch (free vs pro)');
                this.showNoServersMessage();
                return;
            }
            
            logger.success(`✅ Loaded ${servers.length} servers`);
            this.renderServerList(servers);
            
        } catch (error) {
            logger.error(`[Dashboard] ❌ Failed to load servers: ${error.message}`);
            logger.error(`[Dashboard] Stack: ${error.stack}`);
            this.showError('サーバー一覧の読み込みに失敗しました: ' + error.message);
        }
    }

    showNoServersMessage() {
        const serverListEl = document.getElementById('server-list');
        if (!serverListEl) {
            logger.warn('[Dashboard] server-list element not found');
            return;
        }
        
        logger.warn('Botが参加しているサーバーが見つかりません');
        
        serverListEl.innerHTML = `
            <div class="no-servers-message">
                <div class="icon">🤖</div>
                <h3>Botが参加しているサーバーが見つかりません</h3>
                <p>以下の原因が考えられます：</p>
                <ul>
                    <li><strong>Botがオフライン：</strong> Discord Developer Portalで確認してください</li>
                    <li><strong>サーバーに未参加：</strong> Botを招待してください</li>
                    <li><strong>管理権限がない：</strong> サーバー設定を確認してください</li>
                    <li><strong>認証バージョン違い：</strong> Free版とPro版を確認してください</li>
                </ul>
                <div class="action-buttons" style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
                    <button onclick="location.reload()" class="reload-btn" style="padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
                        🔄 再読み込み
                    </button>
                    <a href="https://discord.com/developers/applications" target="_blank" class="dev-portal-btn" style="padding: 12px 24px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-block;">
                        🔧 Developer Portal
                    </a>
                </div>
            </div>
        `;
    }

    renderServerList(servers) {
        logger.info(`[Dashboard] Rendering server list: ${servers.length} servers`);
        
        const serverListEl = document.getElementById('server-list');
        if (!serverListEl) {
            logger.error('[Dashboard] server-list element not found');
            return;
        }
        
        serverListEl.innerHTML = '';
        
        servers.forEach(server => {
            const serverCard = document.createElement('div');
            serverCard.className = 'server-card';
            serverCard.dataset.serverId = server.id;
            
            const iconUrl = server.iconUrl;
            serverCard.innerHTML = `
                <img src="${iconUrl}" 
                     alt="${server.name}" 
                     class="server-icon">
                <div class="server-info">
                    <h3 class="server-name">${this.escapeHtml(server.name)}</h3>
                    ${server.memberCount ? `<p class="server-members">👥 ${server.memberCount}人</p>` : ''}
                    ${server.botName ? `<p class="server-bot">🤖 ${server.botName}</p>` : ''}
                </div>
            `;
            
            serverCard.addEventListener('click', () => {
                this.selectServer(server.id);
            });
            
            serverListEl.appendChild(serverCard);
        });
        
        logger.success(`Server list rendered: ${servers.length} servers displayed`);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async selectServer(guildId) {
        logger.info(`[Dashboard] Selecting server: ${guildId}`);
        
        this.currentGuildId = guildId;
        
        // サーバーカードのアクティブ状態を更新
        document.querySelectorAll('.server-card').forEach(card => {
            card.classList.remove('active');
            if (card.dataset.serverId === guildId) {
                card.classList.add('active');
            }
        });
        
        // Welcome画面を非表示
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
        
        // サーバー設定を読み込む
        await this.loadServerSettings(guildId);
    }

    async loadServerSettings(guildId) {
        logger.info(`[Dashboard] Loading settings for: ${guildId}`);
        
        try {
            // ギルド情報取得
            logger.info(`[Dashboard] Fetching guild info: /api/guilds/${guildId}`);
            
            const guildResp = await fetch(`/api/guilds/${guildId}`, {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            logger.info(`[Dashboard] Guild info response status: ${guildResp.status}`);
            
            if (!guildResp.ok) {
                const errorData = await guildResp.json().catch(() => ({}));
                logger.error(`[Dashboard] Failed to fetch guild info:`, JSON.stringify(errorData));
                
                if (guildResp.status === 404) {
                    throw new Error(errorData.message || 'このサーバーにBotが参加していません');
                } else if (guildResp.status === 403) {
                    throw new Error('このサーバーの管理権限がありません');
                } else {
                    throw new Error(`ギルド情報の取得に失敗しました (${guildResp.status})`);
                }
            }
            
            const guildData = await guildResp.json();
            
            logger.info(`[Dashboard] Guild data received:`, {
                id: guildData.id,
                name: guildData.name,
                channelsCount: guildData.channels?.length || 0,
                rolesCount: guildData.roles?.length || 0,
                botName: guildData.botName
            });
            
            // チャンネル配列の確認
            if (!Array.isArray(guildData.channels)) {
                logger.warn(`[Dashboard] Channels is not an array, converting...`);
                guildData.channels = [];
            }
            
            // 設定取得
            logger.info(`[Dashboard] Fetching settings: /api/guilds/${guildId}/settings`);
            
            const settingsResp = await fetch(`/api/guilds/${guildId}/settings`, {
                credentials: 'include'
            });
            
            const settings = settingsResp.ok ? await settingsResp.json() : {};
            logger.info('[Dashboard] Settings loaded:', Object.keys(settings).length > 0 ? 'Custom settings' : 'Default settings');
            
            // 設定画面を表示
            this.renderSettings(guildId, guildData, settings);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to load server settings: ' + error.message);
            logger.error('[Dashboard] Stack trace:', error.stack);
            this.showError('サーバー設定の読み込みに失敗しました: ' + error.message);
        }
    }

    renderSettings(guildId, guildData, settings) {
        logger.info(`[Dashboard] Rendering settings for: ${guildId}`);
        
        const settingsEl = document.getElementById('settings-panel');
        if (!settingsEl) {
            logger.error('[Dashboard] settings-panel element not found');
            return;
        }
        
        const server = this.servers.find(s => s.id === guildId);
        const serverName = guildData.name || (server ? server.name : 'サーバー');
        
        // チャンネルをカテゴリごとに分類
        const channels = guildData.channels || [];
        const textChannels = channels.filter(ch => ch.type === 0 || ch.type === 'GUILD_TEXT');
        const voiceChannels = channels.filter(ch => ch.type === 2 || ch.type === 'GUILD_VOICE');
        
        logger.info(`[Dashboard] Channels breakdown: Text=${textChannels.length}, Voice=${voiceChannels.length}`);
        
        // タブシステムを含む設定UIを表示
        settingsEl.style.display = 'block';
        settingsEl.innerHTML = `
            <div class="settings-header">
                <h2>⚙️ ${this.escapeHtml(serverName)} の設定</h2>
            </div>
            
            <!-- タブナビゲーション -->
            <div class="settings-tabs">
                <button class="tab-button active" data-tab="info">📊 サーバー情報</button>
                <button class="tab-button" data-tab="server-settings">🔧 サーバー設定</button>
                <button class="tab-button" data-tab="dictionary">📖 辞書機能</button>
                <button class="tab-button" data-tab="personal">👤 個人設定</button>
            </div>
            
            <div class="settings-content">
                <!-- サーバー情報タブ -->
                <div class="tab-content active" data-tab="info">
                    <div class="settings-section">
                        <h3>📊 サーバー情報</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">🤖 Bot:</span>
                                <span class="info-value">${this.escapeHtml(guildData.botName || '不明')}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">💬 テキストチャンネル:</span>
                                <span class="info-value">${textChannels.length}個</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">🔊 ボイスチャンネル:</span>
                                <span class="info-value">${voiceChannels.length}個</span>
                            </div>
                            ${guildData.memberCount ? `
                            <div class="info-item">
                                <span class="info-label">👥 メンバー数:</span>
                                <span class="info-value">${guildData.memberCount}人</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${textChannels.length > 0 ? `
                    <div class="settings-section">
                        <h3>💬 テキストチャンネル一覧</h3>
                        <ul class="channel-list">
                            ${textChannels.slice(0, 10).map(ch => `
                                <li class="channel-item">
                                    <span class="channel-icon">#</span>
                                    <span class="channel-name">${this.escapeHtml(ch.name)}</span>
                                </li>
                            `).join('')}
                            ${textChannels.length > 10 ? `<li class="channel-item">... 他 ${textChannels.length - 10}個</li>` : ''}
                        </ul>
                    </div>
                    ` : ''}
                    
                    ${voiceChannels.length > 0 ? `
                    <div class="settings-section">
                        <h3>🔊 ボイスチャンネル一覧</h3>
                        <ul class="channel-list">
                            ${voiceChannels.slice(0, 10).map(ch => `
                                <li class="channel-item">
                                    <span class="channel-icon">🔊</span>
                                    <span class="channel-name">${this.escapeHtml(ch.name)}</span>
                                </li>
                            `).join('')}
                            ${voiceChannels.length > 10 ? `<li class="channel-item">... 他 ${voiceChannels.length - 10}個</li>` : ''}
                        </ul>
                    </div>
                    ` : ''}
                </div>
                
                <!-- サーバー設定タブ -->
                <div class="tab-content" data-tab="server-settings">
                    <div class="settings-section">
                        <h3>🔧 サーバー設定</h3>
                        <div class="settings-form">
                            <div class="form-group">
                                <label for="default-speaker">🗣️ デフォルト話者</label>
                                <select id="default-speaker" class="form-control">
                                    <option value="">選択してください</option>
                                    <option value="speaker1">話者1</option>
                                    <option value="speaker2">話者2</option>
                                    <option value="speaker3">話者3</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-speed">⚡ 速度</label>
                                <input type="range" id="default-speed" class="form-range" min="0.5" max="2.0" step="0.1" value="${settings.defaultSpeed || 1.0}">
                                <span class="range-value">${settings.defaultSpeed || 1.0}</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-pitch">🎵 ピッチ</label>
                                <input type="range" id="default-pitch" class="form-range" min="0.5" max="2.0" step="0.1" value="${settings.defaultPitch || 1.0}">
                                <span class="range-value">${settings.defaultPitch || 1.0}</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-volume">🔊 音量</label>
                                <input type="range" id="default-volume" class="form-range" min="0.0" max="2.0" step="0.1" value="${settings.defaultVolume || 1.0}">
                                <span class="range-value">${settings.defaultVolume || 1.0}</span>
                            </div>
                            
                            <div class="form-group checkbox-group">
                                <label>
                                    <input type="checkbox" id="auto-leave" ${settings.autoLeave ? 'checked' : ''}>
                                    <span>🚪 誰もいなくなったら自動退出</span>
                                </label>
                            </div>
                            
                            <div class="form-group checkbox-group">
                                <label>
                                    <input type="checkbox" id="ignore-bots" ${settings.ignoreBots ? 'checked' : ''}>
                                    <span>🤖 他のBotのメッセージを無視</span>
                                </label>
                            </div>
                            
                            <button id="save-server-settings" class="btn btn-primary">💾 設定を保存</button>
                        </div>
                    </div>
                </div>
                
                <!-- 辞書機能タブ -->
                <div class="tab-content" data-tab="dictionary">
                    <div class="settings-section">
                        <h3>📖 辞書機能</h3>
                        <p class="info-text">特定の単語の読み方をカスタマイズできます</p>
                        
                        <div class="dictionary-controls">
                            <button id="add-dictionary-entry" class="btn btn-success">➕ エントリーを追加</button>
                            <button id="save-dictionary" class="btn btn-primary">💾 辞書を保存</button>
                        </div>
                        
                        <div id="dictionary-list" class="dictionary-list">
                            <!-- 辞書エントリーがここに表示される -->
                        </div>
                    </div>
                </div>
                
                <!-- 個人設定タブ -->
                <div class="tab-content" data-tab="personal">
                    <div class="settings-section">
                        <h3>👤 個人設定</h3>
                        <p class="info-text">あなた専用の音声設定です</p>
                        
                        <div class="settings-form">
                            <div class="form-group">
                                <label for="personal-speaker">🗣️ 話者</label>
                                <select id="personal-speaker" class="form-control">
                                    <option value="">デフォルト設定を使用</option>
                                    <option value="speaker1">話者1</option>
                                    <option value="speaker2">話者2</option>
                                    <option value="speaker3">話者3</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-speed">⚡ 速度</label>
                                <input type="range" id="personal-speed" class="form-range" min="0.5" max="2.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-pitch">🎵 ピッチ</label>
                                <input type="range" id="personal-pitch" class="form-range" min="0.5" max="2.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-volume">🔊 音量</label>
                                <input type="range" id="personal-volume" class="form-range" min="0.0" max="2.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <button id="save-personal-settings" class="btn btn-primary">💾 個人設定を保存</button>
                            <button id="reset-personal-settings" class="btn btn-secondary">🔄 デフォルトに戻す</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // タブ切り替えイベント
        this.setupTabs();
        
        // レンジスライダーのリアルタイム更新
        this.setupRangeInputs();
        
        // サーバー設定の保存
        this.setupServerSettings(guildId);
        
        // 辞書機能の初期化
        this.setupDictionary(guildId);
        
        // 個人設定の初期化
        this.setupPersonalSettings(guildId);
        
        logger.success('Settings panel displayed with all features');
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // すべてのタブとコンテンツから active を削除
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // 選択されたタブとコンテンツに active を追加
                button.classList.add('active');
                document.querySelector(`.tab-content[data-tab="${targetTab}"]`).classList.add('active');
                
                logger.info(`[Dashboard] Switched to tab: ${targetTab}`);
            });
        });
    }

    setupRangeInputs() {
        const rangeInputs = document.querySelectorAll('.form-range');
        rangeInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const valueDisplay = e.target.nextElementSibling;
                if (valueDisplay && valueDisplay.classList.contains('range-value')) {
                    valueDisplay.textContent = e.target.value;
                }
            });
        });
    }

    setupServerSettings(guildId) {
        const saveBtn = document.getElementById('save-server-settings');
        if (!saveBtn) return;
        
        saveBtn.addEventListener('click', async () => {
            try {
                logger.info('[Dashboard] Saving server settings...');
                
                const settings = {
                    defaultSpeaker: document.getElementById('default-speaker').value,
                    defaultSpeed: parseFloat(document.getElementById('default-speed').value),
                    defaultPitch: parseFloat(document.getElementById('default-pitch').value),
                    defaultVolume: parseFloat(document.getElementById('default-volume').value),
                    autoLeave: document.getElementById('auto-leave').checked,
                    ignoreBots: document.getElementById('ignore-bots').checked
                };
                
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        guildId: guildId,
                        settings: settings
                    })
                });
                
                if (!response.ok) {
                    throw new Error('設定の保存に失敗しました');
                }
                
                const result = await response.json();
                logger.success('Server settings saved successfully');
                this.showSuccess('サーバー設定を保存しました');
                
            } catch (error) {
                logger.error('[Dashboard] Failed to save server settings: ' + error.message);
                this.showError('設定の保存に失敗しました: ' + error.message);
            }
        });
    }

    async setupDictionary(guildId) {
        try {
            logger.info('[Dashboard] Loading dictionary...');
            
            // 辞書データを取得
            const response = await fetch(`/api/dictionary/${guildId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('辞書の読み込みに失敗しました');
            }
            
            const data = await response.json();
            const dictionary = data.dictionary || [];
            
            logger.info(`[Dashboard] Dictionary loaded: ${dictionary.length} entries`);
            
            // 辞書エントリーを表示
            this.renderDictionary(dictionary);
            
            // 追加ボタンのイベント
            document.getElementById('add-dictionary-entry').addEventListener('click', () => {
                this.addDictionaryEntry();
            });
            
            // 保存ボタンのイベント
            document.getElementById('save-dictionary').addEventListener('click', async () => {
                await this.saveDictionary(guildId);
            });
            
        } catch (error) {
            logger.error('[Dashboard] Failed to setup dictionary: ' + error.message);
        }
    }

    renderDictionary(dictionary) {
        const listEl = document.getElementById('dictionary-list');
        if (!listEl) return;
        
        if (dictionary.length === 0) {
            listEl.innerHTML = '<p class="info-text">辞書エントリーがありません</p>';
            return;
        }
        
        listEl.innerHTML = dictionary.map((entry, index) => `
            <div class="dictionary-entry" data-index="${index}">
                <input type="text" class="dict-word" placeholder="単語" value="${this.escapeHtml(entry.word || '')}">
                <input type="text" class="dict-pronunciation" placeholder="読み方" value="${this.escapeHtml(entry.pronunciation || '')}">
                <button class="btn btn-danger btn-sm remove-entry" data-index="${index}">🗑️</button>
            </div>
        `).join('');
        
        // 削除ボタンのイベント
        document.querySelectorAll('.remove-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                dictionary.splice(index, 1);
                this.renderDictionary(dictionary);
            });
        });
    }

    addDictionaryEntry() {
        const listEl = document.getElementById('dictionary-list');
        if (!listEl) return;
        
        const entryHtml = `
            <div class="dictionary-entry new-entry">
                <input type="text" class="dict-word" placeholder="単語">
                <input type="text" class="dict-pronunciation" placeholder="読み方">
                <button class="btn btn-danger btn-sm remove-entry">🗑️</button>
            </div>
        `;
        
        if (listEl.querySelector('.info-text')) {
            listEl.innerHTML = entryHtml;
        } else {
            listEl.insertAdjacentHTML('beforeend', entryHtml);
        }
        
        // 削除ボタンのイベント
        const newEntry = listEl.querySelector('.new-entry');
        newEntry.querySelector('.remove-entry').addEventListener('click', () => {
            newEntry.remove();
        });
        
        newEntry.classList.remove('new-entry');
    }

    async saveDictionary(guildId) {
        try {
            logger.info('[Dashboard] Saving dictionary...');
            
            const entries = Array.from(document.querySelectorAll('.dictionary-entry')).map(entry => ({
                word: entry.querySelector('.dict-word').value.trim(),
                pronunciation: entry.querySelector('.dict-pronunciation').value.trim()
            })).filter(entry => entry.word && entry.pronunciation);
            
            const response = await fetch('/api/dictionary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    guildId: guildId,
                    dictionary: entries
                })
            });
            
            if (!response.ok) {
                throw new Error('辞書の保存に失敗しました');
            }
            
            const result = await response.json();
            logger.success(`Dictionary saved: ${result.validatedCount}/${result.totalCount} entries`);
            this.showSuccess('辞書を保存しました');
            
        } catch (error) {
            logger.error('[Dashboard] Failed to save dictionary: ' + error.message);
            this.showError('辞書の保存に失敗しました: ' + error.message);
        }
    }

    async setupPersonalSettings(guildId) {
        try {
            logger.info('[Dashboard] Loading personal settings...');
            
            // 個人設定を取得
            const response = await fetch(`/api/personal-settings?guildId=${guildId}&userId=${this.currentUserId}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const settings = data.settings || {};
                
                // フォームに設定を反映
                if (settings.speaker) {
                    document.getElementById('personal-speaker').value = settings.speaker;
                }
                if (settings.speed) {
                    document.getElementById('personal-speed').value = settings.speed;
                    document.querySelector('#personal-speed + .range-value').textContent = settings.speed;
                }
                if (settings.pitch) {
                    document.getElementById('personal-pitch').value = settings.pitch;
                    document.querySelector('#personal-pitch + .range-value').textContent = settings.pitch;
                }
                if (settings.volume) {
                    document.getElementById('personal-volume').value = settings.volume;
                    document.querySelector('#personal-volume + .range-value').textContent = settings.volume;
                }
                
                logger.info('[Dashboard] Personal settings loaded');
            }
            
            // 保存ボタンのイベント
            document.getElementById('save-personal-settings').addEventListener('click', async () => {
                await this.savePersonalSettings(guildId);
            });
            
            // リセットボタンのイベント
            document.getElementById('reset-personal-settings').addEventListener('click', () => {
                document.getElementById('personal-speaker').value = '';
                document.getElementById('personal-speed').value = 1.0;
                document.getElementById('personal-pitch').value = 1.0;
                document.getElementById('personal-volume').value = 1.0;
                
                document.querySelectorAll('.range-value').forEach(el => {
                    el.textContent = '1.0';
                });
                
                logger.info('[Dashboard] Personal settings reset to default');
            });
            
        } catch (error) {
            logger.error('[Dashboard] Failed to setup personal settings: ' + error.message);
        }
    }

    async savePersonalSettings(guildId) {
        try {
            logger.info('[Dashboard] Saving personal settings...');
            
            const settings = {
                speaker: document.getElementById('personal-speaker').value || null,
                speed: parseFloat(document.getElementById('personal-speed').value),
                pitch: parseFloat(document.getElementById('personal-pitch').value),
                volume: parseFloat(document.getElementById('personal-volume').value)
            };
            
            const response = await fetch('/api/personal-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    guildId: guildId,
                    userId: this.currentUserId,
                    settings: settings
                })
            });
            
            if (!response.ok) {
                throw new Error('個人設定の保存に失敗しました');
            }
            
            const result = await response.json();
            logger.success('Personal settings saved successfully');
            this.showSuccess('個人設定を保存しました');
            
        } catch (error) {
            logger.error('[Dashboard] Failed to save personal settings: ' + error.message);
            this.showError('個人設定の保存に失敗しました: ' + error.message);
        }
    }

    showSuccess(message) {
        logger.success('[Dashboard] Success: ' + message);
        
        const successEl = document.createElement('div');
        successEl.className = 'success-message';
        successEl.textContent = message;
        successEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(76, 175, 80, 0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(successEl);
        
        setTimeout(() => {
            successEl.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => successEl.remove(), 300);
        }, 3000);
    }

    // ...existing code...
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    // ログシステムを初期化
    logger.init();
    
    logger.info('[Dashboard] DOM loaded, initializing...');
    
    // ダッシュボードを初期化
    const dashboard = new Dashboard();
    dashboard.init();
});
