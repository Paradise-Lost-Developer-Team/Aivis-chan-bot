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
  await Promise.all(BOTS.map(async (bot) => {
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

export async function instructJoin(bot: BotInfo, payload: { guildId: string; voiceChannelId: string; textChannelId?: string }, timeoutMs = 5000) {
  const url = `${bot.baseUrl}/internal/join`;
  await axios.post(url, payload, { timeout: timeoutMs });
}
