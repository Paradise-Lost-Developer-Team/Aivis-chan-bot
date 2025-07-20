// Aivis-chan Bot メインサイト JavaScript

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
        const counters = document.querySelectorAll('.stat-number');
        
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

    // Discord Bot招待リンク生成
    generateInviteLink() {
        const botId = 'YOUR_BOT_CLIENT_ID'; // 実際のBot IDに置き換え
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

    // Bot状態チェック
    async checkBotStatus() {
        try {
            const response = await fetch('https://status.aivis-chan-bot.com/api/bot/status');
            const data = await response.json();
            
            const statusElements = document.querySelectorAll('.bot-status');
            statusElements.forEach(element => {
                if (data.online) {
                    element.textContent = 'オンライン';
                    element.className = 'bot-status online';
                } else {
                    element.textContent = 'オフライン';
                    element.className = 'bot-status offline';
                }
            });
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
    new AivisWebsite();
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
if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Development mode enabled');
    
    // デバッグ用の関数をグローバルに追加
    window.aivisDebug = {
        showStats: () => console.table({
            userAgent: navigator.userAgent,
            language: navigator.language,
            onLine: navigator.onLine,
            cookieEnabled: navigator.cookieEnabled
        }),
        testNotification: () => new AivisWebsite().showNotification('テスト通知', 'success')
    };
}

export default AivisWebsite;
