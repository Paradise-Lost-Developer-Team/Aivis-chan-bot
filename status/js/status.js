// status/js/status.js
// サーバーステータス表示用スクリプト

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

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateStatus() {
    // APIエンドポイントを環境で切り替え
    const apiBaseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'  // 開発環境
        : window.location.protocol + '//' + window.location.hostname;  // 本番環境（同じドメイン）
    const API_URL = `${apiBaseUrl}/api/status`;
    fetch(API_URL)
        .then(res => res.json())
        .then(data => {
            // 自作API: { servers, uptime, online, last_update }
            const botCard = document.querySelector('.bot-detail-card');
            if (!botCard || !data) return;

            // オンライン判定
            const badge = botCard.querySelector('.bot-status-badge');
            if (badge) {
                if (data.online) {
                    badge.textContent = "オンライン";
                    badge.classList.add("online");
                    badge.classList.remove("offline");
                    botCard.classList.add("online");
                    botCard.classList.remove("offline");
                } else {
                    badge.textContent = "オフライン";
                    badge.classList.add("offline");
                    badge.classList.remove("online");
                    botCard.classList.add("offline");
                    botCard.classList.remove("online");
                }
            }

            // サーバー数
            const serverElem = botCard.querySelector('.stat-item .value');
            if (serverElem) serverElem.textContent = data.servers ?? "-";

            // 稼働率
            const uptimeElem = botCard.querySelectorAll('.stat-item .value')[1];
            if (uptimeElem) uptimeElem.textContent = (data.uptime !== undefined ? `${data.uptime}%` : "-");

            // 最終更新
            const updateElem = botCard.querySelectorAll('.stat-item .value')[2];
            if (updateElem) updateElem.textContent = data.last_update ? formatDate(data.last_update) : "-";
        })
        .catch(() => {
            // エラー時はオフライン表示
            const botCard = document.querySelector('.bot-detail-card');
            if (!botCard) return;
            const badge = botCard.querySelector('.bot-status-badge');
            if (badge) {
                badge.textContent = "取得失敗";
                badge.classList.add("offline");
                badge.classList.remove("online");
            }
            botCard.classList.add("offline");
            botCard.classList.remove("online");
            const values = botCard.querySelectorAll('.stat-item .value');
            values.forEach(v => v.textContent = "-");
        });
}

document.addEventListener('DOMContentLoaded', () => {
    updateStatus();
    setInterval(updateStatus, 30000); // 30秒ごとに更新
});
