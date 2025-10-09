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
            
            logger.info('[Dashboard] Bot statistics loaded:', this.botStats.summary);
            
            this.displayBotStats();
            
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
        if (!this.botStats) {
            logger.warn('[Dashboard] No bot stats to display');
            return;
        }

        const { summary, bots } = this.botStats;

        // サマリー情報を表示
        this.setTextContent('total-bots', summary.totalBots);
        this.setTextContent('online-bots', summary.onlineBots);
        this.setTextContent('offline-bots', summary.offlineBots);
        this.setTextContent('total-guilds', summary.totalGuilds);
        this.setTextContent('total-voice-connections', summary.totalVoiceConnections);

        // Bot一覧を表示
        const botListContainer = document.getElementById('bot-list-container');
        if (botListContainer) {
            botListContainer.innerHTML = '';
            
            bots.forEach(bot => {
                const botCard = this.createBotStatsCard(bot);
                botListContainer.appendChild(botCard);
            });
        }

        // ステータスインジケーターを更新
        this.updateStatusIndicator(summary);

        logger.success('[Dashboard] Bot statistics displayed');
    }

    // Botステータスカードを作成
    createBotStatsCard(bot) {
        const card = document.createElement('div');
        card.className = `bot-stats-card ${bot.online ? 'online' : 'offline'}`;
        
        const statusBadge = bot.online ? 
            '<span class="status-badge online">🟢 オンライン</span>' : 
            '<span class="status-badge offline">🔴 オフライン</span>';

        if (bot.online && bot.stats) {
            card.innerHTML = `
                <div class="bot-stats-header">
                    <h4>${bot.name}</h4>
                    ${statusBadge}
                </div>
                <div class="bot-stats-body">
                    <div class="stat-item">
                        <span class="stat-label">サーバー数:</span>
                        <span class="stat-value">${bot.stats.serverCount || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">接続中VC:</span>
                        <span class="stat-value">${bot.stats.voiceConnectionCount || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">稼働時間:</span>
                        <span class="stat-value">${this.formatUptime(bot.stats.uptime)}</span>
                    </div>
                </div>
                <div class="bot-stats-footer">
                    <small>更新: ${new Date(bot.timestamp).toLocaleTimeString('ja-JP')}</small>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="bot-stats-header">
                    <h4>${bot.name}</h4>
                    ${statusBadge}
                </div>
                <div class="bot-stats-body">
                    <p class="error-message">⚠️ ${bot.error || '接続できません'}</p>
                </div>
                <div class="bot-stats-footer">
                    <small>更新: ${new Date(bot.timestamp).toLocaleTimeString('ja-JP')}</small>
                </div>
            `;
        }

        return card;
    }

    // 稼働時間をフォーマット
    formatUptime(seconds) {
        if (!seconds) return '不明';
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}日 ${hours}時間 ${minutes}分`;
        } else if (hours > 0) {
            return `${hours}時間 ${minutes}分`;
        } else {
            return `${minutes}分`;
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

// エラーハンドリングの改善
async function loadBotStats() {
  try {
    const response = await fetch('/api/bot-stats');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // データが正しく取得できているか確認
    console.log('Bot stats:', data);
    
    if (data && data.summary) {
      updateStatsDisplay(data.summary);
    } else {
      console.error('Invalid bot stats data:', data);
      showErrorMessage('統計情報の取得に失敗しました');
    }
  } catch (error) {
    console.error('Failed to load bot stats:', error);
    showErrorMessage('統計情報の取得中にエラーが発生しました');
  }
}

// サーバー一覧の読み込み
async function loadUserServers() {
  try {
    const response = await fetch('/api/user/servers');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    console.log('User servers:', data);
    
    if (data && Array.isArray(data.servers)) {
      displayServerList(data.servers);
    } else {
      console.error('Invalid server data:', data);
      showErrorMessage('サーバー一覧の取得に失敗しました');
    }
  } catch (error) {
    console.error('Failed to load user servers:', error);
    showErrorMessage('サーバー一覧の取得中にエラーが発生しました');
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