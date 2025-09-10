// Aivis-chan Bot Status Update Script - Real Discord API Integration

// 集約データを優先利用するため、個別Bot取得は極力行わない設計に変更
function mapAggregatedBot(botObj) {
    if (!botObj) return { online: null, serverCount: null, userCount: null, vcCount: null, shardCount: null };
    const serverCount = Number.isFinite(Number(botObj.server_count)) ? Number(botObj.server_count) : 0;
    const userCount = Number.isFinite(Number(botObj.user_count)) ? Number(botObj.user_count) : 0;
    const vcCount = Number.isFinite(Number(botObj.vc_count)) ? Number(botObj.vc_count) : 0;
    const shardCount = Number.isFinite(Number(botObj.shard_count)) ? Number(botObj.shard_count) : 0;
    return {
        online: !!(botObj.success && botObj.online),
        serverCount,
        userCount,
        vcCount,
        shardCount,
        uptime: botObj.uptime || 0,
        lastUpdate: new Date().toISOString()
    };
}

async function ensureAggregatedSnapshot() {
    // 既に main.js が取得している場合はそれを使う
    const existing = window.website?._latestBotApiResponse;
    if (existing && Array.isArray(existing.bots) && existing.bots.length > 0) return existing;
    // 無い場合は自力で1回だけ取得
    try {
        const base = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : '';
        const r = await fetch(`${base}/api/bot-stats`, { headers: { 'Content-Type': 'application/json' } });
        if (r.ok) {
            const json = await r.json();
            // cache へ保存
            if (window.website) window.website._latestBotApiResponse = json;
            return json;
        }
    } catch (e) {
        console.warn('ensureAggregatedSnapshot fetch failed', e.message || e);
    }
    return null;
}

async function updateBotStatus() {
    console.log('🔄 Updating bot cards from aggregated data...');
    const mapping = [
        { name: 'Aivis chan Bot 1台目', botId: '1333819940645638154' },
        { name: 'Aivis chan Bot 2台目', botId: '1334732369831268352' },
        { name: 'Aivis chan Bot 3台目', botId: '1334734681656262770' },
        { name: 'Aivis chan Bot 4台目', botId: '1365633502988472352' },
        { name: 'Aivis chan Bot 5台目', botId: '1365633586123771934' },
    { name: 'Aivis chan Bot 6台目', botId: '1365633656173101086' },
    { name: 'Aivis-chan Bot Pro/Premium', botId: '1415251855147008023' }
    ];

    const aggregated = await ensureAggregatedSnapshot();
    const list = mapping.map(m => {
        const botObj = aggregated?.bots?.find(b => b.bot_id === m.botId);
        return { ...m, ...mapAggregatedBot(botObj) };
    });

    const botCards = document.querySelectorAll('.bot-detail-card');
    console.log(`Found ${botCards.length} bot cards to update`);
    list.forEach((bot, index) => {
        if (!botCards[index]) return;
        const card = botCards[index];
        const loading = bot.online === null;
        card.className = loading ? 'bot-detail-card loading' : `bot-detail-card ${bot.online ? 'online' : 'offline'}`;
        const statusBadge = card.querySelector('.bot-status-badge');
        if (statusBadge) {
            if (loading) {
                statusBadge.textContent = 'API取得中...';
                statusBadge.className = 'bot-status-badge loading';
            } else {
                statusBadge.textContent = bot.online ? 'オンライン' : 'オフライン';
                statusBadge.className = `bot-status-badge ${bot.online ? 'online' : 'offline'}`;
            }
        }
        const statValues = card.querySelectorAll('.stat-item .value');
        if (statValues.length >= 4) {
            if (loading) {
                statValues[0].textContent = '取得中...';
                statValues[1].textContent = '取得中...';
                statValues[2].textContent = '取得中...';
                statValues[3].textContent = '取得中...';
            } else {
                statValues[0].textContent = bot.serverCount ?? 0;
                statValues[1].textContent = bot.userCount ?? 0;
                statValues[2].textContent = bot.shardCount ?? 0;
                statValues[3].textContent = bot.vcCount ?? 0;
            }
        }
        const inviteBtn = card.querySelector('.invite-btn');
        if (inviteBtn) {
            inviteBtn.href = `https://discord.com/api/oauth2/authorize?client_id=${bot.botId}&permissions=3148800&scope=bot%20applications.commands`;
            inviteBtn.textContent = `${bot.name}を招待`;
        }
    });
    console.log('✅ Bot status update completed (aggregated)');
}

// ページ読み込み後に実行
document.addEventListener('DOMContentLoaded', function() {
    console.log('🤖 Bot Status Script loaded');
    // 初回（main.js が先に取得するかもしれないので少し遅延）
    setTimeout(updateBotStatus, 1500);
    // 3分ごと（main.js も 3分周期なのでズレ軽減のため +5秒）
    setInterval(updateBotStatus, 180000 + 5000);
    // 集約イベントを購読
    window.addEventListener('BotStatsAggregatedUpdate', () => {
        updateBotStatus();
    });
    // デバッグ用
    window.testBotStatus = updateBotStatus;
});
