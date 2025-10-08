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
            
            // 話者一覧を取得
            logger.info('[Dashboard] Fetching speakers list...');
            const speakersResp = await fetch('/api/speakers', {
                credentials: 'include'
            });
            
            const speakers = speakersResp.ok ? await speakersResp.json() : [];
            logger.info(`[Dashboard] Speakers loaded: ${speakers.length} speakers`);
            
            // 設定画面を表示
            this.renderSettings(guildId, guildData, settings, speakers);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to load server settings: ' + error.message);
            logger.error('[Dashboard] Stack trace:', error.stack);
            this.showError('サーバー設定の読み込みに失敗しました: ' + error.message);
        }
    }

    async setupPersonalSettings(guildId, speakers) {
        try {
            logger.info('[Dashboard] Loading personal settings...');
            
            // 個人設定を取得
            const response = await fetch(`/api/personal-settings?guildId=${guildId}&userId=${this.currentUserId}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const settings = data.settings || {};
                
                logger.info('[Dashboard] Personal settings received:', settings);
                
                // フォームに設定を反映
                if (settings.speaker) {
                    const speakerSelect = document.getElementById('personal-speaker');
                    if (speakerSelect) {
                        speakerSelect.value = settings.speaker;
                    }
                }
                if (settings.speed !== undefined) {
                    const speedInput = document.getElementById('personal-speed');
                    if (speedInput) {
                        speedInput.value = settings.speed;
                        const valueDisplay = speedInput.nextElementSibling;
                        if (valueDisplay) {
                            valueDisplay.textContent = settings.speed;
                        }
                    }
                }
                if (settings.pitch !== undefined) {
                    const pitchInput = document.getElementById('personal-pitch');
                    if (pitchInput) {
                        pitchInput.value = settings.pitch;
                        const valueDisplay = pitchInput.nextElementSibling;
                        if (valueDisplay) {
                            valueDisplay.textContent = settings.pitch;
                        }
                    }
                }
                if (settings.volume !== undefined) {
                    const volumeInput = document.getElementById('personal-volume');
                    if (volumeInput) {
                        volumeInput.value = settings.volume;
                        const valueDisplay = volumeInput.nextElementSibling;
                        if (valueDisplay) {
                            valueDisplay.textContent = settings.volume;
                        }
                    }
                }
                if (settings.tempo !== undefined) {
                    const tempoInput = document.getElementById('personal-tempo');
                    if (tempoInput) {
                        tempoInput.value = settings.tempo;
                        const valueDisplay = tempoInput.nextElementSibling;
                        if (valueDisplay) {
                            valueDisplay.textContent = settings.tempo;
                        }
                    }
                }
                if (settings.intonation !== undefined) {
                    const intonationInput = document.getElementById('personal-intonation');
                    if (intonationInput) {
                        intonationInput.value = settings.intonation;
                        const valueDisplay = intonationInput.nextElementSibling;
                        if (valueDisplay) {
                            valueDisplay.textContent = settings.intonation;
                        }
                    }
                }
                
                logger.success('[Dashboard] Personal settings loaded and applied');
            } else {
                logger.info('[Dashboard] No personal settings found, using defaults');
            }
            
            // 保存ボタンのイベント
            const saveBtn = document.getElementById('save-personal-settings');
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    await this.savePersonalSettings(guildId);
                });
            }
            
            // リセットボタンのイベント
            const resetBtn = document.getElementById('reset-personal-settings');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    // デフォルト値にリセット
                    const defaults = {
                        speaker: '',
                        speed: 1.0,
                        pitch: 0.0,
                        volume: 1.0,
                        tempo: 1.0,
                        intonation: 1.0
                    };
                    
                    const speakerSelect = document.getElementById('personal-speaker');
                    const speedInput = document.getElementById('personal-speed');
                    const pitchInput = document.getElementById('personal-pitch');
                    const volumeInput = document.getElementById('personal-volume');
                    const tempoInput = document.getElementById('personal-tempo');
                    const intonationInput = document.getElementById('personal-intonation');
                    
                    if (speakerSelect) speakerSelect.value = defaults.speaker;
                    
                    if (speedInput) {
                        speedInput.value = defaults.speed;
                        const valueDisplay = speedInput.nextElementSibling;
                        if (valueDisplay) valueDisplay.textContent = defaults.speed;
                    }
                    
                    if (pitchInput) {
                        pitchInput.value = defaults.pitch;
                        const valueDisplay = pitchInput.nextElementSibling;
                        if (valueDisplay) valueDisplay.textContent = defaults.pitch;
                    }
                    
                    if (volumeInput) {
                        volumeInput.value = defaults.volume;
                        const valueDisplay = volumeInput.nextElementSibling;
                        if (valueDisplay) valueDisplay.textContent = defaults.volume;
                    }
                    
                    if (tempoInput) {
                        tempoInput.value = defaults.tempo;
                        const valueDisplay = tempoInput.nextElementSibling;
                        if (valueDisplay) valueDisplay.textContent = defaults.tempo;
                    }
                    
                    if (intonationInput) {
                        intonationInput.value = defaults.intonation;
                        const valueDisplay = intonationInput.nextElementSibling;
                        if (valueDisplay) valueDisplay.textContent = defaults.intonation;
                    }
                    
                    logger.info('[Dashboard] Personal settings reset to default');
                });
            }
            
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
                volume: parseFloat(document.getElementById('personal-volume').value),
                tempo: parseFloat(document.getElementById('personal-tempo').value),
                intonation: parseFloat(document.getElementById('personal-intonation').value)
            };
            
            // 値の検証
            if (settings.speed < 0.5 || settings.speed > 2.0) {
                throw new Error('話速は 0.5 から 2.0 の間でなければなりません');
            }
            if (settings.pitch < -0.15 || settings.pitch > 0.15) {
                throw new Error('ピッチは -0.15 から 0.15 の間でなければなりません');
            }
            if (settings.volume < 0.0 || settings.volume > 2.0) {
                throw new Error('音量は 0.0 から 2.0 の間でなければなりません');
            }
            if (settings.tempo < 0.5 || settings.tempo > 2.0) {
                throw new Error('テンポは 0.5 から 2.0 の間でなければなりません');
            }
            if (settings.intonation < 0.0 || settings.intonation > 2.0) {
                throw new Error('感情表現強度は 0.0 から 2.0 の間でなければなりません');
            }
            
            logger.info('[Dashboard] Personal settings to save:', settings);
            
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
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || '個人設定の保存に失敗しました');
            }
            
            const result = await response.json();
            logger.success('Personal settings saved successfully:', result);
            this.showSuccess('個人設定を保存しました');
            
        } catch (error) {
            logger.error('[Dashboard] Failed to save personal settings: ' + error.message);
            this.showError('個人設定の保存に失敗しました: ' + error.message);
        }
    }

    renderSettings(guildId, guildData, settings, speakers) {
        logger.info(`[Dashboard] Rendering settings for: ${guildId}`);
        
        const settingsEl = document.getElementById('settings-panel');
        if (!settingsEl) {
            logger.error('[Dashboard] settings-panel element not found');
            return;
        }
        
        const server = this.servers.find(s => s.id === guildId);
        const serverName = guildData.name || (server ? server.name : 'サーバー');
        
        // チャンネルをフィルタリング
        const channels = guildData.channels || [];
        const textChannels = channels.filter(ch => ch.type === 0 || ch.type === 'GUILD_TEXT');
        const voiceChannels = channels.filter(ch => ch.type === 2 || ch.type === 'GUILD_VOICE');
        
        logger.info(`[Dashboard] Channels: Text=${textChannels.length}, Voice=${voiceChannels.length}`);
        
        // 話者オプションを生成（スタイル情報を含む）
        const speakerOptions = speakers.map(speaker => {
            const speakerName = speaker.name || speaker.label || 'Unknown';
            const speakerId = speaker.id || speaker.value;
            return `<option value="${speakerId}">${this.escapeHtml(speakerName)}</option>`;
        }).join('');
        
        // タブシステムを含む設定UIを表示
        settingsEl.style.display = 'block';
        settingsEl.innerHTML = `
            <div class="settings-header">
                <h2>⚙️ ${this.escapeHtml(serverName)} の設定</h2>
            </div>
            
            <!-- タブナビゲーション -->
            <div class="settings-tabs">
                <button class="settings-tab-button active" data-tab="server-settings">🔧 サーバー設定</button>
                <button class="settings-tab-button" data-tab="dictionary">📖 辞書機能</button>
                <button class="settings-tab-button" data-tab="personal">👤 個人設定</button>
            </div>
            
            <div class="settings-tab-content">
                <!-- サーバー設定タブ -->
                <div class="settings-tab-panel active" data-tab="server-settings">
                    <div class="settings-section">
                        <h3>🔧 TTS設定</h3>
                        <div class="settings-form">
                            <div class="form-group">
                                <label for="default-speaker">🗣️ デフォルト話者</label>
                                <select id="default-speaker" class="form-control">
                                    <option value="">選択してください</option>
                                    ${speakerOptions}
                                </select>
                                <small class="form-text">サーバー全体のデフォルト話者</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-speed">⚡ 話速 (0.5 - 2.0)</label>
                                <input type="range" id="default-speed" class="form-range" min="0.5" max="2.0" step="0.1" value="${settings.defaultSpeed || 1.0}">
                                <span class="range-value">${settings.defaultSpeed || 1.0}</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-pitch">🎵 音高 (-0.15 - 0.15)</label>
                                <input type="range" id="default-pitch" class="form-range" min="-0.15" max="0.15" step="0.01" value="${settings.defaultPitch || 0.0}">
                                <span class="range-value">${settings.defaultPitch || 0.0}</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-tempo">🎼 テンポ (0.5 - 2.0)</label>
                                <input type="range" id="default-tempo" class="form-range" min="0.5" max="2.0" step="0.1" value="${settings.defaultTempo || 1.0}">
                                <span class="range-value">${settings.defaultTempo || 1.0}</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-volume">🔊 音量 (0.0 - 2.0)</label>
                                <input type="range" id="default-volume" class="form-range" min="0.0" max="2.0" step="0.1" value="${settings.defaultVolume || 1.0}">
                                <span class="range-value">${settings.defaultVolume || 1.0}</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="default-intonation">😊 感情表現強度 (0.0 - 2.0)</label>
                                <input type="range" id="default-intonation" class="form-range" min="0.0" max="2.0" step="0.1" value="${settings.defaultIntonation || 1.0}">
                                <span class="range-value">${settings.defaultIntonation || 1.0}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-section">
                        <h3>🔗 自動接続設定</h3>
                        <div class="settings-form">
                            <div class="form-group">
                                <label for="auto-join-voice">🔊 自動接続ボイスチャンネル</label>
                                <select id="auto-join-voice" class="form-control">
                                    <option value="">選択してください</option>
                                    ${voiceChannels.map(ch => 
                                        `<option value="${ch.id}" ${settings.autoJoinVoiceChannel === ch.id ? 'selected' : ''}>${this.escapeHtml(ch.name)}</option>`
                                    ).join('')}
                                </select>
                                <small class="form-text">Botがサーバー起動時に自動的に接続するボイスチャンネル</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="auto-join-text">💬 自動接続テキストチャンネル</label>
                                <select id="auto-join-text" class="form-control">
                                    <option value="">選択してください</option>
                                    ${textChannels.map(ch => 
                                        `<option value="${ch.id}" ${settings.autoJoinTextChannel === ch.id ? 'selected' : ''}>${this.escapeHtml(ch.name)}</option>`
                                    ).join('')}
                                </select>
                                <small class="form-text">読み上げメッセージを監視するテキストチャンネル</small>
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
                <div class="settings-tab-panel" data-tab="dictionary">
                    <div class="settings-section">
                        <h3>📖 辞書機能</h3>
                        <p class="info-text">特定の単語の読み方をカスタマイズできます</p>
                        
                        <div class="dictionary-controls">
                            <button id="add-dictionary-entry" class="btn btn-success">➕ エントリーを追加</button>
                            <button id="save-dictionary" class="btn btn-primary">💾 辞書を保存</button>
                        </div>
                        
                        <div id="dictionary-list" class="dictionary-list">
                            <p class="loading-text">辞書を読み込み中...</p>
                        </div>
                    </div>
                </div>
                
                <!-- 個人設定タブ -->
                <div class="settings-tab-panel" data-tab="personal">
                    <div class="settings-section">
                        <h3>👤 個人設定</h3>
                        <p class="info-text">あなた専用の音声設定です（空欄はサーバーのデフォルト設定を使用）</p>
                        
                        <div class="settings-form">
                            <div class="form-group">
                                <label for="personal-speaker">🗣️ 話者</label>
                                <select id="personal-speaker" class="form-control">
                                    <option value="">デフォルト設定を使用</option>
                                    ${speakerOptions}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-speed">⚡ 話速 (0.5 - 2.0)</label>
                                <input type="range" id="personal-speed" class="form-range" min="0.5" max="2.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-pitch">🎵 音高 (-0.15 - 0.15)</label>
                                <input type="range" id="personal-pitch" class="form-range" min="-0.15" max="0.15" step="0.01" value="0.0">
                                <span class="range-value">0.0</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-tempo">🎼 テンポ (0.5 - 2.0)</label>
                                <input type="range" id="personal-tempo" class="form-range" min="0.5" max="2.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-volume">🔊 音量 (0.0 - 2.0)</label>
                                <input type="range" id="personal-volume" class="form-range" min="0.0" max="2.0" step="0.1" value="1.0">
                                <span class="range-value">1.0</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="personal-intonation">😊 感情表現強度 (0.0 - 2.0)</label>
                                <input type="range" id="personal-intonation" class="form-range" min="0.0" max="2.0" step="0.1" value="1.0">
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
        this.setupSettingsTabs();
        
        // レンジスライダーのリアルタイム更新
        this.setupRangeInputs();
        
        // サーバー設定の保存
        this.setupServerSettings(guildId);
        
        // 辞書機能の初期化
        this.setupDictionary(guildId);
        
        // 個人設定の初期化
        this.setupPersonalSettings(guildId, speakers);
        
        logger.success('Settings panel displayed with all features');
    }

    setupServerSettings(guildId) {
        const saveBtn = document.getElementById('save-server-settings');
        if (!saveBtn) return;
        
        saveBtn.addEventListener('click', async () => {
            try {
                logger.info('[Dashboard] Saving server settings...');
                
                const settings = {
                    defaultSpeaker: document.getElementById('default-speaker').value || null,
                    defaultSpeed: parseFloat(document.getElementById('default-speed').value),
                    defaultPitch: parseFloat(document.getElementById('default-pitch').value),
                    defaultTempo: parseFloat(document.getElementById('default-tempo').value),
                    defaultVolume: parseFloat(document.getElementById('default-volume').value),
                    defaultIntonation: parseFloat(document.getElementById('default-intonation').value),
                    autoJoinVoiceChannel: document.getElementById('auto-join-voice').value || null,
                    autoJoinTextChannel: document.getElementById('auto-join-text').value || null,
                    autoLeave: document.getElementById('auto-leave').checked,
                    ignoreBots: document.getElementById('ignore-bots').checked
                };
                
                logger.info('[Dashboard] Settings to save:', settings);
                
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
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || '設定の保存に失敗しました');
                }
                
                const result = await response.json();
                logger.success('Server settings saved successfully:', result);
                this.showSuccess('サーバー設定を保存しました');
                
            } catch (error) {
                logger.error('[Dashboard] Failed to save server settings: ' + error.message);
                this.showError('設定の保存に失敗しました: ' + error.message);
            }
        });
    }

    setupSettingsTabs() {
        const tabButtons = document.querySelectorAll('.settings-tab-button');
        const tabPanels = document.querySelectorAll('.settings-tab-panel');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // すべてのタブを非アクティブ化
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));
                
                // 選択したタブをアクティブ化
                button.classList.add('active');
                document.querySelector(`.settings-tab-panel[data-tab="${targetTab}"]`).classList.add('active');
                
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
    
    async setupDictionary(guildId) {
        logger.info('[Dashboard] Setting up dictionary...');
        
        try {
            // 辞書データを取得
            fetch(`/api/dictionary?guildId=${guildId}`, {
                credentials: 'include'
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('辞書の読み込みに失敗しました');
                }
                return response.json();
            })
            .then(data => {
                const dictionary = data.dictionary || [];
                
                logger.info(`[Dashboard] Dictionary loaded: ${dictionary.length} entries`);
                
                // 辞書一覧を表示
                this.renderDictionary(dictionary);
                
                // エントリー追加ボタン
                const addBtn = document.getElementById('add-dictionary-entry');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        this.addDictionaryEntry();
                    });
                }
                
                // 保存ボタン
                const saveBtn = document.getElementById('save-dictionary');
                if (saveBtn) {
                    saveBtn.addEventListener('click', async () => {
                        await this.saveDictionary(guildId);
                    });
                }
            })
            .catch(error => {
                logger.error('[Dashboard] Failed to setup dictionary: ' + error.message);
                const listEl = document.getElementById('dictionary-list');
                if (listEl) {
                    listEl.innerHTML = '<p class="error-text">辞書の読み込みに失敗しました</p>';
                }
            });
            
        } catch (error) {
            logger.error('[Dashboard] Failed to setup dictionary: ' + error.message);
        }
    }
    
    renderDictionary(dictionary) {
        const listEl = document.getElementById('dictionary-list');
        if (!listEl) return;
        
        if (dictionary.length === 0) {
            listEl.innerHTML = `
                <div class="empty-dictionary">
                    <p class="info-text">📖 辞書にエントリーがありません</p>
                    <p class="info-subtext">「➕ エントリーを追加」ボタンから単語を追加してください</p>
                </div>
            `;
            return;
        }
        
        listEl.innerHTML = dictionary.map((entry, index) => `
            <div class="dictionary-entry" data-index="${index}">
                <div class="dictionary-entry-header">
                    <span class="entry-number">#${index + 1}</span>
                    <button class="btn-icon btn-danger-icon remove-dictionary-entry" data-index="${index}" title="削除">
                        🗑️
                    </button>
                </div>
                <div class="dictionary-entry-body">
                    <div class="form-row">
                        <div class="form-col form-col-6">
                            <label class="form-label">単語</label>
                            <input type="text" 
                                   class="form-control dict-word-input" 
                                   placeholder="例: Discord" 
                                   value="${this.escapeHtml(entry.word || '')}" />
                        </div>
                        <div class="form-col form-col-6">
                            <label class="form-label">読み（カタカナ）</label>
                            <input type="text" 
                                   class="form-control dict-pronunciation-input" 
                                   placeholder="例: ディスコード" 
                                   value="${this.escapeHtml(entry.pronunciation || '')}" />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-col form-col-4">
                            <label class="form-label">アクセント型</label>
                            <input type="number" 
                                   class="form-control dict-accent-input" 
                                   placeholder="0" 
                                   min="0" 
                                   value="${entry.accentType !== undefined ? entry.accentType : (entry.accent !== undefined ? entry.accent : 0)}" />
                            <small class="form-hint">0から始まる整数</small>
                        </div>
                        <div class="form-col form-col-8">
                            <label class="form-label">品詞</label>
                            <select class="form-control dict-wordtype-input">
                                <option value="PROPER_NOUN" ${(entry.wordType || entry.word_type) === 'PROPER_NOUN' ? 'selected' : ''}>固有名詞</option>
                                <option value="PLACE_NAME" ${(entry.wordType || entry.word_type) === 'PLACE_NAME' ? 'selected' : ''}>地名</option>
                                <option value="ORGANIZATION_NAME" ${(entry.wordType || entry.word_type) === 'ORGANIZATION_NAME' ? 'selected' : ''}>組織名</option>
                                <option value="PERSON_NAME" ${(entry.wordType || entry.word_type) === 'PERSON_NAME' ? 'selected' : ''}>人名</option>
                                <option value="PERSON_FAMILY_NAME" ${(entry.wordType || entry.word_type) === 'PERSON_FAMILY_NAME' ? 'selected' : ''}>姓</option>
                                <option value="PERSON_GIVEN_NAME" ${(entry.wordType || entry.word_type) === 'PERSON_GIVEN_NAME' ? 'selected' : ''}>名</option>
                                <option value="COMMON_NOUN" ${(entry.wordType || entry.word_type) === 'COMMON_NOUN' ? 'selected' : ''}>普通名詞</option>
                                <option value="VERB" ${(entry.wordType || entry.word_type) === 'VERB' ? 'selected' : ''}>動詞</option>
                                <option value="ADJECTIVE" ${(entry.wordType || entry.word_type) === 'ADJECTIVE' ? 'selected' : ''}>形容詞</option>
                                <option value="SUFFIX" ${(entry.wordType || entry.word_type) === 'SUFFIX' ? 'selected' : ''}>語尾</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
        // 削除ボタンのイベント
        document.querySelectorAll('.remove-dictionary-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const index = parseInt(e.currentTarget.dataset.index);
                
                // 確認ダイアログ
                if (confirm(`エントリー "${dictionary[index].word}" を削除しますか？`)) {
                    this.removeDictionaryEntry(index);
                }
            });
        });
    }
    
    addDictionaryEntry() {
        const listEl = document.getElementById('dictionary-list');
        if (!listEl) return;
        
        // 既存の辞書エントリーを取得
        const existingEntries = this.getDictionaryFromUI();
        
        // 新しいエントリーを追加
        existingEntries.push({
            word: '',
            pronunciation: '',
            accentType: 0,
            wordType: 'PROPER_NOUN'
        });
        
        this.renderDictionary(existingEntries);
        
        // 最後のエントリーにスクロール
        const lastEntry = listEl.querySelector('.dictionary-entry:last-child');
        if (lastEntry) {
            lastEntry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // 最初の入力フィールドにフォーカス
            const firstInput = lastEntry.querySelector('.dict-word-input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
        
        logger.info('[Dashboard] Dictionary entry added');
    }
    
    removeDictionaryEntry(index) {
        const entries = this.getDictionaryFromUI();
        entries.splice(index, 1);
        this.renderDictionary(entries);
        logger.info(`[Dashboard] Dictionary entry removed: index ${index}`);
    }
    
    getDictionaryFromUI() {
        const entries = [];
        document.querySelectorAll('.dictionary-entry').forEach(entryEl => {
            const word = entryEl.querySelector('.dict-word-input')?.value.trim() || '';
            const pronunciation = entryEl.querySelector('.dict-pronunciation-input')?.value.trim() || '';
            const accentInput = entryEl.querySelector('.dict-accent-input');
            const wordTypeInput = entryEl.querySelector('.dict-wordtype-input');
            
            if (word && pronunciation) {
                const entry = {
                    word: word,
                    pronunciation: pronunciation,
                    accentType: accentInput ? (parseInt(accentInput.value) || 0) : 0,
                    wordType: wordTypeInput ? wordTypeInput.value : 'PROPER_NOUN'
                };
                
                entries.push(entry);
            }
        });
        
        return entries;
    }
    
    async saveDictionary(guildId) {
        try {
            logger.info('[Dashboard] Saving dictionary...');
            
            const dictionary = this.getDictionaryFromUI();
            
            if (dictionary.length === 0) {
                logger.warn('[Dashboard] No dictionary entries to save');
                this.showError('保存する辞書エントリーがありません');
                return;
            }
            
            logger.info(`[Dashboard] Dictionary entries to save: ${dictionary.length}`);
            
            const response = await fetch('/api/dictionary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    guildId: guildId,
                    dictionary: dictionary
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || '辞書の保存に失敗しました');
            }
            
            const result = await response.json();
            logger.success('Dictionary saved successfully:', result);
            this.showSuccess(`辞書を保存しました (${dictionary.length}件)`);
            
        } catch (error) {
            logger.error('[Dashboard] Failed to save dictionary: ' + error.message);
            this.showError('辞書の保存に失敗しました: ' + error.message);
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

    showError(message) {
        logger.error('[Dashboard] Error: ' + message);
        
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
