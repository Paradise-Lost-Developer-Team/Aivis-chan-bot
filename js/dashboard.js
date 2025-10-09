/**
 * Aivis-chan Bot Dashboard
 * @version 2.0.0
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
        
        // ログ数を制限
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        this.renderLogs();
    }

    setupLogViewer() {
        // フィルターボタン
        const filterButtons = document.querySelectorAll('.log-filter');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.currentFilter = button.dataset.level;
                this.renderLogs();
            });
        });

        // 検索
        const searchInput = document.getElementById('log-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.renderLogs(), 300);
            });
        }

        // クリアボタン
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

        // ダウンロードボタン
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
        
        // レベルフィルター
        if (this.currentFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === this.currentFilter);
        }
        
        // 検索フィルター
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

        // パフォーマンス最適化: DocumentFragment使用
        const fragment = document.createDocumentFragment();
        const maxRender = Math.min(filteredLogs.length, 200); // 最大200件まで表示
        
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

    // パブリックメソッド
    success(message) { this.addLog('success', message); }
    info(message) { this.addLog('info', message); }
    warn(message) { this.addLog('warn', message); }
    error(message) { this.addLog('error', message); }
}

// ===================================
// Dashboard Class
// ===================================

class Dashboard {
    constructor() {
        this.servers = [];
        this.currentGuildId = null;
        this.currentUserId = null;
        this.serversLoaded = false;
        this.loadingState = new Map(); // 読み込み状態を管理
        this.abortControllers = new Map(); // リクエストのキャンセル管理
        
        this.init();
    }

    async init() {
        try {
            logger.info('[Dashboard] Initializing...');
            
            // ログシステムを初期化
            logger.init();
            
            // セッション状態を確認
            await this.checkSession();
            
            // イベントリスナーを設定
            this.setupEventListeners();
            
            // タブナビゲーションを設定
            this.setupTabNavigation();
            
            // サーバー一覧を読み込み
            await this.loadServers();
            
            logger.success('[Dashboard] Initialization complete');
        } catch (error) {
            logger.error(`[Dashboard] Initialization failed: ${error.message}`);
            this.showError('ダッシュボードの初期化に失敗しました');
        }
    }

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
                logger.warn('[Dashboard] Not authenticated');
                window.location.href = '/login';
                return;
            }
            
            this.currentUserId = sessionData.user.id;
            this.displayUserInfo(sessionData.user);
            
            logger.info(`[Dashboard] Authenticated: ${this.currentUserId}`);
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

    async loadServers() {
        if (this.serversLoaded) return;

        const controller = new AbortController();
        this.abortControllers.set('servers', controller);

        try {
            logger.info('[Dashboard] Loading servers...');
            
            const response = await fetch('/api/servers', {
                credentials: 'include',
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load servers: ${response.status}`);
            }
            
            this.servers = await response.json();
            this.serversLoaded = true;
            
            logger.info(`[Dashboard] Loaded ${this.servers.length} servers`);
            
            this.renderServerList();
            
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.warn('[Dashboard] Server load cancelled');
            } else {
                logger.error(`[Dashboard] Failed to load servers: ${error.message}`);
                this.showError('サーバー一覧の読み込みに失敗しました');
            }
        } finally {
            this.abortControllers.delete('servers');
        }
    }

    renderServerList() {
        const serverList = document.getElementById('server-list');
        if (!serverList) return;
        
        if (this.servers.length === 0) {
            serverList.innerHTML = '<li class="no-servers">サーバーが見つかりませんでした</li>';
            return;
        }
        
        // DocumentFragmentを使用してパフォーマンス向上
        const fragment = document.createDocumentFragment();
        
        this.servers.forEach(server => {
            const li = this.createServerElement(server);
            fragment.appendChild(li);
        });
        
        serverList.innerHTML = '';
        serverList.appendChild(fragment);
        
        logger.success(`[Dashboard] Rendered ${this.servers.length} servers`);
    }

    createServerElement(server) {
        const li = document.createElement('li');
        li.className = 'server-item';
        li.dataset.guildId = server.id;
        
        // サーバーアイコン
        if (server.iconUrl) {
            const img = document.createElement('img');
            img.src = server.iconUrl;
            img.alt = `${server.name}のアイコン`;
            img.className = 'server-icon';
            img.onerror = function() {
                this.style.display = 'none';
                this.nextElementSibling.style.display = 'flex';
            };
            li.appendChild(img);
        }
        
        // フォールバックアイコン
        const fallback = document.createElement('div');
        fallback.className = 'server-icon-fallback';
        fallback.style.display = server.iconUrl ? 'none' : 'flex';
        fallback.textContent = server.name.charAt(0).toUpperCase();
        li.appendChild(fallback);
        
        // サーバー情報
        const infoDiv = document.createElement('div');
        infoDiv.className = 'server-info';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'server-name';
        nameDiv.textContent = server.name;
        
        infoDiv.appendChild(nameDiv);
        li.appendChild(infoDiv);
        
        // クリックイベント
        li.addEventListener('click', () => {
            this.selectServer(server.id);
        });
        
        return li;
    }

    async selectServer(guildId) {
        // 重複読み込み防止
        if (this.loadingState.get(guildId)) {
            logger.warn(`[Dashboard] Server ${guildId} is already loading`);
            return;
        }

        logger.info(`[Dashboard] Selecting server: ${guildId}`);
        
        // 選択状態を更新
        document.querySelectorAll('.server-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`.server-item[data-guild-id="${guildId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        this.currentGuildId = guildId;
        
        // サーバー設定をロード
        await this.loadServerSettings(guildId);
    }

    async loadServerSettings(guildId) {
        this.loadingState.set(guildId, true);

        const controller = new AbortController();
        this.abortControllers.set(`settings-${guildId}`, controller);

        try {
            logger.info(`[Dashboard] Loading settings for: ${guildId}`);
            
            // 並行してデータを取得
            const [guildData, settingsData, speakers] = await Promise.all([
                this.fetchGuildInfo(guildId, controller.signal),
                this.fetchSettings(guildId, controller.signal),
                this.fetchSpeakers(controller.signal)
            ]);
            
            this.renderSettings(guildId, guildData, settingsData, speakers);
            
            logger.success(`[Dashboard] Settings loaded for: ${guildId}`);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                logger.error(`[Dashboard] Failed to load settings: ${error.message}`);
                this.showError('サーバー設定の読み込みに失敗しました');
            }
        } finally {
            this.loadingState.delete(guildId);
            this.abortControllers.delete(`settings-${guildId}`);
        }
    }

    async fetchGuildInfo(guildId, signal) {
        const response = await fetch(`/api/guilds/${guildId}`, {
            credentials: 'include',
            signal
        });
        
        if (!response.ok) {
            throw new Error(`Guild info fetch failed: ${response.status}`);
        }
        
        return await response.json();
    }

    async fetchSettings(guildId, signal) {
        const response = await fetch(`/api/settings/${guildId}`, {
            credentials: 'include',
            signal
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.settings || {};
        }
        
        return {};
    }

    async fetchSpeakers(signal) {
        const response = await fetch('/api/speakers', {
            credentials: 'include',
            signal
        });
        
        if (response.ok) {
            return await response.json();
        }
        
        return [];
    }

    renderSettings(guildId, guildData, settings, speakers) {
        // ギルド情報を表示
        this.setTextContent('guild-id', guildData.id);
        this.setTextContent('guild-name', guildData.name);
        
        // 設定値を適用
        this.applySettings(settings);
        
        // 話者セレクトを更新
        this.updateSpeakerSelect(speakers);
    }

    setTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
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
                this.updateRangeValue(element);
            } else {
                element.value = value;
            }
        }
    }

    camelToKebab(str) {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    updateRangeValue(rangeElement) {
        const valueId = rangeElement.id.replace('default-', '') + '-value';
        const valueElement = document.getElementById(valueId);
        if (valueElement) {
            valueElement.textContent = rangeElement.value;
        }
    }

    updateSpeakerSelect(speakers) {
        const selectIds = ['default-speaker', 'personal-speaker'];
        
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
            
            // プレースホルダー
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '（選択してください）';
            select.appendChild(placeholder);
            
            // 話者オプション
            speakers.forEach(speaker => {
                const option = document.createElement('option');
                option.value = speaker.id;
                option.textContent = speaker.name || speaker.id;
                select.appendChild(option);
            });
        });
    }

    setupEventListeners() {
        // 設定保存
        this.addClickListener('save-settings', () => this.saveSettings());
        this.addClickListener('save-personal', () => this.savePersonalSettings());
        this.addClickListener('save-dictionary', () => this.saveDictionarySettings());
        
        // 辞書エントリー追加
        this.addClickListener('add-dictionary-entry', () => this.addDictionaryEntry());
        
        // ログアウト
        this.addClickListener('logout-btn', () => {
            window.location.href = '/logout';
        });
        
        // レンジスライダー
        this.setupSliderValues();
    }

    addClickListener(elementId, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('click', handler);
        }
    }

    setupSliderValues() {
        const sliders = document.querySelectorAll('input[type="range"]');
        
        sliders.forEach(slider => {
            const valueId = slider.id.replace('default-', '') + '-value';
            const valueDisplay = document.getElementById(valueId);
            
            if (!valueDisplay) return;
            
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
        });
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
        // タブのアクティブ状態
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // コンテンツの表示
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    showError(message) {
        this.showToast(message, 'error');
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

    // クリーンアップ（ページ離脱時）
    cleanup() {
        // すべてのリクエストをキャンセル
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

// DOM読み込み完了後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        dashboard = new Dashboard();
    });
} else {
    dashboard = new Dashboard();
}

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (dashboard) {
        dashboard.cleanup();
    }
});

// サーバー一覧の読み込み
async function loadServers() {
  try {
    const response = await fetch('/api/servers');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const servers = await response.json();
    console.log('[Dashboard] Loaded servers:', servers.length);
    
    displayServers(servers);
  } catch (error) {
    console.error('[Dashboard] Failed to load servers:', error);
    showError('サーバー一覧の読み込みに失敗しました');
  }
}

// サーバー一覧の表示
function displayServers(servers) {
  const serverList = document.getElementById('server-list');
  
  if (!serverList) {
    console.error('[Dashboard] server-list element not found');
    return;
  }
  
  serverList.innerHTML = '';
  
  if (servers.length === 0) {
    serverList.innerHTML = '<p class="no-servers">Botが参加しているサーバーがありません</p>';
    return;
  }
  
  servers.forEach(server => {
    const serverCard = createServerCard(server);
    serverList.appendChild(serverCard);
  });
}

// サーバーカードの作成
function createServerCard(server) {
  const card = document.createElement('div');
  card.className = 'server-card';
  card.dataset.serverId = server.id;
  
  // アイコン
  const icon = document.createElement('img');
  icon.className = 'server-icon';
  icon.src = server.iconUrl || '/images/default-server-icon.png';
  icon.alt = server.name;
  icon.onerror = () => {
    icon.src = '/images/default-server-icon.png';
  };
  
  // サーバー名
  const name = document.createElement('div');
  name.className = 'server-name';
  name.textContent = server.name;
  
  // Bot情報
  const botInfo = document.createElement('div');
  botInfo.className = 'bot-info';
  botInfo.textContent = `Bot: ${server.botName}`;
  
  card.appendChild(icon);
  card.appendChild(name);
  card.appendChild(botInfo);
  
  // クリックイベント
  card.addEventListener('click', () => selectServer(server.id));
  
  return card;
}

// サーバー選択
async function selectServer(serverId) {
  try {
    console.log('[Dashboard] Selecting server:', serverId);
    
    // 選択状態のUI更新
    document.querySelectorAll('.server-card').forEach(card => {
      card.classList.remove('selected');
    });
    
    const selectedCard = document.querySelector(`[data-server-id="${serverId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('selected');
    }
    
    // ローディング表示
    showLoading();
    
    // サーバー情報の読み込み
    const [guildData, speakers] = await Promise.all([
      loadGuildData(serverId),
      loadSpeakers()
    ]);
    
    // データの表示
    displayGuildData(guildData);
    displaySpeakers(speakers);
    
    // 設定パネルを表示
    document.getElementById('settings-panel').style.display = 'block';
    
    hideLoading();
  } catch (error) {
    console.error('[Dashboard] Failed to select server:', error);
    showError('サーバー情報の読み込みに失敗しました');
    hideLoading();
  }
}

// ギルドデータの読み込み
async function loadGuildData(guildId) {
  const response = await fetch(`/api/guilds/${guildId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to load guild data: ${response.status}`);
  }
  
  return await response.json();
}

// 話者一覧の読み込み
async function loadSpeakers() {
  const response = await fetch('/api/speakers');
  
  if (!response.ok) {
    throw new Error(`Failed to load speakers: ${response.status}`);
  }
  
  return await response.json();
}

// ギルドデータの表示
function displayGuildData(guildData) {
  console.log('[Dashboard] Displaying guild data:', guildData);
  
  // サーバー名の表示
  const serverNameElement = document.getElementById('selected-server-name');
  if (serverNameElement) {
    serverNameElement.textContent = guildData.name;
  }
  
  // チャンネル一覧の表示
  displayChannels(guildData.channels || []);
  
  // 設定値の表示
  displaySettings(guildData.settings || {});
  
  // 現在の状態を保存
  window.currentGuildId = guildData.id;
  window.currentGuildData = guildData;
}

// チャンネル一覧の表示
function displayChannels(channels) {
  const voiceChannelSelect = document.getElementById('voice-channel-select');
  const textChannelSelect = document.getElementById('text-channel-select');
  
  if (!voiceChannelSelect || !textChannelSelect) {
    console.error('[Dashboard] Channel select elements not found');
    return;
  }
  
  // ボイスチャンネルのフィルタリングと表示
  const voiceChannels = channels.filter(ch => ch.type === 2); // GUILD_VOICE
  voiceChannelSelect.innerHTML = '<option value="">選択してください</option>';
  voiceChannels.forEach(ch => {
    const option = document.createElement('option');
    option.value = ch.id;
    option.textContent = ch.name;
    voiceChannelSelect.appendChild(option);
  });
  
  // テキストチャンネルのフィルタリングと表示
  const textChannels = channels.filter(ch => ch.type === 0); // GUILD_TEXT
  textChannelSelect.innerHTML = '<option value="">選択してください</option>';
  textChannels.forEach(ch => {
    const option = document.createElement('option');
    option.value = ch.id;
    option.textContent = ch.name;
    textChannelSelect.appendChild(option);
  });
  
  console.log(`[Dashboard] Displayed ${voiceChannels.length} voice channels and ${textChannels.length} text channels`);
}

// 話者一覧の表示
function displaySpeakers(speakers) {
  const speakerSelect = document.getElementById('speaker-select');
  
  if (!speakerSelect) {
    console.error('[Dashboard] Speaker select element not found');
    return;
  }
  
  speakerSelect.innerHTML = '<option value="">選択してください</option>';
  
  speakers.forEach(speaker => {
    const option = document.createElement('option');
    option.value = speaker.id;
    option.textContent = speaker.name;
    speakerSelect.appendChild(option);
  });
  
  console.log(`[Dashboard] Displayed ${speakers.length} speakers`);
}

// エラー表示
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    
    setTimeout(() => {
      errorDiv.classList.remove('show');
    }, 5000);
  }
  
  console.error('[Dashboard] Error:', message);
}

// ローディング表示
function showLoading() {
  const loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = 'flex';
  }
}

// ローディング非表示
function hideLoading() {
  const loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Dashboard] Initializing...');
  
  try {
    // セッション確認
    const sessionResponse = await fetch('/api/session');
    const sessionData = await sessionResponse.json();
    
    if (!sessionData.authenticated) {
      console.log('[Dashboard] Not authenticated, redirecting to login');
      window.location.href = '/login';
      return;
    }
    
    console.log('[Dashboard] User authenticated:', sessionData.user.username);
    
    // サーバー一覧の読み込み
    await loadServers();
    
  } catch (error) {
    console.error('[Dashboard] Initialization failed:', error);
    showError('ダッシュボードの初期化に失敗しました');
  }
});