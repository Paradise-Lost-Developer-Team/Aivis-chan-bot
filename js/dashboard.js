/**
 * Aivis-chan Bot Dashboard
 * @version 3.0.0
 * 統合版 - すべての機能をDashboardクラスに集約
 */

'use strict';

// ===================================
// Custom Logger Class
// ===================================

class CustomLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.currentFilter = 'all';
        this.isInitialized = false;
        this.originalConsole = null;
    }

    init() {
        if (this.isInitialized) return;
        
        // Console のバックアップ
        this.originalConsole = {
            log: console.log.bind(console),
            error: console.error.bind(console),
            warn: console.warn.bind(console),
            info: console.info.bind(console)
        };

        // Console メソッドをオーバーライド
        const self = this;
        
        console.log = function(...args) {
            self.addLog('info', args.join(' '));
            self.originalConsole.log(...args);
        };

        console.error = function(...args) {
            self.addLog('error', args.join(' '));
            self.originalConsole.error(...args);
        };

        console.warn = function(...args) {
            self.addLog('warn', args.join(' '));
            self.originalConsole.warn(...args);
        };

        console.info = function(...args) {
            self.addLog('info', args.join(' '));
            self.originalConsole.info(...args);
        };

        this.setupLogViewer();
        this.isInitialized = true;
        
        this.addLog('success', 'カスタムログシステムが初期化されました');
    }

    addLog(level, message, source = null) {
        const logEntry = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
            level: level,
            message: String(message),
            source: source
        };

        this.logs.unshift(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        this.renderLogs();
    }

    setupLogViewer() {
        const filterButtons = document.querySelectorAll('.log-filter');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.currentFilter = button.dataset.level;
                this.renderLogs();
            });
        });

        const searchInput = document.getElementById('log-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.renderLogs(), 300);
            });
        }

        const clearButton = document.getElementById('clear-logs');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (confirm('すべてのログをクリアしますか？')) {
                    this.logs = [];
                    this.renderLogs();
                    this.addLog('info', 'ログがクリアされました');
                }
            });
        }

        const downloadButton = document.getElementById('download-logs');
        if (downloadButton) {
            downloadButton.addEventListener('click', () => this.downloadLogs());
        }
    }

    renderLogs() {
        const container = document.getElementById('log-container');
        if (!container) return;

        const searchTerm = document.getElementById('log-search')?.value.toLowerCase() || '';
        
        let filteredLogs = this.logs;
        
        if (this.currentFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === this.currentFilter);
        }
        
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

        const fragment = document.createDocumentFragment();
        const maxRender = Math.min(filteredLogs.length, 200);
        
        for (let i = 0; i < maxRender; i++) {
            const logElement = this.createLogElement(filteredLogs[i]);
            fragment.appendChild(logElement);
        }

        container.innerHTML = '';
        container.appendChild(fragment);

        if (filteredLogs.length > maxRender) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'log-more';
            moreDiv.textContent = `...他 ${filteredLogs.length - maxRender} 件`;
            container.appendChild(moreDiv);
        }
    }

    createLogElement(log) {
        const div = document.createElement('div');
        div.className = `log-entry ${log.level}`;
        div.dataset.level = log.level;

        const timestamp = log.timestamp.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'log-timestamp';
        timestampSpan.textContent = timestamp;

        const levelSpan = document.createElement('span');
        levelSpan.className = 'log-level';
        levelSpan.textContent = log.level.toUpperCase();

        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = log.message;

        div.appendChild(timestampSpan);
        div.appendChild(levelSpan);
        div.appendChild(messageSpan);

        return div;
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

    success(message) { this.addLog('success', message); }
    info(message) { this.addLog('info', message); }
    warn(message) { this.addLog('warn', message); }
    error(message) { this.addLog('error', message); }
}

// ===================================
// Dashboard Class (統合版)
// ===================================

class Dashboard {
    constructor() {
        this.servers = [];
        this.currentGuildId = null;
        this.currentGuildData = null;
        this.currentUserId = null;
        this.speakers = [];
        this.loadingState = new Map();
        this.abortControllers = new Map();
        this.botStats = null;
        this.statsInterval = null;
        
        this.init();
    }

    async init() {
        try {
            logger.info('[Dashboard] Initializing...');
            
            logger.init();
            
            await this.checkSession();
            
            this.setupEventListeners();
            this.setupTabNavigation();
            
            await this.loadServers();
            
            // Bot統計を読み込み
            await this.loadBotStats();
            
            // 30秒ごとに統計を更新
            this.statsInterval = setInterval(() => {
                this.loadBotStats();
            }, 30000);
            
            logger.success('[Dashboard] Initialization complete');
        } catch (error) {
            logger.error(`[Dashboard] Initialization failed: ${error.message}`);
            this.showToast('ダッシュボードの初期化に失敗しました', 'error');
        }
    }

    // セッションチェック
    async checkSession() {
        try {
            const response = await fetch('/api/user/session', {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Not authenticated');
            }
            
            const data = await response.json();
            this.currentUserId = data.user?.id;
            
            logger.info(`[Dashboard] User authenticated: ${this.currentUserId}`);
        } catch (error) {
            logger.error(`[Dashboard] Session check failed: ${error.message}`);
            window.location.href = '/login';
        }
    }

    // イベントリスナーの設定
    setupEventListeners() {
        // ログアウトボタン
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // 検索機能
        const searchInput = document.getElementById('server-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterServers(e.target.value);
            });
        }
    }

    // タブナビゲーションの設定
    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;

                // すべてのタブとペインから active を削除
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));

                // クリックされたタブとペインに active を追加
                button.classList.add('active');
                const targetPane = document.getElementById(`${targetTab}-tab`);
                if (targetPane) {
                    targetPane.classList.add('active');
                }

                logger.info(`[Dashboard] Switched to tab: ${targetTab}`);
            });
        });
    }

    // サーバー一覧を読み込む
    async loadServers() {
        try {
            logger.info('[Dashboard] Loading user servers...');
            
            const response = await fetch('/api/user/servers', {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            logger.info(`[Dashboard] Loaded ${data.servers?.length || 0} servers`);
            
            if (data && Array.isArray(data.servers)) {
                this.servers = data.servers;
                this.displayServerList(data.servers);
            } else {
                logger.error('[Dashboard] Invalid server data:', data);
                this.showToast('サーバー一覧の取得に失敗しました', 'error');
            }
        } catch (error) {
            logger.error(`[Dashboard] Failed to load servers: ${error.message}`);
            this.showToast('サーバー一覧の取得中にエラーが発生しました', 'error');
        }
    }

    // サーバー一覧を表示
    displayServerList(servers) {
        const container = document.getElementById('server-list-container');
        if (!container) {
            logger.warn('[Dashboard] Server list container not found');
            return;
        }

        if (!servers || servers.length === 0) {
            container.innerHTML = '<div class="no-servers">参加しているサーバーがありません</div>';
            return;
        }

        container.innerHTML = '';
        
        servers.forEach(server => {
            const serverCard = this.createServerCard(server);
            container.appendChild(serverCard);
        });

        logger.success(`[Dashboard] Displayed ${servers.length} servers`);
    }

    // サーバーカードを作成
    createServerCard(server) {
        const card = document.createElement('div');
        card.className = 'server-card';
        card.dataset.serverId = server.id;

        const iconUrl = server.iconUrl || '/images/default-server-icon.png';

        card.innerHTML = `
            <div class="server-icon">
                <img src="${iconUrl}" alt="${server.name}" onerror="this.src='/images/default-server-icon.png'">
            </div>
            <div class="server-info">
                <h3 class="server-name">${this.escapeHtml(server.name)}</h3>
                <p class="server-bot">Bot: ${server.botName || '不明'}</p>
            </div>
            <button class="server-manage-btn" data-guild-id="${server.id}">
                設定
            </button>
        `;

        const manageBtn = card.querySelector('.server-manage-btn');
        manageBtn.addEventListener('click', () => {
            this.selectServer(server.id);
        });

        return card;
    }

    // サーバーを選択
    async selectServer(guildId) {
        this.currentGuildId = guildId;
        logger.info(`[Dashboard] Selected server: ${guildId}`);
        
        // サーバー設定タブに切り替え
        const serverSettingsTab = document.querySelector('[data-tab="server-settings"]');
        if (serverSettingsTab) {
            serverSettingsTab.click();
        }

        // サーバー設定を読み込む
        await this.loadGuildSettings(guildId);
    }

    // ギルド設定を読み込む
    async loadGuildSettings(guildId) {
        try {
            logger.info(`[Dashboard] Loading settings for guild: ${guildId}`);
            
            const response = await fetch(`/api/guild/${guildId}/settings`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.currentGuildData = await response.json();
            
            this.displayGuildSettings();
            
            logger.success(`[Dashboard] Loaded settings for guild: ${guildId}`);
        } catch (error) {
            logger.error(`[Dashboard] Failed to load guild settings: ${error.message}`);
            this.showToast('サーバー設定の取得に失敗しました', 'error');
        }
    }

    // ギルド設定を表示
    displayGuildSettings() {
        if (!this.currentGuildData) {
            logger.warn('[Dashboard] No guild data to display');
            return;
        }

        // ここに設定表示のロジックを追加
        logger.info('[Dashboard] Displaying guild settings');
    }

    // サーバーをフィルター
    filterServers(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        
        if (!term) {
            this.displayServerList(this.servers);
            return;
        }

        const filtered = this.servers.filter(server => 
            server.name.toLowerCase().includes(term)
        );

        this.displayServerList(filtered);
        logger.info(`[Dashboard] Filtered servers: ${filtered.length}/${this.servers.length}`);
    }

    // Bot統計を読み込む
    async loadBotStats() {
        const controller = new AbortController();
        this.abortControllers.set('bot-stats', controller);

        try {
            logger.info('[Dashboard] Loading bot statistics...');
            
            const response = await fetch('/api/bot-stats', {
                credentials: 'include',
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load bot stats: ${response.status}`);
            }
            
            this.botStats = await response.json();
            
            logger.info('[Dashboard] Bot statistics loaded');
            
            if (this.botStats && this.botStats.summary) {
                this.displayBotStats();
            } else {
                logger.warn('[Dashboard] Invalid bot stats data received');
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.warn('[Dashboard] Bot stats load cancelled');
            } else {
                logger.error(`[Dashboard] Failed to load bot stats: ${error.message}`);
            }
        } finally {
            this.abortControllers.delete('bot-stats');
        }
    }

    // Bot統計を表示
    displayBotStats() {
        if (!this.botStats || !this.botStats.summary) {
            logger.warn('[Dashboard] No bot stats to display');
            return;
        }

        const { summary, bots } = this.botStats;

        // サマリー情報を表示
        this.setTextContent('total-servers', summary.totalGuilds || 0);
        this.setTextContent('total-users', '計算中...');
        this.setTextContent('online-bots', summary.onlineBots || 0);
        this.setTextContent('vc-connections', summary.totalVoiceConnections || 0);

        // ステータスインジケーターを更新
        this.updateStatusIndicator(summary);

        logger.success('[Dashboard] Bot statistics displayed');
    }

    // テキストコンテンツを設定（安全に）
    setTextContent(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    // ステータスインジケーターを更新
    updateStatusIndicator(summary) {
        const indicator = document.getElementById('status-indicator');
        if (!indicator) return;

        const percentage = summary.totalBots > 0 ? 
            Math.round((summary.onlineBots / summary.totalBots) * 100) : 0;

        let status = 'critical';
        let message = 'システム異常';

        if (percentage === 100) {
            status = 'healthy';
            message = '全システム正常';
        } else if (percentage >= 75) {
            status = 'warning';
            message = '一部システム停止';
        } else if (percentage >= 50) {
            status = 'degraded';
            message = 'システム性能低下';
        }

        indicator.className = `status-indicator status-${status}`;
        indicator.innerHTML = `
            <span class="status-icon">●</span>
            <span class="status-text">${message}</span>
            <span class="status-detail">(${summary.onlineBots}/${summary.totalBots} Bot稼働中)</span>
        `;
    }

    // HTMLエスケープ
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // トースト通知
    showToast(message, type = 'info') {
        // トースト実装（省略可能）
        console.log(`[Toast ${type}]`, message);
    }

    // ログアウト
    async logout() {
        try {
            await fetch('/logout', {
                method: 'POST',
                credentials: 'include'
            });
            window.location.href = '/';
        } catch (error) {
            logger.error(`[Dashboard] Logout failed: ${error.message}`);
        }
    }

    cleanup() {
        // 統計更新を停止
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        this.abortControllers.forEach(controller => {
            controller.abort();
        });
        this.abortControllers.clear();
        
        logger.info('[Dashboard] Cleanup complete');
    }
}

// ===================================
// Initialization
// ===================================

const logger = new CustomLogger();
let dashboard;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        dashboard = new Dashboard();
    });
} else {
    dashboard = new Dashboard();
}

window.addEventListener('beforeunload', () => {
    if (dashboard) {
        dashboard.cleanup();
    }
});