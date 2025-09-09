#!/usr/bin/env node

/**
 * Discord Bot Statistics API Server
 * 
 * このサーバーは実際のDiscord Bot APIから統計情報を取得し、
 * フロントエンドに安全に提供します。
 * 
 * 使用方法:
 * 1. npm install express cors dotenv discord.js
 * 2. .env ファイルに各BotのトークンT設定
 * 3. node bot-stats-server.js
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Client, GatewayIntentBits, ActivityType, ChannelType } = require('discord.js');
require('dotenv').config();

const app = express();
// 6台分のポートをBotごとに設定
const BOT_PORTS = {
    '1333819940645638154': 32001,
    '1334732369831268352': 32002,
    '1334734681656262770': 32003,
    '1365633502988472352': 32004,
    '1365633586123771934': 32005,
    '1365633656173101086': 32006
};
const PORT = process.env.PORT || 32001;
const MOCK_MODE = process.env.MOCK_MODE === 'true' || !process.env.BOT_TOKEN_1; // トークンが設定されていない場合はモックモード

// CORS設定
const allowedOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',')
    : [
        'http://localhost:3000', 
        'https://aivis-chan-bot.com',
        'https://www.aivis-chan-bot.com',
        'https://status.aivis-chan-bot.com'
    ];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Botトークンの設定（環境変数から読み込み）
const BOT_TOKENS = {
    '1333819940645638154': process.env.BOT_TOKEN_1,
    '1334732369831268352': process.env.BOT_TOKEN_2,
    '1334734681656262770': process.env.BOT_TOKEN_3,
    '1365633502988472352': process.env.BOT_TOKEN_4,
    '1365633586123771934': process.env.BOT_TOKEN_5,
    '1365633656173101086': process.env.BOT_TOKEN_6
};

// Discord.js クライアントの管理
const botClients = new Map();
// オンライン履歴管理（Botごとに24h分の履歴を保持）
const ONLINE_HISTORY = new Map(); // botId => [{ start, end }]
const HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24; // 24時間

// モックデータ生成関数
async function generateMockData(botId) {
    const mockStats = {
        '1333819940645638154': { servers: 245, users: 12500, uptime: 99.8, vcUsers: 12 },
        '1334732369831268352': { servers: 189, users: 9800, uptime: 99.5, vcUsers: 8 },
        '1334734681656262770': { servers: 156, users: 8200, uptime: 99.2, vcUsers: 6 },
        '1365633502988472352': { servers: 134, users: 7100, uptime: 99.7, vcUsers: 5 },
        '1365633586123771934': { servers: 112, users: 5900, uptime: 99.4, vcUsers: 4 },
        '1365633656173101086': { servers: 98, users: 4800, uptime: 99.1, vcUsers: 3 }
    };
    
    const stats = mockStats[botId] || { servers: 50, users: 2500, uptime: 98.5, vcUsers: 2 };
    
    return {
        success: true,
        online: true,
        server_count: stats.servers,
        user_count: stats.users,
        vc_count: stats.vcUsers,
        uptime: stats.uptime,
        last_updated: new Date().toISOString(),
        source: 'mock_fallback'
    };
}

// Discord Bot クライアントを初期化
async function initializeBotClients() {
    for (const [botId, token] of Object.entries(BOT_TOKENS)) {
        if (!token || MOCK_MODE) continue;

        try {
            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildVoiceStates
                ]
            });
            client.once('ready', async () => {
                    console.log(`🔔 ready handler invoked for bot ${botId}. client present=${!!client}, guilds=${typeof (client && client.guilds)} isFetch=${client && client.guilds && typeof client.guilds.fetch === 'function'}`);
                    try {
                        // Prefer using the client's cache to avoid heavy fetches and missing fetch implementations.
                        let guildsCollection = null;
                        if (client && client.guilds && client.guilds.cache) {
                            guildsCollection = client.guilds.cache;
                        } else if (client && client.guilds && typeof client.guilds.fetch === 'function') {
                            try {
                                guildsCollection = await client.guilds.fetch();
                            } catch (fetchErr) {
                                console.error(`❌ client.guilds.fetch() threw for bot ${botId}:`, fetchErr && (fetchErr.stack || fetchErr.message || fetchErr));
                            }
                        }

                        let vcCount = 0;
                        if (guildsCollection && typeof guildsCollection.size === 'number') {
                            // Iterate over cached guilds safely
                            for (const guild of guildsCollection.values ? guildsCollection.values() : guildsCollection) {
                                try {
                                    // Avoid calling guild.channels.fetch(); rely on cached channels if present
                                    if (guild && guild.channels && guild.channels.cache) {
                                        vcCount += guild.channels.cache.reduce
                                            ? guild.channels.cache.reduce((sum, ch) => {
                                                try {
                                                    return sum + ((ch.type === ChannelType.GuildVoice) ? (ch.members ? ch.members.size : 0) : 0);
                                                } catch (e) {
                                                    return sum;
                                                }
                                            }, 0)
                                            : 0;
                                    } else {
                                        // channels manager missing — skip
                                        console.warn(`⚠️ guild.channels.cache not available for bot ${botId}, guild ${guild && guild.id}`);
                                    }
                                } catch (innerErr) {
                                    console.error(`❌ Error while processing guild for bot ${botId}:`, innerErr && innerErr.message ? innerErr.message : innerErr);
                                }
                            }
                        } else {
                            console.warn(`⚠️ No guild collection available for bot ${botId}`);
                        }

                        // オンライン履歴に追加
                        const now = Date.now();
                        if (!ONLINE_HISTORY.has(botId)) ONLINE_HISTORY.set(botId, []);
                        ONLINE_HISTORY.get(botId).push({ start: now, end: null });
                        // 必要ならここで stats を保存・利用
                        console.log(`✅ Bot ${botId} ready. Guilds: ${guildsCollection && guildsCollection.size ? guildsCollection.size : 'unknown'}, VC Users: ${vcCount}`);
                } catch (err) {
                    console.error(`❌ Error fetching stats for bot ${botId}:`, err && err.message ? err.message : err);
                }
            });

            client.on('error', (error) => {
                console.error(`❌ Bot ${botId} connection error:`, error && error.message ? error.message : error);
            });

            await client.login(token);
            botClients.set(botId, client);

        } catch (error) {
            console.error(`❌ Failed to initialize bot ${botId}:`, error && error.message ? error.message : error);
        }
    }
}

// (Duplicate removed) The defensive initializeBotClients implementation above is used.

// Discord API統計情報取得関数
async function fetchBotStatistics(botId) {
    try {
        const axios = require('axios');
        // Namespace が異なるため service 短縮名では解決できない問題 (Plan B):
        //  各 Bot Service は namespace aivis-chan-bot 内で port 3000 を公開。
        //  既存コードは 32001 〜 32006 など未定義ポートを参照していたため 0 件となっていた。
        //  FQDN (service.namespace.svc.cluster.local) + :3000/api/stats に統一。
        const botApiMap = {
            '1333819940645638154': 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002/api/stats',
            '1334732369831268352': 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003/api/stats',
            '1334734681656262770': 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004/api/stats',
            '1365633502988472352': 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005/api/stats',
            '1365633586123771934': 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006/api/stats',
            '1365633656173101086': 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007/api/stats'
        };
        const apiUrl = botApiMap[botId];
        if (!apiUrl) {
            return await generateMockData(botId);
        }
        try {
            // If a runtime client exists but isn't ready yet, avoid calling Discord API paths that require readiness.
            const runtimeClient = botClients.get(botId);
            if (!runtimeClient || !runtimeClient.readyAt) {
                console.warn(`⚠️ Client for bot ${botId} not ready - returning mock fallback`);
                return await generateMockData(botId);
            }

            const res = await axios.get(apiUrl, { timeout: 7000 });
            const data = res.data;
            // シャード数を取得
            let shard_count = null;
            const client = botClients.get(botId);
            if (client && client.shard && typeof client.shard.count === 'number') {
                shard_count = client.shard.count;
            } else {
                shard_count = null; // シャード数が不明な場合はnullを設定
            }
            return {
                bot_id: botId,
                success: true,
                online: true,
                server_count: data.serverCount || 0,
                user_count: data.userCount || 0,
                vc_count: data.vcCount || 0,
                shard_count: shard_count,
            };
        } catch (err) {
            return {
                bot_id: botId,
                success: false,
                online: false,
                server_count: 0,
                user_count: 0,
                vc_count: 0,
                uptime: 0,
                shard_count: 0,
                error: err.message
            };
        }
    } catch (error) {
        console.error(`Error fetching stats for bot ${botId}:`, error.message);
        return await generateMockData(botId);
    }
}

// Debug endpoint: show minimal client state (safe to expose internally)
app.get('/debug/clients', (req, res) => {
    try {
        const out = [];
        for (const botId of Object.keys(BOT_TOKENS)) {
            const runtimeClient = botClients.get(botId);
            out.push({
                bot_id: botId,
                hasClient: !!runtimeClient,
                readyAt: runtimeClient && runtimeClient.readyAt ? runtimeClient.readyAt : null,
                userTag: runtimeClient && runtimeClient.user ? `${runtimeClient.user.username}#${runtimeClient.user.discriminator || ''}` : null,
                guildsCacheSize: runtimeClient && runtimeClient.guilds && runtimeClient.guilds.cache ? runtimeClient.guilds.cache.size : null,
                shardCount: runtimeClient && runtimeClient.shard && typeof runtimeClient.shard.count === 'number' ? runtimeClient.shard.count : null
            });
        }
        res.json({ ok: true, clients: out });
    } catch (e) {
        console.error('Debug /debug/clients error', e && (e.stack || e.message || e));
        res.status(500).json({ ok: false, error: String(e && (e.message || e)) });
    }
});

// API エンドポイント: 特定のBot統計情報を取得
app.get('/api/bot-stats/:botId', async (req, res) => {
    const { botId } = req.params;
    
    console.log(`📊 Fetching stats for bot: ${botId}`);
    
    const token = BOT_TOKENS[botId];
    
    // モックモードまたはBot IDが設定されている場合は処理を続行
    if (!MOCK_MODE && !token) {
        return res.status(404).json({
            error: 'Bot not found or token not configured',
            bot_id: botId
        });
    }

    try {
        const stats = await fetchBotStatistics(botId, token);
        // 取得した個別 stats を webhook に送信（非同期）
        if (process.env.WEBHOOK_URL) {
            sendToWebhook({ type: 'bot_stats', payload: stats }).catch(err => {
                console.error('Webhook send error (individual):', err.message);
            });
        }
        res.json(stats);
    } catch (error) {
        console.error(`API error for bot ${botId}:`, error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API エンドポイント: 全Bot統計情報を取得
app.get('/api/bot-stats', async (req, res) => {
    console.log('📊 Fetching stats for all bots');
    
    try {
        const statsPromises = Object.entries(BOT_TOKENS).map(async ([botId, token]) => {
            const stats = await fetchBotStatistics(botId, token);
            return {
                bot_id: botId,
                ...stats
            };
        });

        const allStats = await Promise.all(statsPromises);
        // 全体 stats を webhook に送信（非同期）
        if (process.env.WEBHOOK_URL) {
            sendToWebhook({ type: 'all_bot_stats', payload: { bots: allStats, total: allStats.length } }).catch(err => {
                console.error('Webhook send error (all):', err.message);
            });
        }
        res.json({
            bots: allStats,
            total_bots: allStats.length,
            online_bots: allStats.filter(bot => bot.online).length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('API error for all bots:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        configured_bots: Object.keys(BOT_TOKENS).length
    });
});

// サーバー起動
app.listen(PORT, async () => {
    console.log(`🤖 Discord Bot Stats API Server running on port ${PORT}`);
    console.log(`📊 Configured bots: ${Object.keys(BOT_TOKENS).length}`);
    console.log(`🌐 Health check: http://bot-stats-server:${PORT}/health`);
    
    // Botクライアントの初期化・起動を無効化
    console.log('⚠️ Botクライアントの起動は無効化されています。APIサーバーのみ稼働します。');
    // Botクライアントの初期化関数を呼び出し
    initializeBotClients();
    // 起動時に全体 stats を一度送信
    if (process.env.WEBHOOK_URL) {
        try {
            const statsPromises = Object.keys(BOT_TOKENS).map(async (botId) => {
                return await fetchBotStatistics(botId);
            });
            const allStats = await Promise.all(statsPromises);
            await sendToWebhook({ type: 'startup_all_bot_stats', payload: { bots: allStats, total: allStats.length } });
            console.log('✅ Startup stats sent to webhook');
        } catch (err) {
            console.error('Failed sending startup stats:', err.message);
        }
    }
});

// --- Webhook sender helper ---
async function sendToWebhook(body, retries = 2) {
    const url = process.env.WEBHOOK_URL;
    if (!url) throw new Error('WEBHOOK_URL is not configured');

    try {
        await axios.post(url, body, { timeout: 5000 });
    } catch (err) {
        if (retries > 0) {
            console.warn('Webhook send failed, retrying...', retries, err.message);
            await new Promise(r => setTimeout(r, 1000));
            return sendToWebhook(body, retries - 1);
        }
        throw err;
    }
}

module.exports = app;
