// status/js/status.js
// サーバーステータス表示用スクリプト

// APIエンドポイント（必要に応じて変更）
const API_URL = "https://aivis-chan-bot.com/api/status";

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateStatus() {
    fetch(API_URL)
        .then(res => res.json())
        .then(data => {
            // Bot名やステータスを表示
            const botCard = document.querySelector('.bot-detail-card');
            if (!botCard || !data) return;

            // オンライン/オフライン表示
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
            if (serverElem) serverElem.textContent = data.servers || "-";

            // 稼働率
            const uptimeElem = botCard.querySelectorAll('.stat-item .value')[1];
            if (uptimeElem) uptimeElem.textContent = (data.uptime ? `${data.uptime}%` : "-");

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
