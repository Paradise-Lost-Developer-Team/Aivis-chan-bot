// ダッシュボード用JavaScript
class Dashboard {
    constructor() {
        this.currentTab = 'overview';
        this.init();
    }

    init() {
        this.setupTabNavigation();
        this.loadOverviewData();
        this.setupEventListeners();
        this.loadSettings();
        this.loadPersonalSettings();
        this.loadDictionary();
        this.loadAutoConnectSettings();
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
}

// グローバルインスタンスを作成
const dashboard = new Dashboard();
