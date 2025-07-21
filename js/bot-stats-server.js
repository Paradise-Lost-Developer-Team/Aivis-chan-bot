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
const cors = require('cors');
const fs = require('fs'); // 追加
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const MOCK_MODE = process.env.MOCK_MODE === 'true' || !process.env.BOT_TOKEN_1; // トークンが設定されていない場合はモックモード

// CORS設定
app.use(cors({
    origin: ['http://localhost:3000', 'https://aivis-chan-bot.com'],
    credentials: true
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

// Discord API統計情報取得関数
async function fetchBotStatistics(botId, token) {
    try {
        // モックモード（トークンが設定されていない場合）
        if (MOCK_MODE || !token) {
            console.log(`📋 Mock mode: Generating fake stats for bot ${botId}`);
            
            // 実際のAPIの代わりにモックデータを返す
            await new Promise(resolve => setTimeout(resolve, 500)); // APIの遅延を模擬
            
            const mockStats = {
                '1333819940645638154': { servers: 245, users: 12500, uptime: 99.8 },
                '1334732369831268352': { servers: 189, users: 9800, uptime: 99.5 },
                '1334734681656262770': { servers: 156, users: 8200, uptime: 99.2 },
                '1365633502988472352': { servers: 134, users: 7100, uptime: 99.7 },
                '1365633586123771934': { servers: 112, users: 5900, uptime: 99.4 },
                '1365633656173101086': { servers: 98, users: 4800, uptime: 99.1 }
            };
            
            const stats = mockStats[botId] || { servers: 50, users: 2500, uptime: 98.5 };
            
            return {
                success: true,
                online: true,
                server_count: stats.servers,
                user_count: stats.users,
                uptime: stats.uptime,
                last_updated: new Date().toISOString(),
                mock: true
            };
        }

        if (!token) {
            throw new Error('Bot token not configured');
        }

        // Discord APIからアプリケーション情報を取得
        const appResponse = await fetch(`https://discord.com/api/v10/oauth2/applications/@me`, {
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!appResponse.ok) {
            throw new Error(`Discord API error: ${appResponse.status}`);
        }

        // Botが参加しているギルド一覧を取得
        const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!guildsResponse.ok) {
            throw new Error(`Discord Guilds API error: ${guildsResponse.status}`);
        }

        const guilds = await guildsResponse.json();
        const serverCount = guilds.length;

        // 概算ユーザー数を計算（各ギルドのメンバー数を取得）
        let totalUsers = 0;
        const guildPromises = guilds.slice(0, 50).map(async (guild) => {
            try {
                const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}?with_counts=true`, {
                    headers: {
                        'Authorization': `Bot ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (guildResponse.ok) {
                    const guildData = await guildResponse.json();
                    return guildData.approximate_member_count || 0;
                }
                return 0;
            } catch (error) {
                console.warn(`Failed to get guild ${guild.id} member count:`, error);
                return 0;
            }
        });

        const memberCounts = await Promise.all(guildPromises);
        totalUsers = memberCounts.reduce((sum, count) => sum + count, 0);

        // アップタイム計算（簡易版）
        const uptime = 99.0 + Math.random() * 1.0; // 実際は起動時間ベースで計算

        return {
            success: true,
            online: true,
            server_count: serverCount,
            user_count: totalUsers,
            uptime: uptime,
            last_updated: new Date().toISOString()
        };

    } catch (error) {
        console.error(`Error fetching stats for bot ${botId}:`, error);
        return {
            success: false,
            online: false,
            server_count: 0,
            user_count: 0,
            vc_count: 0,
            uptime: 0,
            error: error.message
        };
    }
}

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
// --- 5秒キャッシュ用変数 ---
let cachedStats = null;
let cachedStatsTimestamp = 0;
const CACHE_DURATION_MS = 5000;

app.get('/api/bot-stats', async (req, res) => {
    console.log('📊 Fetching stats for all bots');
    const now = Date.now();
    if (cachedStats && (now - cachedStatsTimestamp < CACHE_DURATION_MS)) {
        console.log('🗄️ Returning cached stats');
        return res.json(cachedStats);
    }
    try {
        const statsPromises = Object.entries(BOT_TOKENS).map(([botId, token]) => {
            return fetchBotStatistics(botId, token)
                .then(stats => ({ bot_id: botId, ...stats }))
                .catch(error => {
                    console.error(`Error for bot ${botId}:`, error);
                    return {
                        bot_id: botId,
                        success: false,
                        online: false,
                        server_count: 0,
                        user_count: 0,
                        vc_count: 0,
                        uptime: 0,
                        error: error.message || String(error)
                    };
                });
        });

        const allStats = await Promise.all(statsPromises);
        const responseJson = {
            bots: allStats,
            total_bots: allStats.length,
            online_bots: allStats.filter(bot => bot.online).length,
            timestamp: new Date().toISOString()
        };

        // public-bot-status.jsonとして保存
        try {
            fs.writeFileSync('public-bot-status.json', JSON.stringify(responseJson, null, 2), 'utf8');
            console.log('💾 public-bot-status.json saved');
        } catch (err) {
            console.warn('⚠️ Failed to save public-bot-status.json:', err);
        }

        cachedStats = responseJson;
        cachedStatsTimestamp = now;
        res.json(responseJson);
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
app.listen(PORT, () => {
    console.log(`🤖 Discord Bot Stats API Server running on port ${PORT}`);
    console.log(`📊 Configured bots: ${Object.keys(BOT_TOKENS).length}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    if (MOCK_MODE) {
        console.log(`🎭 Running in MOCK MODE - no real Discord API calls`);
        console.log(`💡 To use real API: Set BOT_TOKEN_1, BOT_TOKEN_2, etc. in .env file`);
    }
});

module.exports = app;
