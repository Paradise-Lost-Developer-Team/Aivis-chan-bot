import { Message, EmbedBuilder, ChatInputCommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { VoiceReminder } from '../../utils/voice-reminder';
import { SlashCommandBuilder } from '@discordjs/builders';

// --- 追加: モジュールレベルの data プロパティ ---
export const data = new SlashCommandBuilder()
  .setName('reminder')
  .setDescription('リマインダーを設定します')
  .addSubcommand(sub => 
    sub
      .setName('設定')
      .setDescription('新しいリマインダーを設定します')
      .addStringOption(o => o.setName('時間').setDescription('例: 30m, 1h30m, 17:30').setRequired(true))
      .addStringOption(o => o.setName('メッセージ').setDescription('リマインダー内容').setRequired(true))
      .addBooleanOption(o => o.setName('音声').setDescription('音声通知を有効にする').setRequired(false))
  )
  .addSubcommand(sub => sub.setName('一覧').setDescription('設定済みリマインダーを一覧表示'))
  .addSubcommand(sub => 
    sub
      .setName('キャンセル')
      .setDescription('リマインダーをキャンセルします')
      .addStringOption(o => o.setName('id').setDescription('キャンセルするID').setRequired(true))
  );

// --- 追加: モジュールレベルの execute 関数 ---
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // クラス実装に委譲
  await new ReminderCommand(new VoiceReminder()).executeInteraction(interaction);
}

export class ReminderCommand {
  // --- 追加: Discord.js が要求する data プロパティ ---
  public readonly data = this.getCommandData();

  constructor(private voiceReminder: VoiceReminder) {}

  // スラッシュコマンド定義
  public getCommandData() {
    return new SlashCommandBuilder()
      .setName('リマインダー')
      .setDescription('リマインダーを設定します')
      .addSubcommand(subcommand =>
        subcommand
          .setName('set')
          .setDescription('新しいリマインダーを設定します')
          .addStringOption(option =>
            option.setName('時間')
              .setDescription('リマインダーの時間（例: 30m, 1h30m, 17:30）')
              .setRequired(true))
          .addStringOption(option =>
            option.setName('メッセージ')
              .setDescription('リマインダーのメッセージ')
              .setRequired(true))
          .addBooleanOption(option =>
            option.setName('音声')
              .setDescription('音声通知を有効にする（有料プラン限定）')
              .setRequired(false))
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('設定したリマインダーの一覧を表示します')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('cancel')
          .setDescription('リマインダーをキャンセルします')
          .addStringOption(option =>
            option.setName('id')
              .setDescription('キャンセルするリマインダーのID')
              .setRequired(true))
      );
  }

  // スラッシュコマンド実行
  async executeInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === '設定') {
      const timeStr = interaction.options.getString('時間', true);
      const message = interaction.options.getString('メッセージ', true);
      const useVoice = interaction.options.getBoolean('音声') || false;
      
      try {
        const time = this.parseTime(timeStr);
        const response = await this.voiceReminder.setReminder(
          interaction as any, // TypeScript型の問題を回避
          message,
          time,
          useVoice
        );
        
        await interaction.reply({ content: response, ephemeral: false });
      } catch (error) {
        await interaction.reply({ 
          content: `リマインダーの設定に失敗しました: ${(error as Error).message}`, 
          ephemeral: true 
        });
      }
    } 
    else if (subcommand === '一覧') {
      const reminders = this.voiceReminder.getUserReminders(interaction.user.id);
      
      if (reminders.length === 0) {
        await interaction.reply({ 
          content: '設定されているリマインダーはありません。', 
          ephemeral: true 
        });
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('リマインダー一覧')
        .setDescription('設定済みのリマインダー')
        .setColor('#00BFFF');
      
      reminders.forEach(reminder => {
        embed.addFields({
          name: `ID: ${reminder.id}`,
          value: `⏰ ${this.formatTime(reminder.time)}\n📝 ${reminder.message}\n🔊 音声: ${reminder.voiceEnabled ? 'あり' : 'なし'}`
        });
      });
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    else if (subcommand === 'キャンセル') {
      const reminderId = interaction.options.getString('id', true);
      const response = this.voiceReminder.cancelReminder(interaction.user.id, reminderId);
      await interaction.reply({ content: response, ephemeral: true });
    }
  }

  // --- 追加: execute メソッドをエイリアス ---
  public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await this.executeInteraction(interaction);
  }

  // テキストコマンド実行 (レガシーサポート)
  async executeMessage(message: Message, args: string[]): Promise<void> {
    if (args.length === 0 || args[0] === 'ヘルプ') {
      this.showHelp(message);
      return;
    }
    
    if (args[0] === '設定') {
      if (args.length < 3) {
        message.reply('使用方法: !リマインダー 設定 [時間] [メッセージ] (--音声)');
        return;
      }
      
      const timeStr = args[1];
      const useVoice = args.includes('--音声');
      const messageStartIndex = 2;
      const messageText = args.slice(messageStartIndex).join(' ').replace('--音声', '').trim();
      
      try {
        const time = this.parseTime(timeStr);
        const response = await this.voiceReminder.setReminder(
          message,
          messageText,
          time,
          useVoice
        );
        
        message.reply(response);
      } catch (error) {
        message.reply(`リマインダーの設定に失敗しました: ${(error as Error).message}`);
      }
    }
    else if (args[0] === '一覧') {
      const reminders = this.voiceReminder.getUserReminders(message.author.id);
      
      if (reminders.length === 0) {
        message.reply('設定されているリマインダーはありません。');
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('リマインダー一覧')
        .setDescription('設定済みのリマインダー')
        .setColor('#00BFFF');
      
      reminders.forEach(reminder => {
        embed.addFields({
          name: `ID: ${reminder.id}`,
          value: `⏰ ${this.formatTime(reminder.time)}\n📝 ${reminder.message}\n🔊 音声: ${reminder.voiceEnabled ? 'あり' : 'なし'}`
        });
      });
      
      message.reply({ embeds: [embed] });
    }
    else if (args[0] === 'キャンセル') {
      if (args.length < 2) {
        message.reply('使用方法: !リマインダー キャンセル [ID]');
        return;
      }
      
      const reminderId = args[1];
      const response = this.voiceReminder.cancelReminder(message.author.id, reminderId);
      message.reply(response);
    }
  }

  private showHelp(message: Message): void {
    const embed = new EmbedBuilder()
      .setTitle('リマインダーコマンドのヘルプ')
      .setDescription('リマインダー機能の使い方')
      .setColor('#00BFFF')
      .addFields(
        { name: '!リマインダー 設定 [時間] [メッセージ]', value: '指定した時間にリマインダーを設定します' },
        { name: '!リマインダー 設定 [時間] [メッセージ] --音声', value: '音声付きリマインダーを設定します（有料プラン限定）' },
        { name: '!リマインダー 一覧', value: '設定したリマインダーの一覧を表示します' },
        { name: '!リマインダー キャンセル [ID]', value: '指定したIDのリマインダーをキャンセルします' },
        { name: '時間の指定例', value: '30m (30分後), 1h30m (1時間30分後), 17:30 (17時30分)' }
      );
    
    message.reply({ embeds: [embed] });
  }

  // 時間文字列をDateオブジェクトに変換
  private parseTime(timeStr: string): Date {
    let totalMinutes = 0;
    
    // 相対時間のパターン
    // 時間のパターン: 3h, 2時間, etc.
    const hourMatch = timeStr.match(/(\d+)(?:h|時間)/);
    if (hourMatch) {
      totalMinutes += parseInt(hourMatch[1]) * 60;
    }
    
    // 分のパターン: 30m, 15分, etc.
    const minMatch = timeStr.match(/(\d+)(?:m|分)/);
    if (minMatch) {
      totalMinutes += parseInt(minMatch[1]);
    }
    
    // 特定の時刻のパターン: 15:30, etc.
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(parseInt(timeMatch[1]));
      targetTime.setMinutes(parseInt(timeMatch[2]));
      targetTime.setSeconds(0);
      
      // 指定時刻が過去の場合、翌日に設定
      if (targetTime <= now) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      return targetTime;
    }
    
    // 相対時間の場合
    if (totalMinutes > 0) {
      const now = new Date();
      return new Date(now.getTime() + totalMinutes * 60 * 1000);
    }
    
    throw new Error('時間形式が正しくありません。例: 1h30m, 15:30');
  }

  // 時間を表示用にフォーマット
  private formatTime(date: Date): string {
    return date.toLocaleString('ja-JP', {
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
