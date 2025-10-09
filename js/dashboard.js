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
            
            logger.success('[Dashboard] Initialization complete');
        } catch (error) {
            logger.error(`[Dashboard] Initialization failed: ${error.message}`);
            this.showToast('ダッシュボードの初期化に失敗しました', 'error');
        }
    }

    // ===================================
    // セッション管理
    // ===================================

    async checkSession() {
        const controller = new AbortController();
        this.abortControllers.set('session', controller);

        try {
            const response = await fetch('/api/session', {
                credentials: 'include',
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error('Session check failed');
            }
            
            const sessionData = await response.json();
            
            if (!sessionData.authenticated) {
                logger.warn('[Dashboard] Not authenticated, redirecting to login');
                window.location.href = '/login';
                return;
            }
            
            this.currentUserId = sessionData.user.id;
            this.displayUserInfo(sessionData.user);
            
            logger.info(`[Dashboard] Authenticated: ${sessionData.user.username}`);
        } catch (error) {
            if (error.name !== 'AbortError') {
                logger.error(`[Dashboard] Session check failed: ${error.message}`);
                window.location.href = '/login';
            }
        } finally {
            this.abortControllers.delete('session');
        }
    }

    displayUserInfo(user) {
        try {
            const userDisplay = document.getElementById('user-display');
            if (userDisplay) {
                const username = user.username || user.displayName || 'ユーザー';
                userDisplay.textContent = username;
            }
            
            const userAvatar = document.getElementById('user-avatar');
            if (userAvatar && user.avatar && user.id) {
                const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
                userAvatar.src = avatarUrl;
                userAvatar.alt = `${user.username}のアバター`;
            }
            
            logger.success('[Dashboard] User info displayed');
        } catch (error) {
            logger.error(`[Dashboard] Failed to display user info: ${error.message}`);
        }
    }

    // ===================================
    // サーバー管理
    // ===================================

    async loadServers() {
        const controller = new AbortController();
        this.abortControllers.set('servers', controller);

        try {
            logger.info('[Dashboard] Loading servers...');
            
            this.showLoading();
            
            const response = await fetch('/api/servers', {
                credentials: 'include',
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load servers: ${response.status}`);
            }
            
            this.servers = await response.json();
            
            logger.info(`[Dashboard] Loaded ${this.servers.length} servers`);
            
            this.renderServerList();
            
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.warn('[Dashboard] Server load cancelled');
            } else {
                logger.error(`[Dashboard] Failed to load servers: ${error.message}`);
                this.showToast('サーバー一覧の読み込みに失敗しました', 'error');
            }
        } finally {
            this.hideLoading();
            this.abortControllers.delete('servers');
        }
    }

    renderServerList() {
        const serverList = document.getElementById('server-list');
        if (!serverList) {
            logger.error('[Dashboard] server-list element not found');
            return;
        }
        
        serverList.innerHTML = '';
        
        if (this.servers.length === 0) {
            const noServers = document.createElement('li');
            noServers.className = 'no-servers';
            noServers.textContent = 'Botが参加しているサーバーがありません';
            serverList.appendChild(noServers);
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        this.servers.forEach(server => {
            const li = this.createServerElement(server);
            fragment.appendChild(li);
        });
        
        serverList.appendChild(fragment);
        
        logger.success(`[Dashboard] Rendered ${this.servers.length} servers`);
    }

    createServerElement(server) {
        const li = document.createElement('li');
        li.className = 'server-item';
        li.dataset.guildId = server.id;
        
        if (server.iconUrl) {
            const img = document.createElement('img');
            img.src = server.iconUrl;
            img.alt = `${server.name}のアイコン`;
            img.className = 'server-icon';
            img.onerror = function() {
                this.style.display = 'none';
                const fallback = this.nextElementSibling;
                if (fallback) fallback.style.display = 'flex';
            };
            li.appendChild(img);
        }
        
        const fallback = document.createElement('div');
        fallback.className = 'server-icon-fallback';
        fallback.style.display = server.iconUrl ? 'none' : 'flex';
        fallback.textContent = server.name.charAt(0).toUpperCase();
        li.appendChild(fallback);
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'server-info';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'server-name';
        nameDiv.textContent = server.name;
        
        const botInfo = document.createElement('div');
        botInfo.className = 'bot-info';
        botInfo.textContent = `Bot: ${server.botName}`;
        botInfo.style.fontSize = '0.85em';
        botInfo.style.color = '#666';
        botInfo.style.marginTop = '4px';
        
        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(botInfo);
        li.appendChild(infoDiv);
        
        li.addEventListener('click', () => {
            this.selectServer(server.id);
        });
        
        return li;
    }

    async selectServer(guildId) {
        if (this.loadingState.get(guildId)) {
            logger.warn(`[Dashboard] Server ${guildId} is already loading`);
            return;
        }

        logger.info(`[Dashboard] Selecting server: ${guildId}`);
        
        // UI更新
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`.server-item[data-guild-id="${guildId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        this.currentGuildId = guildId;
        
        await this.loadServerData(guildId);
    }

    async loadServerData(guildId) {
        this.loadingState.set(guildId, true);

        const controller = new AbortController();
        this.abortControllers.set(`guild-${guildId}`, controller);

        try {
            logger.info(`[Dashboard] Loading data for: ${guildId}`);
            
            this.showLoading();
            
            // 並列データ取得
            const [guildData, speakers] = await Promise.all([
                this.fetchGuildData(guildId, controller.signal),
                this.fetchSpeakers(controller.signal)
            ]);
            
            this.currentGuildData = guildData;
            this.speakers = speakers;
            
            // データを表示
            this.displayGuildData(guildData);
            this.displaySpeakers(speakers);
            this.displayChannels(guildData.channels || []);
            this.applySettings(guildData.settings || {});
            
            // 設定パネルを表示
            const settingsPanel = document.getElementById('settings-panel');
            if (settingsPanel) {
                settingsPanel.style.display = 'block';
            }
            
            logger.success(`[Dashboard] Data loaded for: ${guildId}`);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                logger.error(`[Dashboard] Failed to load data: ${error.message}`);
                this.showToast('サーバー情報の読み込みに失敗しました', 'error');
            }
        } finally {
            this.hideLoading();
            this.loadingState.delete(guildId);
            this.abortControllers.delete(`guild-${guildId}`);
        }
    }

    async fetchGuildData(guildId, signal) {
        const response = await fetch(`/api/guilds/${guildId}`, {
            credentials: 'include',
            signal
        });
        
        if (!response.ok) {
            throw new Error(`Guild data fetch failed: ${response.status}`);
        }
        
        return await response.json();
    }

    async fetchSpeakers(signal) {
        const response = await fetch('/api/speakers', {
            credentials: 'include',
            signal
        });
        
        if (response.ok) {
            return await response.json();
        }
        
        logger.warn('[Dashboard] Failed to fetch speakers, using empty array');
        return [];
    }

    // ===================================
    // データ表示
    // ===================================

    displayGuildData(guildData) {
        logger.info(`[Dashboard] Displaying guild data: ${guildData.name}`);
        
        this.setTextContent('guild-id', guildData.id);
        this.setTextContent('guild-name', guildData.name);
        
        const serverNameElement = document.getElementById('selected-server-name');
        if (serverNameElement) {
            serverNameElement.textContent = guildData.name;
        }
    }

    displayChannels(channels) {
        const voiceChannelSelect = document.getElementById('voice-channel-select');
        const textChannelSelect = document.getElementById('text-channel-select');
        
        if (!voiceChannelSelect || !textChannelSelect) {
            logger.error('[Dashboard] Channel select elements not found');
            return;
        }
        
        // ボイスチャンネル
        const voiceChannels = channels.filter(ch => ch.type === 2);
        voiceChannelSelect.innerHTML = '<option value="">選択してください</option>';
        voiceChannels.forEach(ch => {
            const option = document.createElement('option');
            option.value = ch.id;
            option.textContent = ch.name;
            voiceChannelSelect.appendChild(option);
        });
        
        // テキストチャンネル
        const textChannels = channels.filter(ch => ch.type === 0);
        textChannelSelect.innerHTML = '<option value="">選択してください</option>';
        textChannels.forEach(ch => {
            const option = document.createElement('option');
            option.value = ch.id;
            option.textContent = ch.name;
            textChannelSelect.appendChild(option);
        });
        
        logger.success(`[Dashboard] Displayed ${voiceChannels.length} voice and ${textChannels.length} text channels`);
    }

    displaySpeakers(speakers) {
        const selectIds = ['default-speaker', 'speaker-select', 'personal-speaker'];
        
        selectIds.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            
            select.innerHTML = '';
            
            if (speakers.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '話者が見つかりません';
                select.appendChild(option);
                select.disabled = true;
                return;
            }
            
            select.disabled = false;
            
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '選択してください';
            select.appendChild(placeholder);
            
            speakers.forEach(speaker => {
                const option = document.createElement('option');
                option.value = speaker.id;
                option.textContent = speaker.name || `Speaker ${speaker.id}`;
                select.appendChild(option);
            });
        });
        
        logger.success(`[Dashboard] Displayed ${speakers.length} speakers`);
    }

    applySettings(settings) {
        for (const [key, value] of Object.entries(settings)) {
            const elementId = `default-${this.camelToKebab(key)}`;
            const element = document.getElementById(elementId);
            
            if (!element) continue;
            
            if (element.type === 'checkbox') {
                element.checked = Boolean(value);
            } else if (element.type === 'range') {
                element.value = value;
                this.updateRangeDisplay(element);
            } else {
                element.value = value;
            }
        }
        
        logger.success('[Dashboard] Settings applied');
    }

    // ===================================
    // イベントハンドラー
    // ===================================

    setupEventListeners() {
        this.addClickListener('save-settings', () => this.saveSettings());
        this.addClickListener('save-personal', () => this.savePersonalSettings());
        this.addClickListener('save-dictionary', () => this.saveDictionarySettings());
        this.addClickListener('add-dictionary-entry', () => this.addDictionaryEntry());
        this.addClickListener('logout-btn', () => window.location.href = '/logout');
        
        this.setupSliderListeners();
    }

    setupSliderListeners() {
        const sliders = document.querySelectorAll('input[type="range"]');
        
        sliders.forEach(slider => {
            slider.addEventListener('input', () => {
                this.updateRangeDisplay(slider);
            });
        });
    }

    updateRangeDisplay(rangeElement) {
        const valueId = rangeElement.id.replace('default-', '') + '-value';
        const valueElement = document.getElementById(valueId);
        if (valueElement) {
            valueElement.textContent = rangeElement.value;
        }
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
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    async saveSettings() {
        if (!this.currentGuildId) {
            this.showToast('サーバーを選択してください', 'warn');
            return;
        }

        try {
            logger.info(`[Dashboard] Saving settings for: ${this.currentGuildId}`);
            
            const settings = this.collectSettings('default-');
            
            const response = await fetch(`/api/guilds/${this.currentGuildId}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ settings })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to save settings: ${response.status}`);
            }
            
            this.showToast('設定を保存しました', 'success');
            logger.success('[Dashboard] Settings saved');
            
        } catch (error) {
            logger.error(`[Dashboard] Failed to save settings: ${error.message}`);
            this.showToast('設定の保存に失敗しました', 'error');
        }
    }

    async savePersonalSettings() {
        logger.info('[Dashboard] Personal settings save not implemented');
        this.showToast('個人設定の保存機能は準備中です', 'info');
    }

    async saveDictionarySettings() {
        logger.info('[Dashboard] Dictionary settings save not implemented');
        this.showToast('辞書設定の保存機能は準備中です', 'info');
    }

    addDictionaryEntry() {
        logger.info('[Dashboard] Add dictionary entry not implemented');
        this.showToast('辞書エントリー追加機能は準備中です', 'info');
    }

    collectSettings(prefix) {
        const settings = {};
        const elements = document.querySelectorAll(`[id^="${prefix}"]`);
        
        elements.forEach(element => {
            const key = this.kebabToCamel(element.id.replace(prefix, ''));
            
            if (element.type === 'checkbox') {
                settings[key] = element.checked;
            } else if (element.type === 'range' || element.type === 'number') {
                settings[key] = parseFloat(element.value);
            } else {
                settings[key] = element.value;
            }
        });
        
        return settings;
    }

    // ===================================
    // ユーティリティ
    // ===================================

    setTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }

    addClickListener(elementId, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('click', handler);
        }
    }

    camelToKebab(str) {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    kebabToCamel(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    }

    showLoading() {
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }

    showToast(message, type = 'info', duration = 3500) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                right: 20px;
                top: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            min-width: 200px;
            padding: 10px 14px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            color: #fff;
            font-size: 14px;
            opacity: 0;
            transition: opacity 200ms ease, transform 200ms ease;
            background: ${this.getToastColor(type)};
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 220);
        }, duration);
    }

    getToastColor(type) {
        const colors = {
            success: '#28a745',
            error: '#d9534f',
            warn: '#ff9800',
            warning: '#ff9800',
            info: '#333'
        };
        return colors[type] || colors.info;
    }

    cleanup() {
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