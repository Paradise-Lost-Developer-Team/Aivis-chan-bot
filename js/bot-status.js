// Aivis-chan Bot Status Update Script - Real Discord API Integration

async function fetchDiscordBotStats(botId) {
    try {
        // バックエンドはページを配信している同一オリジンの相対パスで呼び出す（K8s内部DNSはサーバー側で使用）
        try {
            const response = await fetch(`/api/bot-stats/${botId}`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
            if (response.ok) {
                const statsData = await response.json();
                return {
                    online: statsData.online || false,
                    serverCount: statsData.server_count || 0,
                    userCount: statsData.user_count || 0,
                    vcCount: statsData.vc_count || 0,
                    uptime: statsData.uptime || 0,
                    lastUpdate: new Date().toISOString()
                };
            }
        } catch (e) {
            console.warn('backend api fetch failed, falling back to discord widget', e?.message || e);
        }

        // フォールバック: Discord ウィジェット経由で簡易ステータスを取得
        try {
            const widgetResp = await fetch(`/api/discord-widget/${botId}`);
            if (widgetResp.ok) {
                const widget = await widgetResp.json();
                return {
                    online: true,
                    serverCount: widget?.presence_count ?? 0,
                    userCount: widget?.members?.length ?? 0,
                    vcCount: widget?.presence_count ?? 0,
                    uptime: null,
                    lastUpdate: new Date().toISOString()
                };
            }
        } catch (we) {
            console.warn('discord widget fetch failed', we?.message || we);
        }

        // 両方失敗した場合は error を投げる
        throw new Error('both backend and widget fetch failed');
        
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
        { name: 'Aivis chan Bot 1台目', botId: '1333819940645638154' },
        { name: 'Aivis chan Bot 2台目', botId: '1334732369831268352' },
        { name: 'Aivis chan Bot 3台目', botId: '1334734681656262770' },
        { name: 'Aivis chan Bot 4台目', botId: '1365633502988472352' },
        { name: 'Aivis chan Bot 5台目', botId: '1365633586123771934' },
        { name: 'Aivis chan Bot 6台目', botId: '1365633656173101086' }
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
                    statValues[0].textContent = '取得中...'; // サーバー数
                    statValues[1].textContent = '取得中...'; // ユーザー数
                    statValues[2].textContent = '取得中...'; // 稼働率
                    statValues[3].textContent = '取得中...'; // VC接続数
                } else {
                    let safeServer = bot.serverCount;
                    if (safeServer === undefined || safeServer === null || safeServer === '' || (typeof safeServer === 'number' && !Number.isFinite(safeServer)) || (typeof safeServer === 'string' && safeServer === 'NaN')) safeServer = '0';
                    statValues[0].textContent = safeServer; // サーバー数
                    
                    let safeUser = bot.userCount;
                    if (safeUser === undefined || safeUser === null || safeUser === '' || (typeof safeUser === 'number' && !Number.isFinite(safeUser)) || (typeof safeUser === 'string' && safeUser === 'NaN')) safeUser = '0';
                    statValues[1].textContent = safeUser; // ユーザー数
                    
                    let safeUptime = bot.uptime;
                    if (safeUptime === undefined || safeUptime === null || safeUptime === '' || (typeof safeUptime === 'number' && !Number.isFinite(safeUptime)) || (typeof safeUptime === 'string' && safeUptime === 'NaN')) safeUptime = '0';
                    statValues[2].textContent = `${safeUptime}%`; // 稼働率
                    
                    let safeVc = bot.vcCount;
                    if (safeVc === undefined || safeVc === null || safeVc === '' || (typeof safeVc === 'number' && !Number.isFinite(safeVc)) || (typeof safeVc === 'string' && safeVc === 'NaN')) safeVc = '0';
                    statValues[3].textContent = safeVc; // VC接続数
                }
            }

            // 招待ボタンを更新
            const inviteBtn = card.querySelector('.invite-btn');
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
