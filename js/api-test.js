// 開発用API接続テストスクリプト

class APIConnectionTest {
    constructor() {
        this.testResults = {};
    }

    // AivisSpeech Engine 接続テスト
    async testAivisSpeechEngine() {
        console.log('🎙️ AivisSpeech Engine接続テスト開始...');
        
        const endpoints = [
            'http://aivisspeech-engine.aivis-chan-bot:10101/speakers',
            'http://aivisspeech-engine.aivis-chan-bot:10101/docs',
            'http://localhost:10101/speakers', // ローカル接続
        ];

        for (const endpoint of endpoints) {
            try {
                const startTime = Date.now();
                const response = await fetch(endpoint, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                const endTime = Date.now();
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ ${endpoint} - 成功 (${endTime - startTime}ms)`);
                    console.log('レスポンス:', data);
                    return { success: true, endpoint, responseTime: endTime - startTime, data };
                } else {
                    console.log(`❌ ${endpoint} - HTTP ${response.status}`);
                }
            } catch (error) {
                console.log(`❌ ${endpoint} - エラー:`, error.message);
            }
        }
        
        return { success: false };
    }

    // Discord API 接続テスト
    async testDiscordAPI() {
        console.log('🤖 Discord API接続テスト開始...');
        
        try {
            const startTime = Date.now();
            const response = await fetch('https://discord.com/api/v10/gateway');
            const endTime = Date.now();
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Discord API - 成功 (${endTime - startTime}ms)`);
                console.log('Gateway URL:', data.url);
                return { success: true, responseTime: endTime - startTime, data };
            } else {
                console.log(`❌ Discord API - HTTP ${response.status}`);
            }
        } catch (error) {
            console.log('❌ Discord API - エラー:', error.message);
        }
        
        return { success: false };
    }

    // 包括的な接続テスト
    async runAllTests() {
        console.log('🚀 API接続テスト開始...');
        console.log('==========================================');
        
        this.testResults.aivisSpeech = await this.testAivisSpeechEngine();
        this.testResults.discord = await this.testDiscordAPI();
        
        console.log('==========================================');
        console.log('📊 テスト結果まとめ:');
        console.log('AivisSpeech Engine:', this.testResults.aivisSpeech.success ? '✅ 成功' : '❌ 失敗');
        console.log('Discord API:', this.testResults.discord.success ? '✅ 成功' : '❌ 失敗');
        
        return this.testResults;
    }

    // ブラウザのコンソールに詳細情報を表示
    displayDetailedInfo() {
        console.log('🔍 詳細接続情報:');
        console.log('現在のURL:', window.location.href);
        console.log('Origin:', window.location.origin);
        console.log('User Agent:', navigator.userAgent);
        console.log('ネットワーク状態:', navigator.onLine ? 'オンライン' : 'オフライン');
    }
}

// ページ読み込み時に自動テスト実行
document.addEventListener('DOMContentLoaded', async () => {
    const tester = new APIConnectionTest();
    tester.displayDetailedInfo();
    await tester.runAllTests();
});

// グローバルアクセス用
window.APIConnectionTest = APIConnectionTest;
