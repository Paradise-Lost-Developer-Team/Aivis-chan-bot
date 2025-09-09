// API設定ファイル
// 実際のBotのAPIエンドポイントに合わせて設定してください

const API_CONFIG = {
    // APIベースURL - 実際のサーバーアドレスに変更
    baseURL: 'http://aivisspeech-engine.aivis-chan-bot:10101', // AivisSpeech Engine のデフォルトポート

    // エンドポイント設定
    endpoints: {
        // AivisSpeech Engine エンドポイント
        ttsStatus: '/speakers', // スピーカー情報取得でヘルスチェック
        ttsHealth: '/docs', // OpenAPI仕様書で生存確認
        ttsPing: '/speakers', // レスポンス時間測定用
        
        // Bot関連API（実装時に調整）
        botStatus: '/api/bot/status',
        apiHealth: '/api/health',
        databaseStatus: '/api/database/status',
        statistics: '/api/statistics',
        discordPing: '/api/discord/ping'
    },
    
    // リクエスト設定
    timeout: 5000, // 5秒タイムアウト
    retryCount: 3,
    
    // 更新間隔（ミリ秒）
    updateInterval: 30000, // 30秒
    
    // WebSocket設定（リアルタイム更新用）
    websocket: {
        enabled: false,
        url: 'ws://localhost:3001/ws'
    }
};

// APIクライアントクラス
class APIClient {
    constructor(config = API_CONFIG) {
        this.config = config;
    }

    async request(endpoint, options = {}) {
        const url = `${this.config.baseURL}${endpoint}`;
        const requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: this.config.timeout,
            ...options
        };

        try {
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${url}`, error);
            throw error;
        }
    }

    // Bot ステータス取得
    async getBotStatus() {
        return await this.request(this.config.endpoints.botStatus);
    }

    // TTS エンジンステータス取得
    async getTTSStatus() {
        return await this.request(this.config.endpoints.ttsStatus);
    }

    // API ヘルスチェック
    async getAPIHealth() {
        return await this.request(this.config.endpoints.apiHealth);
    }

    // データベースステータス取得
    async getDatabaseStatus() {
        return await this.request(this.config.endpoints.databaseStatus);
    }

    // 統計情報取得
    async getStatistics() {
        return await this.request(this.config.endpoints.statistics);
    }

    // Discord API ping取得
    async getDiscordPing() {
        return await this.request(this.config.endpoints.discordPing);
    }

    // TTS ping取得
    async getTTSPing() {
        return await this.request(this.config.endpoints.ttsPing);
    }
}

// 実際のAPIレスポンス例
const SAMPLE_RESPONSES = {
    botStatus: {
        status: 'online',
        uptime: 86400000, // ミリ秒
        guilds: 1247,
        users: 89653,
        ping: 45,
        version: '2.1.0'
    },
    
    ttsStatus: {
        online: true,
        version: '1.0.0',
        speakers: 15,
        queue: 3,
        processing: true
    },
    
    apiHealth: {
        status: 'healthy',
        timestamp: Date.now(),
        services: {
            database: 'connected',
            discord: 'connected',
            tts: 'connected'
        }
    },
    
    databaseStatus: {
        connected: true,
        responseTime: 12,
        activeConnections: 5,
        maxConnections: 100
    },
    
    statistics: {
        guilds: 1247,
        users: 89653,
        voiceChannels: 23,
        messagesToday: 4521,
        totalMessages: 1234567,
        uptime: 86400000
    },
    
    discordPing: {
        ping: 45,
        timestamp: Date.now()
    },
    
    ttsPing: {
        ping: 87,
        timestamp: Date.now()
    }
};

// 開発環境用のモック設定
const DEVELOPMENT_MODE = true; // 本番環境では false に設定

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_CONFIG,
        APIClient,
        SAMPLE_RESPONSES,
        DEVELOPMENT_MODE
    };
}
