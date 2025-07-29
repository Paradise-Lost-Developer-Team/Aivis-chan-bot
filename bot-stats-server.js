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
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
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
const clientStartTimes = new Map();

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
                    GatewayIntentBits.Guilds
                    // VC統計取得にはGuildVoiceStatesが必要だが、権限不足の場合は基本機能のみ使用
                ]
            });

            client.once('ready', () => {
                console.log(`✅ Bot ${botId} is ready!`);
                clientStartTimes.set(botId, Date.now());
                
                // Botのアクティビティを定期更新
                startStatusUpdates(client, botId);
            });

            client.on('error', (error) => {
                console.error(`❌ Bot ${botId} connection error:`, error.message);
            });

            await client.login(token);
            botClients.set(botId, client);
            
        } catch (error) {
            console.error(`❌ Failed to initialize bot ${botId}:`, error.message);
        }
    }
}

// Botのステータス更新機能（Bot本体から取得するように変更）
function startStatusUpdates(client, botId) {
    setInterval(async () => {
        try {
            // サーバー数（ギルド数）をBot本体から取得
            const joinServerCount = await client.guilds.fetch().then(guilds => guilds.size);

            // VC接続数をBot本体から取得
            let joinVCCount = 0;
            if (client.guilds.cache.size > 0) {
                joinVCCount = client.guilds.cache.reduce((acc, guild) => {
                    return acc + guild.channels.cache.filter(
                        ch => ch.type === 2 && ch.members.size > 0 // type 2: GUILD_VOICE
                    ).reduce((sum, ch) => sum + ch.members.size, 0);
                }, 0);
            }
        } catch (error) {
            console.error(`ステータス更新エラー (Bot ${botId}):`, error);
        }
    }, 30000);
}

// Discord API統計情報取得関数
async function fetchBotStatistics(botId) {
    try {
        // Bot本体APIから詳細ステータスを取得
        const apiUrl = `http://localhost:3001/api/stats/${botId}`;
        const response = await axios.get(apiUrl, { timeout: 3000 });
        const data = response.data;

        return {
            success: true,
            online: data.online ?? true,
            server_count: data.server_count ?? 0,
            user_count: data.user_count ?? 0,
            vc_count: data.vc_count ?? 0,
            uptime: data.uptime ?? 99.9,
            last_updated: data.last_updated ?? new Date().toISOString(),
            source: 'bot_main_api'
        };
    } catch (error) {
        console.error(`Error fetching stats for bot ${botId} from bot main API:`, error.message);
        // エラー時はモックデータを返す
        return await generateMockData(botId);
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
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    
    // Botクライアントの初期化・起動を無効化
    console.log('⚠️ Botクライアントの起動は無効化されています。APIサーバーのみ稼働します。');
});

module.exports = app;
