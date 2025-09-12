import { MessageFlags } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

// データディレクトリの確認と作成
function ensureDataDirectoryExists() {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    console.log(`データディレクトリを作成します: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

// Slashコマンドのデータ定義
export const data = new SlashCommandBuilder()
  .setName('patreon')
  .setDescription('Patreon連携関連のコマンド')
  .addSubcommand(subcommand =>
    subcommand
      .setName('info')
      .setDescription('Patreon連携についての情報を表示します')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('link')
      .setDescription('PatreonアカウントとBotを連携します')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('現在のPatreon連携状況を確認します')
  );

// コマンド実行ロジック
export async function execute(interaction: CommandInteraction) {
  try {
    // コマンド実行前にデータディレクトリ存在確認
    ensureDataDirectoryExists();
  const subcommand = (interaction as any).options.getSubcommand();
    switch (subcommand) {
      case 'info':
        await handleInfoSubcommand(interaction);
        break;
      case 'link':
        await handleLinkSubcommand(interaction);
        break;
      case 'status':
        await handleStatusSubcommand(interaction);
        break;
      default:
        await interaction.reply({
          embeds: [addCommonFooter(
            new EmbedBuilder()
              .setTitle('エラー')
              .setDescription('不明なサブコマンドです。')
              .setColor(0xff0000)
          )],
          flags: MessageFlags.Ephemeral,
          components: [getCommonLinksRow()]
        });
    }
  } catch (error) {
    console.error('Patreonコマンドエラー:', error);
    await interaction.reply({
      embeds: [addCommonFooter(
        new EmbedBuilder()
          .setTitle('エラー')
          .setDescription('コマンド実行中にエラーが発生しました。しばらく経ってから再度お試しください。')
          .setColor(0xff0000)
      )],
  flags: MessageFlags.Ephemeral,
      components: [getCommonLinksRow()]
    });
  }
}

// サブコマンドハンドラー関数
async function handleInfoSubcommand(interaction: CommandInteraction) {
  const embed = addCommonFooter(
    new EmbedBuilder()
      .setTitle('Patreon連携について')
      .setDescription('Aivis Chan Botの開発をPatreonで支援すると、特典が自動で適用されます。')
      .addFields(
        { name: '連携方法', value: '`/patreon link` コマンドを実行し、表示されるリンクからPatreonアカウントで認証してください。' },
        { name: '特典プラン', value: '**Pro版 (¥500/月)**: 追加ボイス、高品質音声\n**Premium版 (¥1000/月)**: 独占ボイス、無制限辞書' },
        { name: '連携状況確認', value: '`/patreon status` コマンドで現在の連携状況を確認できます。' }
      )
      .setColor(0xFF5500)
  );
  await interaction.reply({
    embeds: [embed],
  flags: MessageFlags.Ephemeral,
    components: [getCommonLinksRow()]
  });
}

async function handleLinkSubcommand(interaction: CommandInteraction) {
  const { getPatreonAuthUrl } = await import('../../utils/patreonIntegration');
  const authUrl = getPatreonAuthUrl(interaction.user.id);
  console.log('[patreon] authUrl=', authUrl);
  await interaction.reply({
    embeds: [addCommonFooter(
      new EmbedBuilder()
        .setTitle('Patreon連携')
        .setDescription('PatreonアカウントとAivis Chan Botを連携します。\n連携が完了すると、あなたが所有権を持つ全てのサーバーで特典が自動的に適用されます。')
        .setColor(0xFF5500)
        .addFields({ name: '認証リンク', value: `[Patreonで認証する](${authUrl})` })
    )],
  flags: MessageFlags.Ephemeral,
    components: [getCommonLinksRow()]
  });
}

async function handleStatusSubcommand(interaction: CommandInteraction) {
  // パトレオン連携からユーザー情報を取得
  const { getUserTierByOwnership, isDeveloper } = await import('../../utils/patreonIntegration');
  
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const isUserDeveloper = isDeveloper(userId);
  
  // 開発者チェック
  if (isUserDeveloper) {
    // 開発者の場合の特別表示
    const embed = addCommonFooter(
      new EmbedBuilder()
        .setTitle('🔧 開発者ステータス')
        .setDescription('**開発者特権が適用されています**')
        .setColor(0xFF0000)
        .addFields(
          { name: '🎯 ステータス', value: 'Developer (Premium Access)', inline: true },
          { name: '💎 特典レベル', value: 'All Premium Features', inline: true },
          { name: '🏢 このサーバー', value: guildId ? 'Premium Plan Active' : 'N/A', inline: true }
        )
    );

    if (guildId) {
      try {
        // サーバー情報を取得
        const guild = interaction.guild;
        const isOwner = guild?.ownerId === userId;
        
        embed.addFields(
          { name: '👑 サーバー所有権', value: isOwner ? 'あなたが所有者です' : 'あなたは所有者ではありません', inline: true },
          { name: '🎁 開発者特典', value: '• 全プレミアム機能利用可能\n• 無制限の辞書エントリ\n• 優先サポート\n• 全ボイス利用可能', inline: false }
        );

        if (isOwner) {
          embed.addFields({
            name: '⚡ 自動付与',
            value: 'あなたが所有するサーバーには自動的にプレミアムプランが付与されます。',
            inline: false
          });
        }
      } catch (error) {
        console.error('開発者ステータス取得エラー:', error);
      }
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
      components: [getCommonLinksRow()]
    });
    return;
  }

  // 通常ユーザーのPatreon連携状況確認
  const userTier = await getUserTierByOwnership(userId);
  let tierInfo = '連携されていません';
  let color = 0x888888;
  
  if (userTier === 'free') {
    tierInfo = '連携済み (無料プラン)';
    color = 0x00AAFF;
  } else if (userTier === 'pro') {
    tierInfo = '連携済み (Pro版)';
    color = 0xFF5500;
  } else if (userTier === 'premium') {
    tierInfo = '連携済み (Premium版)';
    color = 0xFF0000;
  }

  const embed = addCommonFooter(
    new EmbedBuilder()
      .setTitle('Patreon連携状況')
      .setDescription(`現在の連携状況: **${tierInfo}**`)
      .setColor(color)
  );

  if (userTier === 'free' || !userTier) {
    embed.addFields({
      name: 'アップグレード',
      value: 'Proまたはプレミアム特典を受けるには、Patreonで支援してください。\n`/patreon link` コマンドで連携できます。'
    });
  } else {
    // プレミアム/Proユーザーの場合、詳細情報を表示
    embed.addFields({
      name: '✨ 利用可能な特典',
      value: userTier === 'premium' 
        ? '• 全プレミアム機能\n• 無制限辞書\n• 独占ボイス\n• 優先サポート'
        : '• 追加ボイス\n• 高品質音声\n• 拡張辞書',
      inline: false
    });

    if (guildId) {
      try {
        const guild = interaction.guild;
        const isOwner = guild?.ownerId === userId;
        embed.addFields({
          name: '🏢 このサーバーでの特典',
          value: isOwner 
            ? '✅ あなたが所有者のため、このサーバーで特典が利用できます'
            : '❌ このサーバーの所有者ではないため、特典は利用できません',
          inline: false
        });
      } catch (error) {
        console.error('ギルド情報取得エラー:', error);
      }
    }
  }

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
    components: [getCommonLinksRow()]
  });
}
