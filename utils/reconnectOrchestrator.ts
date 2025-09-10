import { Client, ChannelType, VoiceChannel, TextChannel } from 'discord.js';
import { loadVoiceState } from './voiceStateManager';
import { getBotInfos, pickLeastBusyBot, instructJoin } from './botOrchestrator';

type ReconnectSummary = {
  total: number;
  instructed: number;
  skipped: number;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1st が保持する voice_state.json をソースに、
// 各ギルドの保存先VCへ「そのギルドに在籍している中で最も空いているBot」を選んで接続指示します。
export async function orchestrateReconnectFromSavedState(client: Client): Promise<ReconnectSummary> {
  const state = loadVoiceState();
  const guildIds = Object.keys(state);
  let instructed = 0;
  let skipped = 0;

  if (guildIds.length === 0) {
    console.log('[reconnect-orchestrator] 保存されたvoice_stateが空のため、実行しません');
    return { total: 0, instructed: 0, skipped: 0 };
  }

  console.log(`[reconnect-orchestrator] ${guildIds.length} ギルドに対して再接続オーケストレーションを開始します`);

  for (const guildId of guildIds) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.warn(`[reconnect-orchestrator] ギルド未参加のためスキップ: guildId=${guildId}`);
        skipped++;
        continue;
      }

      const target = state[guildId];
      const channel = guild.channels.cache.get(target.channelId) as VoiceChannel | undefined;
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.warn(`[reconnect-orchestrator] 対象VCが無効のためスキップ: guildId=${guildId} channelId=${target.channelId}`);
        skipped++;
        continue;
      }

      // 候補Botの情報を取得し、当該ギルドに在籍しているBotのみから選定
      const infos = await getBotInfos();
      const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
      const picked = pickLeastBusyBot(eligible);
      if (!picked) {
        console.warn(`[reconnect-orchestrator] 在籍Botが見つからずスキップ: guildId=${guildId}`);
        skipped++;
        continue;
      }

      const textChannelId = target.textChannelId;
      await instructJoin(picked.bot, { guildId, voiceChannelId: channel.id, textChannelId });
      console.log(`[reconnect-orchestrator] 指示: bot=${picked.bot.name} guild=${guild.name} vc=${channel.name}`);
      instructed++;

      // 急激な同時接続を避けるため、軽くディレイ
      await sleep(250);
    } catch (e) {
      console.error('[reconnect-orchestrator] エラー:', e);
      skipped++;
    }
  }

  console.log(`[reconnect-orchestrator] 完了: 指示=${instructed}, スキップ=${skipped}`);
  return { total: guildIds.length, instructed, skipped };
}
