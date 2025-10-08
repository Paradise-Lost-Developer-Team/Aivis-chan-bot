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
        this.currentGuildId = null;
        this.servers = [];
        this.guildUpdateInterval = null;
        
        console.log('[Dashboard] Constructor initialized');
    }

    async init() {
        console.log('[Dashboard] Initializing...');
        
        try {
            // セッション確認
            const sessionResp = await fetch('/api/session', {
                credentials: 'include'
            });
            
            if (!sessionResp.ok) {
                console.error('[Dashboard] Session check failed:', sessionResp.status);
                window.location.href = '/login';
                return;
            }
            
            const sessionData = await sessionResp.json();
            console.log('[Dashboard] Session data:', sessionData);
            
            if (!sessionData.authenticated) {
                console.warn('[Dashboard] Not authenticated');
                window.location.href = '/login';
                return;
            }
            
            // ユーザー情報表示
            this.displayUserInfo(sessionData.user);
            
            // サーバー一覧読み込み
            await this.loadServers();
            
            // 定期更新開始（メソッドが存在する場合のみ）
            if (typeof this.startGuildUpdates === 'function') {
                this.startGuildUpdates();
            }
            
        } catch (error) {
            console.error('[Dashboard] Init error:', error);
            this.showError('初期化に失敗しました: ' + error.message);
        }
    }

    displayUserInfo(user) {
        console.log('[Dashboard] Displaying user info:', user);
        
        const userNameEl = document.getElementById('user-name');
        const userAvatarEl = document.getElementById('user-avatar');
        
        if (userNameEl) {
            userNameEl.textContent = user.username || 'Unknown';
        }
        
        if (userAvatarEl && user.avatarUrl) {
            userAvatarEl.src = user.avatarUrl;
            userAvatarEl.onerror = () => {
                console.warn('[Dashboard] Avatar load failed, using default');
                userAvatarEl.src = '/default-icon.svg';
            };
        }
        
        console.log('[Dashboard] User info displayed');
    }

    async loadServers() {
        console.log('[Dashboard] Loading servers...');
        
        try {
            const response = await fetch('/api/servers', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            console.log('[Dashboard] /api/servers response:', {
                status: response.status,
                ok: response.ok,
                statusText: response.statusText
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Dashboard] Server list error:', {
                    status: response.status,
                    body: errorText
                });
                throw new Error(`サーバー一覧の取得に失敗しました (${response.status})`);
            }
            
            const servers = await response.json();
            
            console.log('[Dashboard] Servers loaded:', {
                isArray: Array.isArray(servers),
                count: servers.length,
                sample: servers.slice(0, 3)
            });
            
            if (!Array.isArray(servers)) {
                console.error('[Dashboard] Invalid servers format:', servers);
                throw new Error('サーバーデータの形式が不正です');
            }
            
            this.servers = servers;
            
            if (servers.length === 0) {
                console.warn('[Dashboard] No servers returned');
                this.showNoServersMessage();
                return;
            }
            
            this.renderServerList(servers);
            
        } catch (error) {
            console.error('[Dashboard] Failed to load servers:', error);
            this.showError('サーバー一覧の読み込みに失敗しました: ' + error.message);
        }
    }

    showNoServersMessage() {
        const serverListEl = document.getElementById('server-list');
        if (!serverListEl) {
            console.warn('[Dashboard] server-list element not found');
            return;
        }
        
        serverListEl.innerHTML = `
            <div class="no-servers-message">
                <div class="icon">🤖</div>
                <h3>Botが参加しているサーバーが見つかりません</h3>
                <p>以下の点を確認してください：</p>
                <ul>
                    <li>Botがサーバーに参加していますか？</li>
                    <li>サーバーの管理権限を持っていますか？</li>
                    <li>Discord側で認証を許可しましたか？</li>
                </ul>
                <button onclick="location.reload()" class="reload-btn">
                    🔄 再読み込み
                </button>
            </div>
        `;
    }

    renderServerList(servers) {
        console.log('[Dashboard] Rendering server list:', servers.length);
        
        const serverListEl = document.getElementById('server-list');
        if (!serverListEl) {
            console.error('[Dashboard] server-list element not found');
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
        
        console.log('[Dashboard] Server list rendered');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async selectServer(guildId) {
        console.log('[Dashboard] Selecting server:', guildId);
        
        this.currentGuildId = guildId;
        
        // サーバーカードのアクティブ状態を更新
        document.querySelectorAll('.server-card').forEach(card => {
            card.classList.remove('active');
            if (card.dataset.serverId === guildId) {
                card.classList.add('active');
            }
        });
        
        // サーバー設定を読み込む
        await this.loadServerSettings(guildId);
    }

    async loadServerSettings(guildId) {
        console.log('[Dashboard] Loading settings for:', guildId);
        
        try {
            // チャンネル一覧取得
            const channelsResp = await fetch(`/api/guilds/${guildId}`, {
                credentials: 'include'
            });
            
            if (!channelsResp.ok) {
                throw new Error(`チャンネル情報の取得に失敗しました (${channelsResp.status})`);
            }
            
            const channels = await channelsResp.json();
            console.log('[Dashboard] Channels loaded:', channels.length);
            
            // 設定取得
            const settingsResp = await fetch(`/api/guilds/${guildId}/settings`, {
                credentials: 'include'
            });
            
            const settings = settingsResp.ok ? await settingsResp.json() : {};
            console.log('[Dashboard] Settings loaded:', settings);
            
            // 設定画面を表示
            this.renderSettings(guildId, channels, settings);
            
        } catch (error) {
            console.error('[Dashboard] Failed to load server settings:', error);
            this.showError('サーバー設定の読み込みに失敗しました: ' + error.message);
        }
    }

    renderSettings(guildId, channels, settings) {
        console.log('[Dashboard] Rendering settings for:', guildId);
        
        const settingsEl = document.getElementById('settings-panel');
        if (!settingsEl) {
            console.error('[Dashboard] settings-panel element not found');
            return;
        }
        
        // 設定UIを表示
        settingsEl.style.display = 'block';
        settingsEl.innerHTML = `
            <h2>サーバー設定</h2>
            <div class="settings-content">
                <p>チャンネル数: ${channels.length}</p>
                <!-- ここに設定UIを追加 -->
            </div>
        `;
    }

    showError(message) {
        console.error('[Dashboard] Error:', message);
        
        // エラー表示UIを実装
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        errorEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
        `;
        
        document.body.appendChild(errorEl);
        
        setTimeout(() => {
            errorEl.remove();
        }, 5000);
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Dashboard] DOM loaded, initializing...');
    const dashboard = new Dashboard();
    dashboard.init();
});
