import axios from 'axios';

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

export async function getBotInfos(timeoutMs = 4000, attempts = 2): Promise<(InfoResp & { bot: BotInfo; ok: boolean })[]> {
  const results: (InfoResp & { bot: BotInfo; ok: boolean })[] = [];
  const bots = listBots();

  // シンプルなリトライ付きフェッチ
  const fetchInfo = async (bot: BotInfo): Promise<(InfoResp & { bot: BotInfo; ok: boolean })> => {
    const url = `${bot.baseUrl.replace(/\/$/, '')}/internal/info`;
    let lastErr: any;
    for (let i = 0; i < Math.max(1, attempts); i++) {
      try {
        const { data } = await axios.get(url, { timeout: timeoutMs });
        return { ...(data as InfoResp), bot, ok: true };
      } catch (e) {
        lastErr = e;
      }
    }
    // eslint-disable-next-line no-console
    console.warn(`[botOrchestrator:pro] info取得失敗: ${bot.name} (${url}) -> ${lastErr?.message || lastErr}`);
    return { bot, ok: false, guildIds: [], connectedGuildIds: [], vcCount: 0, serverCount: 0 };
  };

  await Promise.all(bots.map(async (bot) => {
    const info = await fetchInfo(bot);
    results.push(info);
  }));
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
  try {
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
