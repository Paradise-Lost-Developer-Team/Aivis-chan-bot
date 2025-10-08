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
            userAvatarEl.onerror = () => {
                logger.warn('[Dashboard] Avatar load failed, using default');
                userAvatarEl.src = '/default-icon.svg';
            };
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
            
            const iconUrl = server.iconUrl || '/default-icon.svg';
            
            serverCard.innerHTML = `
                <img src="${iconUrl}" 
                     alt="${server.name}" 
                     class="server-icon"
                     onerror="this.src='/default-icon.svg'">
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
            // チャンネル一覧取得
            const channelsResp = await fetch(`/api/guilds/${guildId}`, {
                credentials: 'include'
            });
            
            if (!channelsResp.ok) {
                throw new Error(`チャンネル情報の取得に失敗しました (${channelsResp.status})`);
            }
            
            const channels = await channelsResp.json();
            logger.info(`[Dashboard] Channels loaded: ${channels.length}`);
            
            // 設定取得
            const settingsResp = await fetch(`/api/guilds/${guildId}/settings`, {
                credentials: 'include'
            });
            
            const settings = settingsResp.ok ? await settingsResp.json() : {};
            logger.info('[Dashboard] Settings loaded');
            
            // 設定画面を表示
            this.renderSettings(guildId, channels, settings);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to load server settings: ' + error.message);
            this.showError('サーバー設定の読み込みに失敗しました: ' + error.message);
        }
    }

    renderSettings(guildId, channels, settings) {
        logger.info(`[Dashboard] Rendering settings for: ${guildId}`);
        
        const settingsEl = document.getElementById('settings-panel');
        if (!settingsEl) {
            logger.error('[Dashboard] settings-panel element not found');
            return;
        }
        
        const server = this.servers.find(s => s.id === guildId);
        const serverName = server ? server.name : 'サーバー';
        
        // 設定UIを表示
        settingsEl.style.display = 'block';
        settingsEl.innerHTML = `
            <div class="settings-header">
                <h2>⚙️ ${this.escapeHtml(serverName)} の設定</h2>
            </div>
            <div class="settings-content">
                <div class="settings-section">
                    <h3>📊 サーバー情報</h3>
                    <p>チャンネル数: ${channels.length}</p>
                    <p>Bot: ${server?.botName || '不明'}</p>
                    ${server?.memberCount ? `<p>メンバー数: ${server.memberCount}人</p>` : ''}
                </div>
                
                <div class="settings-section">
                    <h3>🔧 基本設定</h3>
                    <p class="info-text">設定機能は開発中です。近日公開予定！</p>
                </div>
            </div>
        `;
        
        logger.success('Settings panel displayed');
    }

    showError(message) {
        logger.error('[Dashboard] Error: ' + message);
        
        // エラー表示UIを実装
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        errorEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(244, 67, 54, 0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(errorEl);
        
        setTimeout(() => {
            errorEl.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => errorEl.remove(), 300);
        }, 5000);
    }
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
