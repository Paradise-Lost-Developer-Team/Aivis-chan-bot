// Aivis-chan Bot Status Update Script - Real Discord API Integration

async function fetchDiscordBotStats(botId) {
    try {
        // セキュリティ上の理由で、直接Discord APIにアクセスするのではなく
        // 独自のバックエンドAPI経由でBot統計を取得
        // 開発環境とproduction環境でAPIエンドポイントを切り替え
        const apiBaseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3001'  // 開発環境
            : window.location.protocol + '//' + window.location.hostname;  // 本番環境（同じドメイン）
            
        const response = await fetch(`${apiBaseUrl}/api/bot-stats/${botId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const statsData = await response.json();
        
        return {
            online: statsData.online || false,
            serverCount: statsData.server_count || 0,
            userCount: statsData.user_count || 0,
            vcCount: statsData.vc_count || 0,
            uptime: statsData.uptime || 0,
            lastUpdate: new Date().toISOString()
        };

    } catch (error) {
        console.error(`Failed to fetch stats for bot ${botId}:`, error);
        // フォールバック: APIが利用できない場合は「取得中」を表示
        return {
            online: null, // null = 取得中状態
            serverCount: null,
            userCount: null,
            vcCount: null,
            uptime: null,
            error: error.message
        };
    }
}

async function updateBotStatus() {
    console.log('🔄 Fetching real Discord API data...');
    
    const botConfigs = [
        { name: 'Aivis-chan Bot 1台目', botId: '1333819940645638154' },
        { name: 'Aivis-chan Bot 2台目', botId: '1334732369831268352' },
        { name: 'Aivis-chan Bot 3台目', botId: '1334734681656262770' },
        { name: 'Aivis-chan Bot 4台目', botId: '1365633502988472352' },
        { name: 'Aivis-chan Bot 5台目', botId: '1365633586123771934' },
        { name: 'Aivis-chan Bot 6台目', botId: '1365633656173101086' }
    ];

    // 実際のAPI呼び出しでBot統計を取得
    const botStatuses = await Promise.all(
        botConfigs.map(async (bot) => {
            const stats = await fetchDiscordBotStats(bot.botId);
            return {
                ...bot,
                ...stats
            };
        })
    );

    // Bot詳細カードを更新
    const botCards = document.querySelectorAll('.bot-detail-card');
    console.log(`Found ${botCards.length} bot cards to update`);

    botStatuses.forEach((bot, index) => {
        if (botCards[index]) {
            const card = botCards[index];
            
            // APIデータ取得状態に応じてカードのクラスを更新
            if (bot.online === null) {
                card.className = 'bot-detail-card loading';
            } else {
                card.className = `bot-detail-card ${bot.online ? 'online' : 'offline'}`;
            }
            
            // ステータスバッジを更新
            const statusBadge = card.querySelector('.bot-status-badge');
            if (statusBadge) {
                if (bot.online === null) {
                    statusBadge.textContent = 'API取得中...';
                    statusBadge.className = 'bot-status-badge loading';
                } else if (bot.error) {
                    statusBadge.textContent = 'API エラー';
                    statusBadge.className = 'bot-status-badge error';
                } else {
                    statusBadge.textContent = bot.online ? 'オンライン' : 'オフライン';
                    statusBadge.className = `bot-status-badge ${bot.online ? 'online' : 'offline'}`;
                }
            }
            
            // 統計値を更新（実際のAPIデータを使用）
            const statValues = card.querySelectorAll('.stat-item .value');
            if (statValues.length >= 4) {
                if (bot.serverCount === null) {
                    statValues[0].textContent = '取得中...';
                    statValues[1].textContent = '取得中...';
                    statValues[2].textContent = '取得中...';
                    statValues[3].textContent = '取得中...';
                } else {
                    statValues[0].textContent = bot.serverCount.toLocaleString();
                    statValues[1].textContent = bot.userCount.toLocaleString();
                    statValues[2].textContent = bot.vcCount.toLocaleString();
                    statValues[3].textContent = `${bot.uptime.toFixed(1)}%`;
                }
            }
            
            // 招待ボタンを更新
            const inviteBtn = card.querySelector('.btn');
            if (inviteBtn) {
                inviteBtn.href = `https://discord.com/api/oauth2/authorize?client_id=${bot.botId}&permissions=3148800&scope=bot%20applications.commands`;
                inviteBtn.textContent = `${bot.name}を招待`;
            }
        }
    });

    console.log('✅ Bot status update completed');
}

// ページ読み込み後に実行
document.addEventListener('DOMContentLoaded', function() {
    console.log('🤖 Bot Status Script loaded');
    
    // 初回実行
    setTimeout(updateBotStatus, 1000);
    
    // 3分ごとに更新
    setInterval(updateBotStatus, 180000);
    
    // デバッグ用グローバル関数
    window.testBotStatus = updateBotStatus;
});
