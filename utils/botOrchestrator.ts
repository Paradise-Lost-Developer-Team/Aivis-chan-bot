import axios from 'axios';

// Axiosのデフォルト設定を改善
axios.defaults.timeout = 10000; // 10秒
axios.defaults.headers.common['User-Agent'] = 'BotOrchestrator/1.0';

export type BotInfo = {
  name: string;
  baseUrl: string; // http://aivis-chan-bot-<n>:300x
};

// 既知のBotたち（必要に応じて環境変数で上書き可能）
const DEFAULT_BOTS: BotInfo[] = [
  { name: '1st', baseUrl: 'http://aivis-chan-bot-1st:3002' },
  { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd:3003' },
  { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd:3004' },
  { name: '4th', baseUrl: 'http://aivis-chan-bot-4th:3005' },
  { name: '5th', baseUrl: 'http://aivis-chan-bot-5th:3006' },
  { name: '6th', baseUrl: 'http://aivis-chan-bot-6th:3007' },
  // pro/premium はデフォルトでクラスタ内の Service を指す。環境変数があればそちらを優先
  { name: 'pro-premium', baseUrl: process.env.PRO_PREMIUM_BASE_URL || 'http://aivis-chan-bot-pro-premium:3012' },
];

// Pro/Premium Bot を候補に含める（環境変数でURLが与えられた場合）
export function listBots(): BotInfo[] {
  // BOTS_JSON でフル上書き可能（例: [{"name":"1st","baseUrl":"http://..."}, ...]）
  const botsJson = process.env.BOTS_JSON;
  if (botsJson) {
    try {
      const parsed = JSON.parse(botsJson);
      if (Array.isArray(parsed) && parsed.every(v => typeof v?.name === 'string' && typeof v?.baseUrl === 'string')) {
        return parsed as BotInfo[];
      }
      // 形式不正時はフォールバック
      // eslint-disable-next-line no-console
      console.warn('[botOrchestrator:pro] BOTS_JSON の形式が不正です。デフォルト構成を使用します');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[botOrchestrator:pro] BOTS_JSON のパースに失敗しました。デフォルト構成を使用します:', (e as Error)?.message);
    }
  }

  // PRO_PREMIUM_BASE_URL があれば pro-premium のURLを上書き
  const proUrl = process.env.PRO_PREMIUM_BASE_URL;
  if (proUrl) {
    return DEFAULT_BOTS.map(b => (b.name === 'pro-premium' ? { ...b, baseUrl: proUrl } : b));
  }
  return DEFAULT_BOTS;
}

export type InfoResp = {
  botId?: string;
  botTag?: string;
  guildIds: string[];
  connectedGuildIds: string[];
  vcCount: number;
  serverCount: number;
};

// 接続テスト用のヘルパー関数
async function testConnection(baseUrl: string): Promise<boolean> {
  try {
    const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
    await axios.get(healthUrl, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function getBotInfos(timeoutMs = 8000, attempts = 3): Promise<(InfoResp & { bot: BotInfo; ok: boolean })[]> {
  const results: (InfoResp & { bot: BotInfo; ok: boolean })[] = [];
  const bots = listBots();

  console.log(`[botOrchestrator:pro] ${bots.length}個のBotの情報を取得開始`);

  // 改善されたリトライ付きフェッチ
  const fetchInfo = async (bot: BotInfo): Promise<(InfoResp & { bot: BotInfo; ok: boolean })> => {
    const url = `${bot.baseUrl.replace(/\/$/, '')}/internal/info`;
    let lastErr: any;
    
    for (let i = 0; i < Math.max(1, attempts); i++) {
      try {
        console.log(`[botOrchestrator:pro] info取得開始: ${bot.name} (${url}) - 試行 ${i + 1}/${attempts}`);
        
        const response = await axios.get(url, { 
          timeout: timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BotOrchestrator-Pro/1.0'
          }
        });
        
        console.log(`[botOrchestrator:pro] info取得成功: ${bot.name} - status: ${response.status}`);
        return { ...(response.data as InfoResp), bot, ok: true };
      } catch (e: any) {
        lastErr = e;
        
        // より詳細なエラーログ
        const errorDetails = {
          code: e.code,
          status: e.response?.status,
          statusText: e.response?.statusText,
          message: e.message,
          timeout: e.code === 'ECONNABORTED'
        };
        
        console.warn(`[botOrchestrator:pro] info取得失敗 (試行 ${i + 1}/${attempts}): ${bot.name} (${url}) -> ${JSON.stringify(errorDetails)}`);
        
        // リトライ前の待機（最後の試行以外）
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 指数バックオフ
        }
      }
    }
    
    console.error(`[botOrchestrator:pro] info取得最終失敗: ${bot.name} (${url}) -> ${lastErr?.message || lastErr}`);
    return { bot, ok: false, guildIds: [], connectedGuildIds: [], vcCount: 0, serverCount: 0 };
  };

  // 並列処理で情報取得（ただし、同時実行数を制限）
  const CONCURRENT_LIMIT = 3;
  for (let i = 0; i < bots.length; i += CONCURRENT_LIMIT) {
    const batch = bots.slice(i, i + CONCURRENT_LIMIT);
    const batchResults = await Promise.all(batch.map(async (bot) => {
      const info = await fetchInfo(bot);
      return info;
    }));
    results.push(...batchResults);
  }
  
  const successCount = results.filter(r => r.ok).length;
  console.log(`[botOrchestrator:pro] 情報取得完了: ${successCount}/${results.length} 成功`);
  
  return results;
}

export function pickLeastBusyBot(infos: (InfoResp & { bot: BotInfo; ok: boolean })[]): (InfoResp & { bot: BotInfo; ok: boolean }) | null {
  const candidates = infos.filter(r => r.ok);
  if (candidates.length === 0) return null;
  // 単純に vcCount が最小（同値なら serverCount が小さい）
  candidates.sort((a, b) => (a.vcCount - b.vcCount) || (a.serverCount - b.serverCount));
  return candidates[0];
}

// プライマリ優先（pro-premium / 1st）→ それ以外は負荷が軽い順
export function pickPrimaryPreferredBot(
  infos: (InfoResp & { bot: BotInfo; ok: boolean })[],
  preferredOrder: string[] = ['pro-premium', '1st']
): (InfoResp & { bot: BotInfo; ok: boolean }) | null {
  const candidates = infos.filter(r => r.ok);
  if (candidates.length === 0) return null;

  const indexOfPref = (name: string) => {
    const idx = preferredOrder.indexOf(name);
    return idx === -1 ? Number.POSITIVE_INFINITY : idx;
  };

  candidates.sort((a, b) => {
    const pa = indexOfPref(a.bot.name);
    const pb = indexOfPref(b.bot.name);
    if (pa !== pb) return pa - pb; // より優先度の高いものを先に
    // 同一優先順位内では負荷の軽い順
    return (a.vcCount - b.vcCount) || (a.serverCount - b.serverCount);
  });
  return candidates[0] || null;
}

export async function instructJoin(bot: BotInfo, payload: { guildId: string; voiceChannelId: string; textChannelId?: string }, timeoutMs = 6000) {
  const url = `${bot.baseUrl.replace(/\/$/, '')}/internal/join`;
  
  // テキストチャンネルIDが指定されていない場合は警告ログを出力
  if (!payload.textChannelId) {
    console.warn(`[botOrchestrator:pro] テキストチャンネルが指定されていません: guildId=${payload.guildId} bot=${bot.name}`);
  }
  
  try {
    console.log(`[botOrchestrator:pro] join指示送信: bot=${bot.name} guild=${payload.guildId} vc=${payload.voiceChannelId} tc=${payload.textChannelId || 'none'}`);
    await axios.post(url, payload, { timeout: timeoutMs });
  } catch (e: any) {
    const msg = `[botOrchestrator:pro] join指示失敗: bot=${bot.name} url=${url} err=${e?.message || e}`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    throw new Error(msg);
  }
}

export async function instructLeave(bot: BotInfo, payload: { guildId: string }, timeoutMs = 6000) {
  const url = `${bot.baseUrl.replace(/\/$/, '')}/internal/leave`;
  try {
    await axios.post(url, payload, { timeout: timeoutMs });
  } catch (e: any) {
    const msg = `[botOrchestrator:pro] leave指示失敗: bot=${bot.name} url=${url} err=${e?.message || e}`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    throw new Error(msg);
  }
}

export async function findBotConnectedToGuild(guildId: string, infoTimeoutMs = 2000): Promise<(InfoResp & { bot: BotInfo; ok: boolean }) | null> {
  const infos = await getBotInfos(infoTimeoutMs);
  return infos.find(i => i.ok && i.connectedGuildIds.includes(guildId)) || null;
}

export async function instructLeaveConnectedBot(guildId: string, infoTimeoutMs = 2000, leaveTimeoutMs = 5000): Promise<boolean> {
  const info = await findBotConnectedToGuild(guildId, infoTimeoutMs);
  if (!info) return false;
  try {
    await instructLeave(info.bot, { guildId }, leaveTimeoutMs);
    return true;
  } catch {
    return false;
  }
}
