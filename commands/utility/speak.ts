import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { voiceClients, currentSpeaker } from '../../utils/TTS-Engine';
import { enqueueText, Priority } from '../../utils/VoiceQueue';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('speak')
        .setDescription('テキストを読み上げます')
        .addStringOption(option => 
            option.setName('text')
                    .setDescription('読み上げるテキスト')
                    .setRequired(true))
        .addBooleanOption(option =>
            option.setName('priority')
                    .setDescription('優先的に読み上げるかどうか')
                    .setRequired(false)),
    
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const guildId = interaction.guildId;
            if (!guildId) {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('このコマンドはサーバー内でのみ使用できます。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
                return;
            }
            
            // ボイス接続確認
            const voiceClient = voiceClients[guildId];
            if (!voiceClient) {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('未接続')
                            .setDescription('ボイスチャンネルに接続していません。先に /join コマンドを実行してください。')
                            .setColor(0xffa500)
                    )],
                    components: [getCommonLinksRow()]
                });
                return;
            }
            
            const text = interaction.options.getString('text', true);
            const isPriority = interaction.options.getBoolean('priority') || false;
            
            // 優先度設定
            const priority = isPriority ? Priority.HIGH : Priority.NORMAL;
            
            // キューに追加（interaction.userオブジェクトを元にメッセージを作成するとエラーになるため、オリジナルメッセージは指定しない）
            const formattedText = `${interaction.user.username}さんのコマンド、${text}`;
            enqueueText(guildId, formattedText, priority);
            
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('キュー追加')
                        .setDescription(`読み上げキューに追加しました。優先度: ${isPriority ? '高' : '通常'}`)
                        .setColor(0x00bfff)
                )],
                components: [getCommonLinksRow()]
            });
        } catch (error) {
            console.error('読み上げテストエラー:', error);
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription(`エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`)
                        .setColor(0xff0000)
                )],
                components: [getCommonLinksRow()]
            });
        }
    }
};
