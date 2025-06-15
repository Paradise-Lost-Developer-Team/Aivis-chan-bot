import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, MessageFlags, CommandInteraction } from 'discord.js';
import { guildDictionary, loadToDictionaryFile } from '../../utils/dictionaries'; // Adjust the import path as necessary

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list_words')
        .setDescription('全ての登録されている単語を表示します'),
    async execute(interaction: CommandInteraction) {
        loadToDictionaryFile();
        const guildId = interaction.guildId!.toString();
        const words = guildDictionary[guildId] || {};
        
        console.log(`Guild ${guildId} words count: ${Object.keys(words).length}`);

        if (Object.keys(words).length === 0) {
            await interaction.reply({ content: "辞書に単語が登録されていません。", flags: MessageFlags.Ephemeral });
            return;
        }
        
        // Embedの文字数制限に対応
        const MAX_CHARS = 4000;
        let description = "";
        let wordCount = 0;
        
        for (const [word, details] of Object.entries(words)) {
            try {
                const detailsObj = details as any;
                const pronunciation = detailsObj.pronunciation || "不明";
                const accentType = detailsObj.accentType !== undefined ? detailsObj.accentType : "不明";
                const wordType = detailsObj.wordType || "不明";
                
                const wordLine = `${word}: ${pronunciation}, アクセント: ${accentType}, 品詞: ${wordType}`;
                
                if (description.length + wordLine.length + 1 > MAX_CHARS) {
                    description += `\n...他 ${Object.keys(words).length - wordCount} 件の単語があります`;
                    break;
                }
                
                if (description) description += "\n";
                description += wordLine;
                wordCount++;
            } catch (error) {
                console.error(`Error formatting word ${word}:`, error);
                if (description) description += "\n";
                description += `${word}: [データエラー]`;
                wordCount++;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("辞書の単語一覧")
            .setDescription(description || "単語データの表示中にエラーが発生しました。")
            .setFooter({ text: `合計: ${Object.keys(words).length}単語` });

        await interaction.reply({ embeds: [embed] });
    }
};