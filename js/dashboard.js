// ダッシュボード用JavaScript
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

        // ダッシュボードの初期化
        this.setupTabNavigation();
        this.loadOverviewData();
        this.setupEventListeners();
        this.loadSettings();
        this.loadPersonalSettings();
        this.loadDictionary();
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
                alert('プレミアム設定を保存しました。');
            } else {
                alert('設定の保存に失敗しました。');
            }
        } catch (error) {
            console.error('Failed to save premium settings:', error);
            alert('設定の保存中にエラーが発生しました。');
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
        document.getElementById('add-dict-entry').addEventListener('click', () => {
            this.addDictionaryEntry();
        });

        // 設定保存
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });

        // 個人設定保存
        document.getElementById('save-personal').addEventListener('click', () => {
            this.savePersonalSettings();
        });

        // 自動接続設定保存
        document.getElementById('save-auto-connect').addEventListener('click', () => {
            this.saveAutoConnectSettings();
        });

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

    setupSliderValues() {
        const sliders = [
            { id: 'default-speed', valueId: 'speed-value' },
            { id: 'default-pitch', valueId: 'pitch-value' },
            { id: 'personal-speed', valueId: 'personal-speed-value' },
            { id: 'personal-pitch', valueId: 'personal-pitch-value' }
        ];

        sliders.forEach(({ id, valueId }) => {
            const slider = document.getElementById(id);
            const valueDisplay = document.getElementById(valueId);

            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
        });
    }

    async addDictionaryEntry() {
        const word = document.getElementById('dict-word').value.trim();
        const reading = document.getElementById('dict-reading').value.trim();

        if (!word || !reading) {
            alert('単語と読み方を入力してください。');
            return;
        }

        try {
            // 辞書エントリを保存（実際のAPIがないのでローカルストレージを使用）
            const entries = this.getDictionaryEntries();
            entries.push({ word, reading, id: Date.now() });
            localStorage.setItem('dictionary-entries', JSON.stringify(entries));

            document.getElementById('dict-word').value = '';
            document.getElementById('dict-reading').value = '';
            this.renderDictionaryEntries();
        } catch (error) {
            console.error('Failed to add dictionary entry:', error);
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

        entries.forEach(entry => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'dictionary-entry';

            entryDiv.innerHTML = `
                <div>
                    <span class="word">${entry.word}</span> -
                    <span class="reading">${entry.reading}</span>
                </div>
                <button onclick="dashboard.deleteDictionaryEntry(${entry.id})">削除</button>
            `;

            container.appendChild(entryDiv);
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

    async saveSettings() {
        const settings = {
            defaultSpeaker: document.getElementById('default-speaker').value,
            defaultSpeed: document.getElementById('default-speed').value,
            defaultPitch: document.getElementById('default-pitch').value,
            autoLeave: document.getElementById('auto-leave').value,
            maxQueue: document.getElementById('max-queue').value,
            ignoreBots: document.getElementById('ignore-bots').checked
        };

        try {
            localStorage.setItem('bot-settings', JSON.stringify(settings));
            alert('設定を保存しました。');
        } catch (error) {
            console.error('Failed to save settings:', error);
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
        const settings = {
            personalSpeaker: document.getElementById('personal-speaker').value,
            personalSpeed: document.getElementById('personal-speed').value,
            personalPitch: document.getElementById('personal-pitch').value,
            notifyJoined: document.getElementById('notify-joined').checked,
            notifyLeft: document.getElementById('notify-left').checked,
            notifyError: document.getElementById('notify-error').checked,
            logMessages: document.getElementById('log-messages').checked,
            publicStats: document.getElementById('public-stats').checked
        };

        try {
            localStorage.setItem('personal-settings', JSON.stringify(settings));
            alert('個人設定を保存しました。');
        } catch (error) {
            console.error('Failed to save personal settings:', error);
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

    async saveAutoConnectSettings() {
        const settings = {
            enabled: document.getElementById('auto-connect-enabled').checked,
            channel: document.getElementById('auto-connect-channel').value,
            delay: document.getElementById('auto-connect-delay').value
        };

        try {
            localStorage.setItem('auto-connect-settings', JSON.stringify(settings));
            alert('自動接続設定を保存しました。');
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
        // このメソッドはもはや使用されないため、空の実装にしておく
        // ユーザー情報はログイン時に設定される
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
                    icon.src = server.iconUrl || '/default-icon.png';
                    icon.alt = `${server.name} icon`;
                    icon.classList.add('server-icon');

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
                        this.selectServer(server.id, server.name);
                    });
                });
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

    // サーバー設定読み込み
    loadServerSettings(serverId, serverName) {
        console.log(`Loading settings for server: ${serverName}`);
        // TODO: サーバー固有の設定を読み込み、UIに反映する処理を実装
        // 例: 選択されたサーバーの設定タブを表示、設定値を読み込み等
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
