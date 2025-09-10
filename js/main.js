// Aivis-chan Bot メインサイト JavaScript
const __AIVIS_DEBUG__ = /[?&]debug=1/.test(window.location.search) || (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development');
if (__AIVIS_DEBUG__) console.log('main.js version: 20250909');

// APIベースURLを動的に決定（クラスタ内部 / 外部ドメイン両対応）
function getApiBaseUrl() {
    try {
        const h = window.location.hostname;
        // K8s 内部 Pod / Service 直接アクセス時
        if (h === 'aivis-chan-bot-web.aivis-chan-bot-web' || h === 'aivis-chan-bot-web.aivis-chan-bot-web.svc.cluster.local') {
            return 'http://aivis-chan-bot-web.aivis-chan-bot-web:3001';
        }
        return window.location.protocol + '//' + h;
    } catch (e) {
        console.warn('getApiBaseUrl fallback', e);
        return '';
    }
}
window.getApiBaseUrl = getApiBaseUrl; // 他スクリプトからも利用可

// 音声ファイルの拡張子をOpusへ正規化
function normalizeToOpus(path) {
    if (typeof path !== 'string') return path;
    return path.replace(/\.wav(\b|$)/i, '.opus');
}

// 長時間タスクの回避: 配列処理をバッチに分けてメインスレッドを譲る
async function processInBatches(items, batchSize, callback) {
    const len = items.length;
    for (let i = 0; i < len; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        for (let j = 0; j < batch.length; j++) {
            await callback(batch[j], i + j);
        }
        // 次フレームまでメインスレッドを解放
        await new Promise(requestAnimationFrame);
    }
}

class AivisWebsite {
    constructor() {
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupScrollEffects();
    // 非クリティカルはアイドル時に遅延実行
    this.deferNonCriticalInit();
    this.setupActiveSectionObserver();
        this.setupSmoothScroll();
        this.setupMobileMenu();
        this.setupBotStatus();
    this.setupThirdPartyLazyLoad();
    this.setupMediaLazyLoad();
    // フォーム要素のアクセシビリティ改善（selectにラベル付与）
    this.setupVoiceSelectA11y();
        
        // DOM が完全に読み込まれてから統計情報を設定
        setTimeout(() => {
            this.setupHeroStats();
        }, 100);
        
        if (__AIVIS_DEBUG__) console.log('🤖 Aivis-chan Bot Website loaded');
    }

    // 画像・音声の遅延読み込み（初期ペイロード圧縮）
    setupMediaLazyLoad() {
        // 声一覧などの画像は遅延読み込み
        document.querySelectorAll('.voices .voice-avatar img').forEach(img => {
            try {
                img.loading = 'lazy';
                img.decoding = 'async';
            } catch {}
        });

        // 音声は初期ロードを避け、再生時にだけ読み込む
        const lazyifyAudio = (audio) => {
            if (!(audio instanceof HTMLAudioElement)) return;
            // 既に初期化済みならスキップ
            if (audio.__lazyAudioInit) return;
            audio.__lazyAudioInit = true;

            // 元のsrcをdata-srcへ移動
            let src = audio.getAttribute('src');
            if (src) {
                audio.setAttribute('data-src', normalizeToOpus(src));
                audio.removeAttribute('src');
            }
            // 既にdata-srcがある場合も正規化
            const ds = audio.getAttribute('data-src');
            if (ds) audio.setAttribute('data-src', normalizeToOpus(ds));
            // 事前取得しない
            audio.preload = 'none';

            const ensureLoadAndPlay = () => {
                if (audio.__loadedOnce) return; // 既にロード済み
                const dataSrc = normalizeToOpus(audio.getAttribute('data-src'));
                if (!dataSrc) return;
                audio.pause();
                audio.src = dataSrc;
                // メタデータだけ先に
                audio.preload = 'metadata';
                audio.load();
                audio.addEventListener('canplay', () => {
                    // ユーザーが再生済みなら再開
                    if (!audio.paused) return; // 別の操作で再開済み
                    audio.play().catch(() => {});
                }, { once: true });
                audio.__loadedOnce = true;
            };

            // 再生要求が来たタイミングでロード
            audio.addEventListener('play', (e) => {
                if (!audio.__loadedOnce) {
                    // 初回は一旦止めてロード→再生
                    audio.pause();
                    ensureLoadAndPlay();
                }
            }, { passive: true });
        };

        document.querySelectorAll('audio').forEach(lazyifyAudio);

        // セレクトのoption値も .opus に正規化（UI側の一貫性維持）
        document.querySelectorAll('.voice-style-select option').forEach(opt => {
            const v = opt.getAttribute('value');
            if (v && /\.wav(\b|$)/i.test(v)) {
                opt.setAttribute('value', normalizeToOpus(v));
            }
        });
    }

    // 声スタイル select のアクセシビリティ補完（ID/ラベル/aria-label を動的付与）
    setupVoiceSelectA11y() {
        try {
            const makeSlug = (text) => {
                return String(text || '')
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\p{L}\p{N}_-]+/gu, '')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
            };

            const usedIds = new Set(Array.from(document.querySelectorAll('[id]')).map(el => el.id));
            const ensureUniqueId = (base) => {
                let id = base;
                let i = 1;
                while (!id || usedIds.has(id)) {
                    id = `${base || 'voice-style'}-${i++}`;
                }
                usedIds.add(id);
                return id;
            };

            document.querySelectorAll('.voice-card').forEach((card) => {
                const select = card.querySelector('.voice-style-select');
                if (!select) return;

                const voiceName = (card.querySelector('.voice-name')?.textContent || '音声').trim();

                // ID 付与
                if (!select.id) {
                    const base = `voice-style-${makeSlug(voiceName)}`;
                    select.id = ensureUniqueId(base);
                }

                // 既存ラベル確認（for 属性で関連付け済みか）
                let label = card.querySelector(`label[for="${CSS.escape(select.id)}"]`);
                if (!label) {
                    // 直前に label がある場合も認識（for 無し）
                    const prev = select.previousElementSibling;
                    if (prev && prev.tagName === 'LABEL') {
                        label = prev;
                        // for を補完
                        if (!label.htmlFor) label.htmlFor = select.id;
                    }
                }

                // ラベルが無ければ sr-only で動的生成
                if (!label) {
                    label = document.createElement('label');
                    label.className = 'sr-only';
                    label.setAttribute('for', select.id);
                    label.textContent = `${voiceName} の音声スタイル`;
                    select.parentElement?.insertBefore(label, select);
                }

                // スクリーンリーダー向けの名前（フォールバック）
                if (!select.getAttribute('aria-label')) {
                    select.setAttribute('aria-label', `${voiceName} の音声スタイル`);
                }
            });
        } catch (e) {
            console.warn('setupVoiceSelectA11y failed:', e);
        }
    }

    // 第三者スクリプトの遅延ロード（Ads/Analytics）
    setupThirdPartyLazyLoad() {
        // Ads無効化フラグ（開発時や検証時に警告を避けるため）
        const qs = new URLSearchParams(window.location.search);
        const disableAds = qs.get('ads') === '0' || qs.get('noads') === '1' || localStorage.getItem('disableAds') === '1';

        const loadGtag = () => {
            const idMeta = document.querySelector('meta[name="gtag-id"]');
            const gtagId = idMeta && idMeta.getAttribute('content');
            if (!gtagId || window.__gtagLoaded) return;
            window.__gtagLoaded = true;
            const s = document.createElement('script');
            s.async = true;
            s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagId)}`;
            document.head.appendChild(s);
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){ dataLayer.push(arguments); };
            gtag('js', new Date());
            gtag('config', gtagId, { anonymize_ip: true });
        };

        const loadAds = () => {
            if (disableAds) {
                if (__AIVIS_DEBUG__) console.info('[Ads] disabled via flag (ads=0 / noads=1 / localStorage.disableAds=1)');
                return;
            }
            const adsMeta = document.querySelector('meta[name="ads-client"]');
            const client = adsMeta && adsMeta.getAttribute('content');
            if (!client || window.__adsbygoogleLoaded) return;
            window.__adsbygoogleLoaded = true;
            const s = document.createElement('script');
            s.async = true;
            s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
            s.setAttribute('crossorigin', 'anonymous');
            document.head.appendChild(s);
        };

        // GAは初回インタラクション、またはページ完全ロード後しばらく経ってから
        const onFirstInteraction = () => {
            loadGtag();
            window.removeEventListener('pointerdown', onFirstInteraction); 
            window.removeEventListener('keydown', onFirstInteraction);
        };
        window.addEventListener('pointerdown', onFirstInteraction, { once: true, passive: true });
        window.addEventListener('keydown', onFirstInteraction, { once: true });

        // ページ完全ロード後、余裕ができてから（8秒後）読み込み
        window.addEventListener('load', () => {
            setTimeout(() => { loadGtag(); }, 8000);
        }, { once: true });

        // タブが非表示になったタイミングでのバックグラウンド読み込み（任意）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                loadGtag();
            }
        }, { once: true });

        // 広告は可視化された場合にのみ読み込む（初回操作やidleでは読み込まない）
        const adContainer = document.querySelector('.ad-container, .adsbygoogle');
        if (!disableAds && adContainer && 'IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        loadAds();
                        io.disconnect();
                    }
                });
            }, { rootMargin: '200px' });
            io.observe(adContainer);
        }
    }

    // 非クリティカル機能の遅延初期化
    deferNonCriticalInit() {
        const ric = window.requestIdleCallback || function(cb){ setTimeout(() => cb({ timeRemaining: () => 50 }), 1); };
        ric(() => {
            this.setupCounters();
            this.setupIntersectionObserver();
            this.setupPatreonLinks();
            this.setupThemeToggle();
            this.setupContactForm();
            this.setupSearch();
        });
    }

    // ナビゲーション設定
    setupNavigation() {
        const header = document.querySelector('.header');
        if (!header) return;

        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) {
            // モバイルはスクロールによるヘッダー更新を無効化（安定優先）
            header.classList.toggle('header--scrolled', false);
            return;
        }

        let isScrolled = null; // 未設定
        const updateHeaderState = (y) => {
            const next = y > 100;
            if (next === isScrolled) return;
            isScrolled = next;
            requestAnimationFrame(() => {
                header.classList.toggle('header--scrolled', next);
            });
        };

        // 初期同期
        requestAnimationFrame(() => updateHeaderState(window.pageYOffset || window.scrollY || 0));

        window.addEventListener('scroll', () => {
            const y = window.pageYOffset || window.scrollY || 0;
            updateHeaderState(y);
        }, { passive: true });
    }

    // スクロールエフェクト
    setupScrollEffects() {
        const heroParticles = document.querySelector('.hero-particles');
        if (!heroParticles) return;

        // 低負荷化: モバイルや reduce-motion では無効化
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (reduceMotion || isMobile) return;

        let scheduled = false;
        let lastScrollY = 0;
        let lastApplied = null;

        const apply = () => {
            scheduled = false;
            const ty = Math.round(lastScrollY * -0.5);
            if (ty === lastApplied) return; // 変化が小さい時はスキップ
            lastApplied = ty;
            heroParticles.style.transform = `translate3d(0, ${ty}px, 0)`;
        };

        window.addEventListener('scroll', () => {
            lastScrollY = window.pageYOffset || window.scrollY || 0;
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(apply);
            }
        }, { passive: true });
    }

    // アクティブセクションの監視（IntersectionObserverでリフローミティゲート）
    setupActiveSectionObserver() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = Array.from(document.querySelectorAll('.nav-link'));
        if (!sections.length || !navLinks.length) return;

        const setActive = (id) => {
            navLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                // '/#features' のような形式にも対応
                const matches = href.includes(`#${id}`);
                link.classList.toggle('active', matches);
            });
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    if (id) setActive(id);
                }
            });
        }, {
            root: null,
            // ビューポート中央付近に来たらアクティブ化
            rootMargin: '-40% 0px -50% 0px',
            threshold: 0.01
        });

        sections.forEach(sec => observer.observe(sec));
        // 初期状態同期
        const current = (location.hash || '#home').replace('#', '');
        if (current) setActive(current);
    }

    // カウンターアニメーション
    setupCounters() {
    // ヒーロー統計IDは除外（total-uptime を total-shard に置換）
    const heroStatIds = ['total-servers', 'total-users', 'total-shard', 'total-vc-users'];
        const counters = Array.from(document.querySelectorAll('.stat-number')).filter(counter => !heroStatIds.includes(counter.id));
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        const animateCounter = (counter) => {
            const raw = counter.getAttribute('data-count');
            let target = Number(raw);
            if (!Number.isFinite(target)) target = 0;
            const isDecimal = String(raw || '').includes('.');

            // 低負荷化: モバイルや reduce-motion ではアニメーションせず即時反映
            if (reduceMotion || isMobile) {
                counter.textContent = isDecimal ? target.toFixed(1) : Math.floor(target).toLocaleString();
                return;
            }

            // デスクトップのみ短時間のrAFアニメーション（約600ms）
            const duration = 600;
            const start = performance.now();
            const step = (now) => {
                const t = Math.min(1, (now - start) / duration);
                const val = target * t;
                counter.textContent = isDecimal ? val.toFixed(1) : Math.floor(val).toLocaleString();
                if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
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

    // スムーススクロール（強制リフロー回避: geometryの同期読み取りをしない）
    setupSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href') || '';
                if (!href.startsWith('#')) return; // 他のリンクは無視
                e.preventDefault();

                const targetId = href.slice(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement && typeof targetElement.scrollIntoView === 'function') {
                    // CSS側の scroll-padding-top で固定ヘッダー分を吸収
                    const behavior = reduceMotion ? 'auto' : 'smooth';
                    targetElement.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
                    // URLハッシュを同期（履歴を汚さない）
                    if (history.replaceState) {
                        history.replaceState(null, '', `#${targetId}`);
                    } else {
                        location.hash = `#${targetId}`;
                    }
                }
            }, { passive: true });
        });
    }

    // モバイルメニュー
    setupMobileMenu() {
        const navToggle = document.getElementById('nav-toggle');
        const navMenu = document.querySelector('.nav-menu');
        
        if (navToggle && navMenu) {
            // 初期状態の ARIA を同期
            navToggle.setAttribute('aria-expanded', 'false');

            navToggle.addEventListener('click', () => {
                navToggle.classList.toggle('active');
                navMenu.classList.toggle('active');
                const expanded = navToggle.classList.contains('active');
                navToggle.setAttribute('aria-expanded', String(expanded));
            });

            // メニューリンククリック時にメニューを閉じる
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    navToggle.classList.remove('active');
                    navMenu.classList.remove('active');
                    navToggle.setAttribute('aria-expanded', 'false');
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
        const section = document.getElementById('bot-status');
        const triggerFetch = () => {
            // 二重起動防止
            if (this.__botStatusStarted) return;
            this.__botStatusStarted = true;

            // 直ちに1回だけ実行
            this.updateMultipleBotStatus();
            // 3分ごとに更新
            this.__botStatusInterval = setInterval(() => {
                this.updateMultipleBotStatus();
            }, 180000);
            if (__AIVIS_DEBUG__) console.log('🤖 Bot status system started (lazy)');
        };

        // セクションがビューポート手前に来たら開始（LCPを阻害しない）
        if (section && 'IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        triggerFetch();
                        io.disconnect();
                    }
                });
            }, { rootMargin: '300px 0px' });
            io.observe(section);
        } else {
            // Fallback: ページロード後のアイドル時に開始
            const ric = window.requestIdleCallback || function(cb){ setTimeout(() => cb({ timeRemaining: () => 50 }), 1500); };
            ric(() => triggerFetch());
        }
    }

    async updateBotStatus() {
        // 後方互換性のため残す（単一Bot用）
        return this.updateMultipleBotStatus();
    }

    updateStatusDisplay(data) {
    if (__AIVIS_DEBUG__) console.log('🎯 Updating status display with data:', data);

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
    if (__AIVIS_DEBUG__) console.log('🔄 Starting bot status update...');
        
        // APIのbotIdのみで処理（ダミー番号を消す）
        const botIdToName = {
            '1333819940645638154': 'Aivis-chan Bot 1台目',
            '1334732369831268352': 'Aivis-chan Bot 2台目',
            '1334734681656262770': 'Aivis-chan Bot 3台目',
            '1365633502988472352': 'Aivis-chan Bot 4台目',
            '1365633586123771934': 'Aivis-chan Bot 5台目',
            '1365633656173101086': 'Aivis-chan Bot 6台目',
            '1415251855147008023': 'Aivis-chan Bot Pro/Premium'
        };

        try {
            // 実際のAPIから統計情報を取得
            const apiBaseUrl = getApiBaseUrl();
            const debugFlag = /[?&]debugBots=1/.test(window.location.search);
            const response = await fetch(`${apiBaseUrl}/api/bot-stats${debugFlag ? '?debug=true' : ''}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const apiData = await response.json();
            if (__AIVIS_DEBUG__ || debugFlag) {
                console.log('[DEBUG] aggregated payload (raw):', apiData);
            }
            // APIレスポンスjsonを保存・上書き
            this._latestBotApiResponse = apiData;
            if (__AIVIS_DEBUG__) console.log('📊 API data received:', apiData);

            // ...ヒーロー統計の即時更新は行わず、統計値の保存のみ...

            // 全Bot統計を計算
            const allStats = {
                totalServers: 0,
                totalUsers: 0,
                totalVcUsers: 0,
                totalshards: 0,
                onlineBots: 0,
                totalBots: Object.keys(botIdToName).length
            };

            const botStatuses = [];
            // APIから取得したデータを処理（botIdのみで処理）
            apiData.bots.forEach((botData) => {
                const botId = botData.bot_id;
                const name = botIdToName[botId] || `Bot (${botId})`;
                const isOnline = botData.success && botData.online;
                if (!botData.success && debugFlag) {
                    console.warn('[DEBUG] bot fetch failed', botId, botData);
                }
                const serverCount = Number.isFinite(Number(botData.server_count)) ? Number(botData.server_count) : 0;
                const userCount = Number.isFinite(Number(botData.user_count)) ? Number(botData.user_count) : 0;
                const vcCount = Number.isFinite(Number(botData.vc_count)) ? Number(botData.vc_count) : 0;
                const shardCount = Number.isFinite(Number(botData.shard_count)) ? Number(botData.shard_count) : 0;
                const status = {
                    botId,
                    name,
                    online: isOnline,
                    status: isOnline ? 'online' : 'offline',
                    serverCount,
                    userCount,
                    vcCount,
                    shardCount
                };
                botStatuses.push(status);
                if (isOnline) {
                    allStats.totalServers += serverCount;
                    allStats.totalUsers += userCount;
                    allStats.totalVcUsers += vcCount;
                    allStats.totalshards += shardCount;
                    allStats.onlineBots++;
                }
            });

            if (__AIVIS_DEBUG__) console.log('📈 Calculated stats:', allStats);

            // 最新のbotステータスを保存
            this._latestBotStatuses = botStatuses;
            // 集約データを他スクリプトへ通知
            try {
                window.dispatchEvent(new CustomEvent('BotStatsAggregatedUpdate', { detail: { apiData, botStatuses, allStats } }));
            } catch (e) { console.warn('dispatch BotStatsAggregatedUpdate failed', e); }

            // 統計情報を更新
            this.updateStatusDisplay({
                serverCount: allStats.totalServers,
                userCount: allStats.totalUsers,
                vcCount: allStats.totalVcUsers,
                shardCount: allStats.totalshards,
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
                shardCount: 0,
                status: 'offline'
            });
            this.updateDetailedBotStatus([], {
                totalServers: 0,
                totalUsers: 0,
                totalVcUsers: 0,
                totalshards: 0,
                onlineBots: 0,
                totalBots: 0
            });
            this.showNotification('Botステータス取得エラー: ' + (error.message || String(error)), 'error');
        }
    }

    async updateDetailedBotStatus(botStatuses, allStats) {
    if (__AIVIS_DEBUG__) console.log('🎯 Updating detailed bot status...', botStatuses);
        
        // 既存の読み込み中のカードを更新
        const botCards = document.querySelectorAll('.bot-detail-card');
    if (__AIVIS_DEBUG__) console.log(`Found ${botCards.length} bot cards to update`);
        
        const applyCardUpdate = (bot, index) => new Promise((resolve) => {
            if (!botCards[index]) return resolve();
            const card = botCards[index];
            if (__AIVIS_DEBUG__) console.log(`Updating card ${index + 1} for ${bot.name}`);

            requestAnimationFrame(() => {
                // カードのクラスを更新
                card.className = `bot-detail-card ${bot.online ? 'online' : 'offline'}`;

                // ステータスバッジを更新
                const statusBadge = card.querySelector('.bot-status-badge');
                if (statusBadge) {
                    statusBadge.textContent = bot.online ? 'オンライン' : 'オフライン';
                    statusBadge.className = `bot-status-badge ${bot.online ? 'online' : 'offline'}`;
                }

                // 統計値を更新
                const statValues = card.querySelectorAll('.stat-item .value');
                if (statValues.length >= 3) {
                    statValues[0].textContent = (bot.serverCount || 0).toLocaleString();
                    statValues[1].textContent = (bot.userCount || 0).toLocaleString(); 
                    statValues[2].textContent = (bot.shardCount || 0).toLocaleString();
                    if (statValues[3]) statValues[3].textContent = (bot.vcCount || 0).toLocaleString();
                }

                // 招待ボタン
                const inviteBtn = card.querySelector('.btn');
                if (inviteBtn && bot.botId) {
                    inviteBtn.href = this.generateSpecificInviteLink(bot.botId);
                    inviteBtn.textContent = `${bot.name}を招待`;
                }
                resolve();
            });
        });

        // 2カードずつ更新してメインスレッドを解放
        await processInBatches(botStatuses, 2, (bot, index) => applyCardUpdate(bot, index));
        
    if (__AIVIS_DEBUG__) console.log('✅ Detailed bot status update completed');
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
    if (__AIVIS_DEBUG__) console.log('updateBotDetailPage called with:', botStatuses);
    }

    generateSpecificInviteLink(botId) {
        return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=3145728&scope=bot`;
    }

    // ヒーロー統計情報の設定と更新
    async setupHeroStats() {
    if (__AIVIS_DEBUG__) console.log('🔢 Setting up hero statistics...');

        // 初期値を直接0でセット（NaN点滅防止・HTML初期値補正）
        const statIds = ['total-servers', 'total-users', 'total-vc-users', 'total-shard'];
        statIds.forEach(id => {
            let el = document.getElementById(id)
                || document.querySelector(`[data-api="${id}"]`)
                || document.querySelector(`.${id}`);
            if (el) {
                el.textContent = (id === 'total-shard') ? '0.0' : '0';
            }
        });

        // さらにanimateHeroStatで0をセット
    this.animateHeroStat('total-servers', 0);
    this.animateHeroStat('total-users', 0);
    this.animateHeroStat('total-shard', 0);
    this.animateHeroStat('total-vc-users', 0);

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
            if (__AIVIS_DEBUG__) console.log('🟦 [DEBUG] botStatuses for hero stats:', JSON.stringify(botStatuses, null, 2));

            // キャッシュが空なら0で補正
            if (!botStatuses || botStatuses.length === 0) {
                if (__AIVIS_DEBUG__) console.warn("⚠️ botStatuses cache is empty, setting hero stats to 0");
                this.animateHeroStat('total-servers', 0);
                this.animateHeroStat('total-users', 0);
                this.animateHeroStat('total-shard', 0);
                this.animateHeroStat('total-vc-users', 0);
                return;
            }

            let servers = 0, users = 0, vcUsers = 0, shardSum = 0
            botStatuses.forEach(bot => {
                let s = Number.isFinite(Number(bot.serverCount)) ? Number(bot.serverCount) : 0;
                let u = Number.isFinite(Number(bot.userCount)) ? Number(bot.userCount) : 0;
                let v = Number.isFinite(Number(bot.vcCount)) ? Number(bot.vcCount) : 0;
                let sh = Number.isFinite(Number(bot.shardCount)) ? Number(bot.shardCount) : 0;
                servers += s;
                users += u;
                vcUsers += v;
                shardSum += sh;
            });

            const count = botStatuses.length;
            const avgServers = count > 0 ? servers / count : 0;
            const avgUsers = count > 0 ? users / count : 0;
            const avgVcUsers = count > 0 ? vcUsers / count : 0;
            const avgShards = count > 0 ? shardSum / count : 0;

            let dispServers = Number.isFinite(avgServers) ? Math.round(avgServers) : 0;
            let dispUsers = Number.isFinite(avgUsers) ? Math.round(avgUsers) : 0;
            let dispVcUsers = Number.isFinite(avgVcUsers) ? Math.round(avgVcUsers) : 0;
            let dispShards = Number.isFinite(avgShards) ? Math.round(avgShards) : 0;

            // NaN補正
            dispServers = isNaN(dispServers) ? 0 : dispServers;
            dispUsers = isNaN(dispUsers) ? 0 : dispUsers;
            dispVcUsers = isNaN(dispVcUsers) ? 0 : dispVcUsers;
            dispShards = isNaN(dispShards) ? 0 : dispShards;

            this.animateHeroStat('total-servers', dispServers);
            this.animateHeroStat('total-users', dispUsers);
            this.animateHeroStat('total-shard', dispShards);
            this.animateHeroStat('total-vc-users', dispVcUsers);

            if (__AIVIS_DEBUG__) console.log('📈 Hero stats updated (average, formatted):', {
                dispServers,
                dispUsers,
                dispVcUsers,
                dispShards
            });
        } catch (error) {
            // キャッシュ取得失敗時も必ず0で補正
            console.error('❌ Error fetching hero stats:', error);
            this.animateHeroStat('total-servers', 0);
            this.animateHeroStat('total-users', 0);
            this.animateHeroStat('total-vc-users', 0);
            this.animateHeroStat('total-shard', 0);
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
        if (elementId === 'total-shard' || elementId.includes('shard')) {
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
        if (elementId === 'total-shard' || elementId.includes('shard')) {
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
    if (elementId === 'total-shard' || elementId.includes('shard')) {
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

        if (elementId === 'total-shard' || elementId.includes('shard')) {
            element.textContent = (!isNaN(value)) ? value.toFixed(1) : '0.0';
        } else {
            element.textContent = (!isNaN(value)) ? Math.round(value).toLocaleString() : '0';
        }

        if (frame < totalFrames) {
            requestAnimationFrame(animate);
        } else {
            // 最終値で上書き
            if (elementId === 'total-shard' || elementId.includes('shard')) {
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

    // 声一覧ドロップダウン切替（イベント委譲でリスナー削減）
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
    if (target.matches('.voice-style-select')) {
            const audio = target.parentElement && target.parentElement.querySelector('.voice-audio');
            if (audio) {
                // ネットワーク負荷を避け、実再生までは読み込まない
        const filename = normalizeToOpus(String(target.value || ''));
        const nextSrc = '/voicelines/' + filename;
                audio.pause();
                audio.removeAttribute('src');
                audio.setAttribute('data-src', nextSrc);
                audio.preload = 'none';
                audio.__loadedOnce = false;
                // UIの再描画のためにloadだけかける（ネットワークは走らない）
                try { audio.load(); } catch {}
            }
        }
    });
});

// リサイズイベント
window.addEventListener('resize', () => {
    // レスポンシブ対応の処理
});

// ページ離脱前の処理（最新の推奨に合わせて pagehide を使用）
window.addEventListener('pagehide', () => {
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
