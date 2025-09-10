import axios from 'axios';

export type BotInfo = {
  name: string;
  baseUrl: string; // http://aivis-chan-bot-<n>:300x
};

// 既知のBotたち（必要に応じて環境変数化）
export const BOTS: BotInfo[] = [
  { name: '1st', baseUrl: 'http://aivis-chan-bot-1st:3002' },
  { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd:3003' },
  { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd:3004' },
  { name: '4th', baseUrl: 'http://aivis-chan-bot-4th:3005' },
  { name: '5th', baseUrl: 'http://aivis-chan-bot-5th:3006' },
  { name: '6th', baseUrl: 'http://aivis-chan-bot-6th:3007' },
];

// Pro/Premium Bot を候補に含める（環境変数でURLが与えられた場合）
export function listBots(): BotInfo[] {
  const arr: BotInfo[] = [...BOTS];
  const proUrl = process.env.PRO_PREMIUM_BASE_URL; // 例: http://aivis-chan-bot-pro-premium:3012
  if (proUrl) {
    // プライマリ候補として先頭に追加
    arr.unshift({ name: 'pro-premium', baseUrl: proUrl });
  }
  return arr;
}

export type InfoResp = {
  botId?: string;
  botTag?: string;
  guildIds: string[];
  connectedGuildIds: string[];
  vcCount: number;
  serverCount: number;
};

export async function getBotInfos(timeoutMs = 2000): Promise<(InfoResp & { bot: BotInfo; ok: boolean })[]> {
  const results: (InfoResp & { bot: BotInfo; ok: boolean })[] = [];
  const bots = listBots();
  await Promise.all(bots.map(async (bot) => {
    try {
      const url = `${bot.baseUrl}/internal/info`;
      const { data } = await axios.get(url, { timeout: timeoutMs });
      results.push({ ...(data as InfoResp), bot, ok: true });
    } catch (e) {
      results.push({ bot, ok: false, guildIds: [], connectedGuildIds: [], vcCount: 0, serverCount: 0 });
    }
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

// プライマリを閾値以下のときのみ採用し、超える場合はサブ群（非プライマリ）から最も空いているBotを選ぶ
// しきい値選択は廃止（グローバルに最も空いているBotを選ぶ方針に統一）

export async function instructJoin(bot: BotInfo, payload: { guildId: string; voiceChannelId: string; textChannelId?: string }, timeoutMs = 5000) {
  const url = `${bot.baseUrl}/internal/join`;
  await axios.post(url, payload, { timeout: timeoutMs });
}

export async function instructLeave(bot: BotInfo, payload: { guildId: string }, timeoutMs = 5000) {
  const url = `${bot.baseUrl}/internal/leave`;
  await axios.post(url, payload, { timeout: timeoutMs });
}
export async function findBotConnectedToGuild(guildId: string, infoTimeoutMs = 2000): Promise<(InfoResp & { bot: BotInfo; ok: boolean }) | null> {
  const infos = await getBotInfos(infoTimeoutMs);
  return infos.find(i => i.ok && i.connectedGuildIds.includes(guildId)) || null;
}

/**
 * 手動切断: 指定したギルドに現在接続しているBotを探して切断を指示する
 * 見つからなければ false を返す。切断コマンド送信に失敗しても false を返す。
 */
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