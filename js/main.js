// Aivis-chan Bot メインサイト JavaScript
console.log('main.js version: 20250721');

class AivisWebsite {
    constructor() {
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupScrollEffects();
        this.setupCounters();
        this.setupIntersectionObserver();
        this.setupSmoothScroll();
        this.setupMobileMenu();
        this.setupBotStatus();
        
        // DOM が完全に読み込まれてから統計情報を設定
        setTimeout(() => {
            this.setupHeroStats();
        }, 100);
        
        console.log('🤖 Aivis-chan Bot Website loaded');
    }

    // ナビゲーション設定
    setupNavigation() {
        const header = document.querySelector('.header');
        
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                header.style.background = 'rgba(10, 14, 26, 0.95)';
                header.style.backdropFilter = 'blur(20px)';
            } else {
                header.style.background = 'rgba(10, 14, 26, 0.8)';
                header.style.backdropFilter = 'blur(10px)';
            }
        });

        // アクティブリンク設定
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');
        // safeValueの参照を削除（不要な変数参照を除去）
        window.addEventListener('scroll', () => {
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (window.scrollY >= sectionTop - 200) {
                    current = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href').includes(current)) {
                    link.classList.add('active');
                }
            });
        });
    }

    // スクロールエフェクト
    setupScrollEffects() {
        // パララックス効果
        const heroParticles = document.querySelector('.hero-particles');
        
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const rate = scrolled * -0.5;
            
            if (heroParticles) {
                heroParticles.style.transform = `translateY(${rate}px)`;
            }
        });
    }

    // カウンターアニメーション
    setupCounters() {
        // ヒーロー統計IDは除外
        const heroStatIds = ['total-servers', 'total-users', 'total-uptime', 'total-vc-users'];
        const counters = Array.from(document.querySelectorAll('.stat-number')).filter(counter => !heroStatIds.includes(counter.id));

        const animateCounter = (counter) => {
            const target = parseInt(counter.getAttribute('data-count'));
            const increment = target / 100;
            let current = 0;

            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }

                if (target === 99.9) {
                    counter.textContent = current.toFixed(1);
                } else {
                    counter.textContent = Math.floor(current).toLocaleString();
                }
            }, 20);
        };

        // Intersection Observer でカウンター開始
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counter = entry.target;
                    animateCounter(counter);
                    counterObserver.unobserve(counter);
                }
            });
        });

        counters.forEach(counter => {
            counterObserver.observe(counter);
        });
    }

    // Intersection Observer でアニメーション
    setupIntersectionObserver() {
        const animatedElements = document.querySelectorAll('.feature-card, .pricing-card, .command-card, .support-card, .step');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedElements.forEach(element => {
            observer.observe(element);
        });
    }

    // スムーススクロール
    setupSmoothScroll() {
        const links = document.querySelectorAll('a[href^="#"]');
        
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    const headerHeight = document.querySelector('.header').offsetHeight;
                    const targetPosition = targetElement.offsetTop - headerHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // モバイルメニュー
    setupMobileMenu() {
        const navToggle = document.getElementById('nav-toggle');
        const navMenu = document.querySelector('.nav-menu');
        
        if (navToggle && navMenu) {
            navToggle.addEventListener('click', () => {
                navToggle.classList.toggle('active');
                navMenu.classList.toggle('active');
            });

            // メニューリンククリック時にメニューを閉じる
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    navToggle.classList.remove('active');
                    navMenu.classList.remove('active');
                });
            });
        }
    }

    // Discord Bot招待リンク生成（メインBot用）
    generateInviteLink() {
        const botId = '1333819940645638154'; // メインBot ID
        const permissions = '3148800'; // 必要な権限
        const scope = 'bot%20applications.commands';
        
        return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=${permissions}&scope=${scope}`;
    }

    // Patreon リンク設定
    setupPatreonLinks() {
        const patreonLinks = document.querySelectorAll('a[href*="patreon.com"]');
        
        patreonLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Patreonリンククリック追跡
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'click', {
                        event_category: 'patreon',
                        event_label: 'support_link'
                    });
                }
            });
        });
    }

    // Bot状態チェック（簡易版）
    async checkBotStatus() {
        try {
            // 実際のAPIエンドポイントが無いため、簡易的な状態表示
            const statusElements = document.querySelectorAll('.bot-status');
            statusElements.forEach(element => {
                element.textContent = 'オンライン';
                element.className = 'bot-status online';
            });
            
            console.log('🤖 Bot status set to online (fallback mode)');
        } catch (error) {
            console.error('Bot status check failed:', error);
        }
    }

    // テーマ切り替え（ダークモード）
    setupThemeToggle() {
        const themeToggle = document.querySelector('.theme-toggle');
        const currentTheme = localStorage.getItem('theme') || 'dark';
        
        document.documentElement.setAttribute('data-theme', currentTheme);
        
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
            });
        }
    }

    // フォーム処理
    setupContactForm() {
        const contactForm = document.querySelector('.contact-form');
        
        if (contactForm) {
            contactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const formData = new FormData(contactForm);
                const data = Object.fromEntries(formData);
                
                try {
                    // フォーム送信処理
                    console.log('Contact form submitted:', data);
                    
                    // 成功メッセージ表示
                    this.showNotification('メッセージを送信しました！', 'success');
                    contactForm.reset();
                } catch (error) {
                    console.error('Form submission failed:', error);
                    this.showNotification('送信に失敗しました。', 'error');
                }
            });
        }
    }

    // 通知表示
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // アニメーション
        setTimeout(() => notification.classList.add('show'), 100);
        
        // 自動削除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // 検索機能
    setupSearch() {
        const searchInput = document.querySelector('.search-input');
        const searchResults = document.querySelector('.search-results');
        
        if (searchInput) {
            let searchTimeout;
            
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                
                if (query.length < 2) {
                    searchResults.innerHTML = '';
                    return;
                }
                
                searchTimeout = setTimeout(() => {
                    this.performSearch(query);
                }, 300);
            });
        }
    }

    // 検索実行
    performSearch(query) {
        // 検索対象のコンテンツ
        const searchableContent = [
            { title: 'ホーム', content: 'Aivis-chan Bot Discord 音声合成', url: '#home' },
            { title: '機能', content: '高品質音声合成 AivisSpeech Engine', url: '#features' },
            { title: 'プラン', content: 'Free Pro Premium 料金', url: '#pricing' },
            { title: '導入方法', content: 'セットアップ インストール', url: '#setup' },
            { title: 'コマンド', content: 'speak voice join leave settings help', url: '#commands' },
            { title: 'サポート', content: 'Discord サーバー ヘルプ', url: '#support' }
        ];
        
        const results = searchableContent.filter(item => 
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.content.toLowerCase().includes(query.toLowerCase())
        );
        
        this.displaySearchResults(results);
    }

    // 検索結果表示
    displaySearchResults(results) {
        const searchResults = document.querySelector('.search-results');
        
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">検索結果が見つかりませんでした</div>';
            return;
        }
        
        const resultsHTML = results.map(result => `
            <div class="search-result">
                <a href="${result.url}">
                    <h4>${result.title}</h4>
                    <p>${result.content}</p>
                </a>
            </div>
        `).join('');
        
        searchResults.innerHTML = resultsHTML;
    }

    // Botステータス取得（複数Bot対応）
    setupBotStatus() {
        // 初期ロード時にすぐに実行
        this.updateMultipleBotStatus();
        
        // 3分ごとにステータスを更新
        setInterval(() => {
            this.updateMultipleBotStatus();
        }, 180000);
        
        console.log('🤖 Bot status system initialized');
    }

    async updateBotStatus() {
        // 後方互換性のため残す（単一Bot用）
        return this.updateMultipleBotStatus();
    }

    updateStatusDisplay(data) {
        console.log('🎯 Updating status display with data:', data);

        const toSafeNumber = (value) => {
            if (typeof value === "string") {
                value = value.replace("%", "").trim();
            }
            const num = Number(value);
            return isNaN(num) ? 0 : num;
        };

        // ヒーロー統計の表示更新はupdateHeroStatsのみで行う（DOM値の直接更新は絶対にしない）
        // ここではステータスインジケーターのみ更新
        this.updateStatusIndicator(data.status || 'online');

    }



    animateCounterToValue(element, targetValue) {
        const duration = 1000;
        const steps = 60;
        const increment = targetValue / steps;
        let current = 0;

        const timer = setInterval(() => {
            current += increment;
            if (current >= targetValue) {
                current = targetValue;
                clearInterval(timer);
            }
            
            if (element.getAttribute('data-count').includes('.')) {
                element.textContent = current.toFixed(1);
            } else {
                element.textContent = Math.floor(current).toLocaleString();
            }
        }, duration / steps);
    }

    updateStatusIndicator(status) {
        // ナビゲーションにステータスインジケーターを追加
        let statusIndicator = document.querySelector('.status-indicator');
        
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.className = 'status-indicator';
            
            const navActions = document.querySelector('.nav-actions');
            if (navActions) {
                navActions.insertBefore(statusIndicator, navActions.firstChild);
            }
        }

        const statusConfig = {
            online: { color: '#57F287', text: 'オンライン' },
            idle: { color: '#FEE75C', text: 'アイドル' },
            dnd: { color: '#ED4245', text: '取り込み中' },
            offline: { color: '#747F8D', text: 'オフライン' }
        };

        const config = statusConfig[status] || statusConfig.online;
        
        statusIndicator.innerHTML = `
            <div class="status-dot" style="background-color: ${config.color}"></div>
            <span class="status-text">${config.text}</span>
        `;
    }

    // 複数Bot統合ステータス取得（Discord API使用）
    async updateMultipleBotStatus() {
        console.log('🔄 Starting bot status update...');
        
        // APIのbotIdのみで処理（ダミー番号を消す）
        const botIdToName = {
            '1333819940645638154': 'Aivis-chan Bot 1台目',
            '1334732369831268352': 'Aivis-chan Bot 2台目',
            '1334734681656262770': 'Aivis-chan Bot 3台目',
            '1365633502988472352': 'Aivis-chan Bot 4台目',
            '1365633586123771934': 'Aivis-chan Bot 5台目',
            '1365633656173101086': 'Aivis-chan Bot 6台目'
        };

        try {
            // 実際のAPIから統計情報を取得
            const apiBaseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://localhost:3001'
                : window.location.protocol + '//' + window.location.hostname;  // 同じドメインを使用
                
            const response = await fetch(`${apiBaseUrl}/api/bot-stats`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const apiData = await response.json();
            // APIレスポンスjsonを保存・上書き
            this._latestBotApiResponse = apiData;
            console.log('📊 API data received:', apiData);

            // ...ヒーロー統計の即時更新は行わず、統計値の保存のみ...

            // 全Bot統計を計算
            const allStats = {
                totalServers: 0,
                totalUsers: 0,
                totalVcUsers: 0,
                averageUptime: 0,
                onlineBots: 0,
                totalBots: Object.keys(botIdToName).length
            };

            const botStatuses = [];
            // APIから取得したデータを処理（botIdのみで処理）
            apiData.bots.forEach((botData) => {
                const botId = botData.bot_id;
                const name = botIdToName[botId] || `Bot (${botId})`;
                const isOnline = botData.success && botData.online;
                const serverCount = Number.isFinite(Number(botData.server_count)) ? Number(botData.server_count) : 0;
                const userCount = Number.isFinite(Number(botData.user_count)) ? Number(botData.user_count) : 0;
                const vcCount = Number.isFinite(Number(botData.vc_count)) ? Number(botData.vc_count) : 0;
                const uptime = Number.isFinite(Number(botData.uptime)) ? Number(botData.uptime) : 0;
                const status = {
                    botId,
                    name,
                    online: isOnline,
                    status: isOnline ? 'online' : 'offline',
                    serverCount,
                    userCount,
                    vcCount,
                    uptime
                };
                botStatuses.push(status);
                if (isOnline) {
                    allStats.totalServers += serverCount;
                    allStats.totalUsers += userCount;
                    allStats.totalVcUsers += vcCount;
                    allStats.onlineBots++;
                }
            });

            // 平均稼働率を計算
            if (allStats.onlineBots > 0) {
                const uptimeSum = botStatuses
                    .filter(bot => bot.online)
                    .reduce((sum, bot) => sum + bot.uptime, 0);
                allStats.averageUptime = uptimeSum / allStats.onlineBots;
            }

            console.log('📈 Calculated stats:', allStats);

            // 最新のbotステータスを保存
            this._latestBotStatuses = botStatuses;

            // 統計情報を更新
            this.updateStatusDisplay({
                serverCount: allStats.totalServers,
                userCount: allStats.totalUsers,
                vcCount: allStats.totalVcUsers,
                uptime: allStats.averageUptime,
                status: 'online'
            });

            // 詳細ステータスを更新
            this.updateDetailedBotStatus(botStatuses, allStats);

        } catch (error) {
            console.error('❌ Error fetching real bot status:', error);
            // エラー内容を画面に通知
            this._latestBotStatuses = [];
            this._latestBotApiResponse = {
                bots: [],
                total_bots: 0,
                online_bots: 0,
                timestamp: new Date().toISOString(),
                error: error.message || String(error)
            };
            this.updateStatusDisplay({
                serverCount: 0,
                userCount: 0,
                vcCount: 0,
                uptime: 0,
                status: 'offline'
            });
            this.updateDetailedBotStatus([], {
                totalServers: 0,
                totalUsers: 0,
                totalVcUsers: 0,
                averageUptime: 0,
                onlineBots: 0,
                totalBots: 0
            });
            this.showNotification('Botステータス取得エラー: ' + (error.message || String(error)), 'error');
        }
    }

    updateDetailedBotStatus(botStatuses, allStats) {
        console.log('🎯 Updating detailed bot status...', botStatuses);
        
        // 既存の読み込み中のカードを更新
        const botCards = document.querySelectorAll('.bot-detail-card');
        console.log(`Found ${botCards.length} bot cards to update`);
        
        botStatuses.forEach((bot, index) => {
            if (botCards[index]) {
                const card = botCards[index];
                console.log(`Updating card ${index + 1} for ${bot.name}`);
                
                // カードのクラスを更新
                card.className = `bot-detail-card ${bot.online ? 'online' : 'offline'}`;
                
                // ステータスバッジを更新
                const statusBadge = card.querySelector('.bot-status-badge');
                if (statusBadge) {
                    statusBadge.textContent = bot.online ? 'オンライン' : 'オフライン';
                    statusBadge.className = `bot-status-badge ${bot.online ? 'online' : 'offline'}`;
                    console.log(`Status badge updated: ${statusBadge.textContent}`);
                }
                
                // 統計値を更新（VC接続数を含む）
                const statValues = card.querySelectorAll('.stat-item .value');
                if (statValues.length >= 3) {
                    statValues[0].textContent = (bot.serverCount || 0).toLocaleString();
                    statValues[1].textContent = (bot.userCount || 0).toLocaleString(); 
                    statValues[2].textContent = `${(bot.uptime || 0).toFixed(1)}%`;
                    
                    // VC接続数が4番目の統計として存在する場合
                    if (statValues[3]) {
                        statValues[3].textContent = (bot.vcCount || 0).toLocaleString();
                    }
                    
                    console.log(`Stats updated: servers=${statValues[0].textContent}, users=${statValues[1].textContent}, uptime=${statValues[2].textContent}, vc=${statValues[3] ? statValues[3].textContent : 'N/A'}`);
                }
                
                // 招待ボタンがあれば更新
                const inviteBtn = card.querySelector('.btn');
                if (inviteBtn && bot.botId) {
                    inviteBtn.href = this.generateSpecificInviteLink(bot.botId);
                    inviteBtn.textContent = `${bot.name}を招待`;
                    console.log(`Invite button updated for ${bot.name}`);
                }
            }
        });
        
        console.log('✅ Detailed bot status update completed');
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusIndicator) {
            const onlineCount = allStats.onlineBots;
            const totalCount = allStats.totalBots;
            const statusText = statusIndicator.querySelector('.status-text');
            
            if (statusText) {
                statusText.textContent = `${onlineCount}/${totalCount} Bot稼働中`;
            }

            // ツールチップで詳細表示
            const tooltip = this.createBotStatusTooltip(botStatuses);
            statusIndicator.appendChild(tooltip);

            // ホバーイベント
            statusIndicator.addEventListener('mouseenter', () => {
                tooltip.style.display = 'block';
            });
            statusIndicator.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        }

        // Bot詳細ページがある場合の更新
        this.updateBotDetailPage(botStatuses);
    }

    createBotStatusTooltip(botStatuses) {
        const existingTooltip = document.querySelector('.bot-status-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        const tooltip = document.createElement('div');
        tooltip.className = 'bot-status-tooltip';
        
        const tooltipContent = botStatuses.map(bot => {
            const statusColor = bot.online ? '#57F287' : '#747F8D';
            const statusIcon = bot.online ? '●' : '○';
            
            return `
                <div class="bot-status-item">
                    <span class="bot-status-icon" style="color: ${statusColor}">${statusIcon}</span>
                    <span class="bot-name">${bot.name}</span>
                    <span class="bot-servers">${bot.serverCount || 'N/A'}</span>
                </div>
            `;
        }).join('');

        tooltip.innerHTML = `
            <div class="tooltip-header">Bot Status Details</div>
            <div class="tooltip-content">${tooltipContent}</div>
        `;

        return tooltip;
    }

    updateBotDetailPage(botStatuses) {
        // 詳細ページで利用する場合の実装（現在は空実装）
        console.log('updateBotDetailPage called with:', botStatuses);
    }

    generateSpecificInviteLink(botId) {
        return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=3145728&scope=bot`;
    }

    // ヒーロー統計情報の設定と更新
    async setupHeroStats() {
        console.log('🔢 Setting up hero statistics...');

        // 初期値を直接0でセット（NaN点滅防止・HTML初期値補正）
        const statIds = ['total-servers', 'total-users', 'total-vc-users', 'total-uptime'];
        statIds.forEach(id => {
            let el = document.getElementById(id)
                || document.querySelector(`[data-api="${id}"]`)
                || document.querySelector(`.${id}`);
            if (el) {
                el.textContent = (id === 'total-uptime') ? '0.0' : '0';
            }
        });

        // さらにanimateHeroStatで0をセット
        this.animateHeroStat('total-servers', 0);
        this.animateHeroStat('total-users', 0);
        this.animateHeroStat('total-vc-users', 0);
        this.animateHeroStat('total-uptime', 0);

        // APIから実際のデータを取得（初期化時は1秒遅延）
        setTimeout(() => {
            this.updateHeroStats();
        }, 1000);

        // 60秒ごとに統計情報を更新（VC接続数は変動が激しいため）
        setInterval(() => {
            this.updateHeroStats();
        }, 60 * 1000);
    }

    async updateHeroStats() {
        try {
            // API取得は行わず、キャッシュのみ参照
            const botStatuses = Array.isArray(this._latestBotStatuses) ? this._latestBotStatuses : [];
            console.log('🟦 [DEBUG] botStatuses for hero stats:', JSON.stringify(botStatuses, null, 2));

            // キャッシュが空なら0で補正
            if (!botStatuses || botStatuses.length === 0) {
                console.warn("⚠️ botStatuses cache is empty, setting hero stats to 0");
                this.animateHeroStat('total-servers', 0);
                this.animateHeroStat('total-users', 0);
                this.animateHeroStat('total-vc-users', 0);
                this.animateHeroStat('total-uptime', 0);
                return;
            }

            let servers = 0, users = 0, vcUsers = 0, uptimeSum = 0;
            botStatuses.forEach(bot => {
                let s = Number.isFinite(Number(bot.serverCount)) ? Number(bot.serverCount) : 0;
                let u = Number.isFinite(Number(bot.userCount)) ? Number(bot.userCount) : 0;
                let v = Number.isFinite(Number(bot.vcCount)) ? Number(bot.vcCount) : 0;
                let up = Number.isFinite(Number(bot.uptime)) ? Number(bot.uptime) : 0;
                servers += s;
                users += u;
                vcUsers += v;
                uptimeSum += up;
            });

            const count = botStatuses.length;
            const avgServers = count > 0 ? servers / count : 0;
            const avgUsers = count > 0 ? users / count : 0;
            const avgVcUsers = count > 0 ? vcUsers / count : 0;
            const avgUptime = count > 0 ? uptimeSum / count : 0;

            let dispServers = Number.isFinite(avgServers) ? Math.round(avgServers) : 0;
            let dispUsers = Number.isFinite(avgUsers) ? Math.round(avgUsers) : 0;
            let dispVcUsers = Number.isFinite(avgVcUsers) ? Math.round(avgVcUsers) : 0;
            let dispUptime = Number.isFinite(avgUptime) ? avgUptime.toFixed(1) : '0.0';

            // NaN補正
            dispServers = isNaN(dispServers) ? 0 : dispServers;
            dispUsers = isNaN(dispUsers) ? 0 : dispUsers;
            dispVcUsers = isNaN(dispVcUsers) ? 0 : dispVcUsers;
            dispUptime = isNaN(Number(dispUptime)) ? 0 : Number(dispUptime);

            this.animateHeroStat('total-servers', dispServers);
            this.animateHeroStat('total-users', dispUsers);
            this.animateHeroStat('total-uptime', dispUptime);
            this.animateHeroStat('total-vc-users', dispVcUsers);

            console.log('📈 Hero stats updated (average, formatted):', {
                dispServers,
                dispUsers,
                dispVcUsers,
                dispUptime
            });
        } catch (error) {
            // キャッシュ取得失敗時も必ず0で補正
            console.error('❌ Error fetching hero stats:', error);
            this.animateHeroStat('total-servers', 0);
            this.animateHeroStat('total-users', 0);
            this.animateHeroStat('total-vc-users', 0);
            this.animateHeroStat('total-uptime', 0);
        }
    }



    // 統計数値をアニメーションで表示（クールダウン付き）
    animateHeroStat(elementId, targetValue) {
        // クールダウン管理用プロパティ初期化
        if (!this._heroStatCooldowns) {
            this._heroStatCooldowns = {};
        }
        const now = Date.now();
        const cooldownMs = 300; // 300msクールダウン
        let targetElement = document.getElementById(elementId)
            || document.querySelector(`[data-api="${elementId}"]`)
            || document.querySelector(`.${elementId}`);

        if (!targetElement) {
            console.warn(`[WARN] HeroStat element not found: ${elementId}`);
            return;
        }

        // 型変換とNaN防止（targetValueの補正）
        let safeValue = targetValue;
        if (safeValue === undefined || safeValue === null || safeValue === '' || (typeof safeValue === 'number' && !Number.isFinite(safeValue)) || (typeof safeValue === 'string' && (safeValue === 'NaN' || isNaN(Number(safeValue)))) ) {
            safeValue = 0;
        }
        safeValue = Number(safeValue);
        if (!Number.isFinite(safeValue) || isNaN(safeValue)) safeValue = 0;

        // 現在の表示値取得（textContentの補正）
        let text = targetElement.textContent;
        if (text === undefined || text === null || text === '' || text === 'NaN' || isNaN(Number(text))) text = '0';

        let currentValue;
        if (elementId === 'total-uptime' || elementId.includes('uptime')) {
            currentValue = parseFloat(text);
            if (!Number.isFinite(currentValue) || isNaN(currentValue)) currentValue = 0;
            // 値が同じなら何もしない
            if (currentValue === safeValue) return;
        } else {
            currentValue = parseInt(text.replace(/,/g, ''));
            if (!Number.isFinite(currentValue) || isNaN(currentValue)) currentValue = 0;
            if (currentValue === Math.round(safeValue)) return;
        }
        // クールダウン判定（値が変わった時のみリセット）
        const lastUpdate = this._heroStatCooldowns[elementId] || 0;
        if (now - lastUpdate < cooldownMs) {
            // クールダウン中は更新しない
            return;
        }
        this._heroStatCooldowns[elementId] = now;

        // 表示値を更新（NaN防止）
        if (elementId === 'total-uptime' || elementId.includes('uptime')) {
            targetElement.textContent = (Number.isFinite(safeValue) && !isNaN(safeValue)) ? safeValue.toFixed(1) : '0.0';
        } else {
            targetElement.textContent = (Number.isFinite(safeValue) && !isNaN(safeValue)) ? Math.round(safeValue).toLocaleString() : '0';
        }
    }
}

// 指定要素の数値をアニメーションで更新する（汎用版）
function animateElement(element, targetValue, elementId) {
    if (!element) return;
    let startValue;
    // 現在の値がNaNの場合は0にする
    if (elementId === 'total-uptime' || elementId.includes('uptime')) {
        startValue = parseFloat(element.textContent);
        if (!Number.isFinite(startValue)) startValue = 0;
    } else {
        startValue = parseInt((element.textContent || '0').replace(/,/g, ''));
        if (!Number.isFinite(startValue)) startValue = 0;
    }
    let endValue = typeof targetValue === 'string' ? Number(targetValue) : targetValue;
    if (!Number.isFinite(endValue)) endValue = 0;

    const duration = 800;
    const frameRate = 30;
    const totalFrames = Math.round(duration / (1000 / frameRate));
    let frame = 0;

    const animate = () => {
        frame++;
        let progress = frame / totalFrames;
        if (progress > 1) progress = 1;
        let value = startValue + (endValue - startValue) * progress;

        // NaN防止
        if (!Number.isFinite(value)) value = 0;

        if (elementId === 'total-uptime' || elementId.includes('uptime')) {
            element.textContent = (!isNaN(value)) ? value.toFixed(1) : '0.0';
        } else {
            element.textContent = (!isNaN(value)) ? Math.round(value).toLocaleString() : '0';
        }

        if (frame < totalFrames) {
            requestAnimationFrame(animate);
        } else {
            // 最終値で上書き
            if (elementId === 'total-uptime' || elementId.includes('uptime')) {
                element.textContent = (!isNaN(endValue)) ? endValue.toFixed(1) : '0.0';
            } else {
                element.textContent = (!isNaN(endValue)) ? Math.round(endValue).toLocaleString() : '0';
            }
        }
    };
    animate();
}

// コピー機能
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // 成功時の処理
        console.log('Copied to clipboard:', text);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// 共有機能
function shareContent(title, text, url) {
    if (navigator.share) {
        navigator.share({
            title: title,
            text: text,
            url: url
        });
    } else {
        // フォールバック: クリップボードにコピー
        copyToClipboard(url);
    }
}

// Service Worker 登録
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

// ページ読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
    // グローバル変数でインスタンス管理（多重生成防止）
    if (!window.website) {
        window.website = new AivisWebsite();
    }

    // デバッグ用: グローバルスコープにテスト関数を追加
    window.testBotStatus = () => {
        console.log('🧪 Manual bot status test triggered');
        window.website.updateMultipleBotStatus();
    };

    // デバッグ用: 5秒後に手動実行
    setTimeout(() => {
        console.log('🔍 Auto-testing bot status after 5 seconds...');
        window.website.updateMultipleBotStatus();
    }, 5000);
});

// リサイズイベント
window.addEventListener('resize', () => {
    // レスポンシブ対応の処理
});

// ページ離脱前の処理
window.addEventListener('beforeunload', () => {
    // 必要に応じてデータ保存など
});

// エラーハンドリング
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

// デバッグ用
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
    console.log('🔧 Development mode enabled');
    
    // デバッグ用の関数をグローバルに追加
    window.aivisDebug = {
        showStats: () => console.table({
            userAgent: navigator.userAgent,
            language: navigator.language,
            onLine: navigator.onLine,
            cookieEnabled: navigator.cookieEnabled
        }),
        testNotification: () => new AivisWebsite().showNotification('テスト通知', 'success'),
        showBotIds: () => {
            const botIds = [
                { name: 'Aivis-chan Bot 1台目', id: '1333819940645638154' },
                { name: 'Aivis-chan Bot 2台目', id: '1334732369831268352' },
                { name: 'Aivis-chan Bot 3台目', id: '1334734681656262770' },
                { name: 'Aivis-chan Bot 4台目', id: '1365633502988472352' },
                { name: 'Aivis-chan Bot 5台目', id: '1365633586123771934' },
                { name: 'Aivis-chan Bot 6台目', id: '1365633656173101086' }
            ];
            console.table(botIds);
        },
        testBotStatus: () => new AivisWebsite().updateMultipleBotStatus(),
        generateAllInviteLinks: () => {
            const website = new AivisWebsite();
            const botIds = ['1333819940645638154', '1334732369831268352', '1334734681656262770', '1365633502988472352', '1365633586123771934', '1365633656173101086'];
            const links = botIds.map(id => website.generateSpecificInviteLink(id));
            console.log('🔗 All Bot Invite Links:', links);
            return links;
        }
    };
}
