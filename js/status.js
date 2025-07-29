// ステータスページのJavaScript

class StatusMonitor {
    constructor() {
        this.updateInterval = 120000; // 2分ごとに更新
        this.debugMode = false;
        this.init();
    }

    async init() {
        this.log('ステータスモニター初期化中...');
        await this.updateStatus();
        await this.updateStatistics();
        await this.checkSSLStatus(); // SSL状態確認を追加
        this.startAutoUpdate();
        this.setupEventListeners();
        this.log('ステータスモニター初期化完了');
    }

    log(message, type = 'info') {
        if (this.debugMode || type === 'error') {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] ${message}`);
        }
    }

    // ステータス更新
    async updateStatus() {
        try {
            // Discord Botステータス
            await this.checkBotStatus();
            
            // TTS Engineステータス
            await this.checkTTSStatus();
            
            // APIサーバーステータス
            await this.checkAPIStatus();
            
            // データベースステータス
            await this.checkDatabaseStatus();
            
            console.log('ステータス更新完了');
        } catch (error) {
            console.error('ステータス更新エラー:', error);
        }
    }

    // Discord Botステータス確認
    async checkBotStatus() {
        try {
            const startTime = Date.now();
            
            // Discord Gateway の生存確認（簡易版）
            // 実際のBot APIがある場合はそちらを使用
            const response = await fetch('https://discord.com/api/v10/gateway', {
                timeout: 5000
            });
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            if (response.ok) {
                // 実際のBot接続状態は別途API実装が必要
                // ここではDiscord APIが応答することで基本的な接続性を確認
                this.updateStatusIndicator('bot-status', 'operational', 'Discord API接続正常');
                this.updateResponseTime('discord-ping', responseTime);
                
                console.log('Discord API接続正常');
            } else {
                throw new Error(`Discord API HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Discord Bot接続エラー:', error);
            this.updateStatusIndicator('bot-status', 'error', 'Discord API接続エラー');
            this.updateResponseTime('discord-ping', null);
        }
    }

    // TTS Engineステータス確認（AivisSpeech Engine）
    async checkTTSStatus() {
        try {
            const startTime = Date.now();
            
            // 新ドメイン対応: aivis-chan-bot.com
            // HTTPS環境では、Mixed Content問題を回避するため
            // プロキシ経由またはCORS設定されたエンドポイントを使用
            const protocol = window.location.protocol;
            const isNewDomain = window.location.hostname.includes('aivis-chan-bot.com');
            
            let baseUrl;
            if (isNewDomain) {
                // 新ドメインの場合: aivis-chan-bot.com
                baseUrl = protocol === 'https:' 
                    ? 'https://api.aivis-chan-bot.com' // API サブドメイン経由
                    : 'http://alecjp02.asuscomm.com:10101';
            } else {
                // 従来のドメインの場合
                baseUrl = protocol === 'https:' 
                    ? 'https://alecjp02.asuscomm.com' 
                    : 'http://alecjp02.asuscomm.com:10101';
            }
            
            // AivisSpeech Engine の /speakers エンドポイントで生存確認
            const response = await fetch(`${baseUrl}/speakers`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 5000
            });
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            if (response.ok) {
                const speakers = await response.json();
                const speakerCount = speakers.length || 0;
                
                this.updateStatusIndicator('tts-status', 'operational', `正常 (${speakerCount}人の話者)`, responseTime);
                this.updateResponseTime('tts-ping', responseTime);
                
                console.log('AivisSpeech Engine正常:', speakerCount, '人の話者が利用可能');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('TTS Engine接続エラー:', error);
            this.updateStatusIndicator('tts-status', 'error', 'エラー - 接続できません');
            this.updateResponseTime('tts-ping', null);
        }
    }

    // APIサーバーステータス確認
    async checkAPIStatus() {
        try {
            const response = await this.mockAPICall('/api/health', 200);
            this.updateStatusIndicator('api-status', 'operational', '正常');
        } catch (error) {
            this.updateStatusIndicator('api-status', 'error', 'エラー');
        }
    }

    // SSL/セキュリティ状態確認
    async checkSSLStatus() {
        try {
            const isHTTPS = window.location.protocol === 'https:';
            const securityElement = document.getElementById('security-status');
            
            if (securityElement) {
                if (isHTTPS) {
                    this.updateStatusIndicator('security-status', 'operational', '🔒 HTTPS接続');
                    this.log('HTTPS接続で動作中');
                } else {
                    this.updateStatusIndicator('security-status', 'warning', '⚠️ HTTP接続');
                    this.log('HTTP接続で動作中 - HTTPS推奨', 'warning');
                }
            }
            
            // セキュリティヘッダーチェック
            if (isHTTPS) {
                await this.checkSecurityHeaders();
            }
            
        } catch (error) {
            console.error('SSL状態確認エラー:', error);
        }
    }

    // セキュリティヘッダー確認
    async checkSecurityHeaders() {
        try {
            const response = await fetch(window.location.href, { method: 'HEAD' });
            const headers = response.headers;
            
            const securityHeaders = {
                'strict-transport-security': 'HSTS',
                'x-frame-options': 'X-Frame-Options',
                'x-content-type-options': 'X-Content-Type-Options',
                'referrer-policy': 'Referrer-Policy'
            };
            
            let secureCount = 0;
            const totalHeaders = Object.keys(securityHeaders).length;
            
            for (const [header, name] of Object.entries(securityHeaders)) {
                if (headers.get(header)) {
                    secureCount++;
                    this.log(`✅ ${name} ヘッダー設定済み`);
                } else {
                    this.log(`⚠️ ${name} ヘッダー未設定`, 'warning');
                }
            }
            
            const securityScore = Math.round((secureCount / totalHeaders) * 100);
            this.log(`セキュリティスコア: ${securityScore}% (${secureCount}/${totalHeaders})`);
            
        } catch (error) {
            this.log('セキュリティヘッダー確認エラー: ' + error.message, 'error');
        }
    }

    // データベースステータス確認
    async checkDatabaseStatus() {
        try {
            const response = await this.mockAPICall('/api/database/status', 200);
            const status = response.connected ? 'operational' : 'error';
            this.updateStatusIndicator('database-status', status, response.connected ? '接続中' : '切断');
        } catch (error) {
            this.updateStatusIndicator('database-status', 'error', '切断');
        }
    }

    // ステータスインジケーターの更新
    updateStatusIndicator(elementId, status, text) {
        const element = document.getElementById(elementId);
        if (element) {
            const indicator = element.querySelector('.status-indicator');
            if (indicator) {
                indicator.className = `status-indicator ${status}`;
                indicator.textContent = text;
            }
        }
    }

    // レスポンス時間の更新
    updateResponseTime(elementId, responseTime) {
        const element = document.getElementById(elementId);
        if (element && responseTime !== null) {
            element.textContent = `${responseTime}ms`;
            
            // レスポンス時間に基づく色分け
            element.className = 'response-time';
            if (responseTime < 100) {
                element.classList.add('excellent');
            } else if (responseTime < 300) {
                element.classList.add('good');
            } else if (responseTime < 1000) {
                element.classList.add('fair');
            } else {
                element.classList.add('poor');
            }
        } else if (element) {
            element.textContent = 'エラー';
            element.className = 'response-time error';
        }
    }

    // 統計情報の更新
    async updateStatistics() {
        try {
            const stats = await this.mockAPICall('/api/statistics', {
                guilds: 1247,
                users: 89653,
                voiceChannels: 23,
                messagesToday: 4521
            });

            this.updateStatElement('guild-count', stats.guilds.toLocaleString());
            this.updateStatElement('user-count', stats.users.toLocaleString());
            this.updateStatElement('voice-channels', stats.voiceChannels);
            this.updateStatElement('messages-today', stats.messagesToday.toLocaleString());

            // レスポンス時間の更新
            await this.updateResponseTimes();
        } catch (error) {
            console.error('統計情報の更新エラー:', error);
            // 失敗時は全てエラー表示
            this.updateStatElement('guild-count', 'エラー');
            this.updateStatElement('user-count', 'エラー');
            this.updateStatElement('voice-channels', 'エラー');
            this.updateStatElement('messages-today', 'エラー');
        }
    }

    // 統計要素の更新
    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        let safeValue = value;
        // NaN/undefined/null/空文字は「0」または「エラー」に
        if (safeValue === undefined || safeValue === null || safeValue === '' || (typeof safeValue === 'number' && !Number.isFinite(safeValue)) || (typeof safeValue === 'string' && safeValue === 'NaN')) {
            safeValue = '0';
        }
        if (element) {
            element.style.transform = 'scale(1.1)';
            setTimeout(() => {
                element.textContent = safeValue;
                element.style.transform = 'scale(1)';
            }, 200);
        }
    }

    // レスポンス時間の更新
    async updateResponseTimes() {
        // Discord API レスポンス時間
        const discordPing = await this.measureResponseTime('/api/discord/ping');
        this.updateResponseTime('discord-ping', discordPing);

        // TTS Engine レスポンス時間
        const ttsPing = await this.measureResponseTime('/api/tts/ping');
        this.updateResponseTime('tts-ping', ttsPing);
    }

    // レスポンス時間測定
    async measureResponseTime(endpoint) {
        const start = Date.now();
        try {
            await this.mockAPICall(endpoint);
            return Date.now() - start;
        } catch (error) {
            return -1; // エラーの場合
        }
    }

    // レスポンス時間表示の更新
    updateResponseTime(elementId, time) {
        const element = document.getElementById(elementId);
        if (element) {
            if (time === -1) {
                element.textContent = 'エラー';
                element.style.color = 'var(--danger-color)';
            } else {
                element.textContent = `${time}ms`;
                // レスポンス時間に応じて色を変更
                if (time < 100) {
                    element.style.color = 'var(--secondary-color)';
                } else if (time < 500) {
                    element.style.color = 'var(--warning-color)';
                } else {
                    element.style.color = 'var(--danger-color)';
                }
            }
        }
    }

    // モックAPIコール（実際のAPIに置き換える）
    async mockAPICall(endpoint, mockData = null) {
        // 実際の実装では fetch() を使用
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.05) { // 95%の確率で成功
                    const defaultResponses = {
                        '/api/bot/status': { status: 'online', ping: 45 },
                        '/api/tts/status': { online: true, version: '1.0.0' },
                        '/api/health': { status: 'healthy' },
                        '/api/database/status': { connected: true },
                        '/api/statistics': {
                            guilds: 1247 + Math.floor(Math.random() * 10),
                            users: 89653 + Math.floor(Math.random() * 100),
                            voiceChannels: 20 + Math.floor(Math.random() * 10),
                            messagesToday: 4521 + Math.floor(Math.random() * 50)
                        },
                        '/api/discord/ping': { ping: 30 + Math.floor(Math.random() * 100) },
                        '/api/tts/ping': { ping: 50 + Math.floor(Math.random() * 150) }
                    };
                    
                    resolve(mockData || defaultResponses[endpoint] || { status: 'ok' });
                } else {
                    reject(new Error('API Error'));
                }
            }, 100 + Math.random() * 400); // 100-500msの遅延をシミュレート
        });
    }

    // 自動更新の開始
    startAutoUpdate() {
        setInterval(async () => {
            await this.updateStatus();
            await this.updateStatistics();
        }, this.updateInterval);
    }

    // イベントリスナーの設定
    setupEventListeners() {
        // ページの可視性変更時の処理
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // ページが表示された時に即座に更新
                this.updateStatus();
                this.updateStatistics();
            }
        });

        // ステータスカードのクリック時の詳細情報表示
        document.querySelectorAll('.status-card').forEach(card => {
            card.addEventListener('click', (e) => {
                this.showStatusDetails(card.id);
            });
        });

        // 手動更新ボタン（もしある場合）
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '更新中...';
                
                await this.updateStatus();
                await this.updateStatistics();
                
                refreshBtn.disabled = false;
                refreshBtn.textContent = '更新';
            });
        }
    }

    // ステータス詳細情報の表示
    showStatusDetails(cardId) {
        const details = {
            'bot-status': {
                title: 'Discord Bot 詳細',
                content: 'Discord APIとの接続状況、レイテンシ、稼働時間などの詳細情報'
            },
            'tts-status': {
                title: 'TTS Engine 詳細',
                content: 'AivisSpeech Engineの動作状況、利用可能な話者数、処理キューの状況'
            },
            'api-status': {
                title: 'API サーバー詳細',
                content: '内部APIサーバーの健全性、エンドポイントの応答状況'
            },
            'database-status': {
                title: 'データベース詳細',
                content: 'データベース接続状況、レプリケーション状態、バックアップ状況'
            }
        };

        const detail = details[cardId];
        if (detail) {
            // モーダルやツールチップで詳細情報を表示
            // 実際の実装では、より詳細な情報を API から取得
            console.log(`${detail.title}: ${detail.content}`);
            // alert(`${detail.title}\n\n${detail.content}`);
        }
    }

    // チャート更新（将来の拡張用）
    updateCharts() {
        // Chart.js などを使用してグラフを更新
        // レスポンス時間の履歴、使用率の推移など
    }
}

// ページ読み込み完了後にステータスモニターを開始
document.addEventListener('DOMContentLoaded', () => {
    const statusMonitor = new StatusMonitor();
    
    // グローバルに参照を保持（デバッグ用）
    window.statusMonitor = statusMonitor;
    
    // 初期メッセージ
    console.log('Aivis-chan Bot ステータスページが読み込まれました');
    console.log('ステータス監視を開始しました');
});

// デバッグモードのトグル関数
function toggleDebugMode() {
    if (window.statusMonitor) {
        window.statusMonitor.debugMode = !window.statusMonitor.debugMode;
        const status = window.statusMonitor.debugMode ? 'オン' : 'オフ';
        console.log(`🔧 デバッグモード: ${status}`);
        
        if (window.statusMonitor.debugMode) {
            console.log('📊 現在のステータス情報:');
            window.statusMonitor.updateStatus();
            
            // API接続テストを実行
            if (window.APIConnectionTest) {
                const tester = new window.APIConnectionTest();
                tester.runAllTests();
            }
        }
        
        // ボタンの見た目を更新
        const debugBtn = document.getElementById('debug-mode');
        if (debugBtn) {
            debugBtn.style.background = window.statusMonitor.debugMode 
                ? 'rgba(46, 204, 113, 0.3)' 
                : 'rgba(255, 255, 255, 0.2)';
        }
    }
}

// サービスワーカーの登録（PWA対応）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(error => {
                console.log('ServiceWorker registration failed');
            });
    });
}
