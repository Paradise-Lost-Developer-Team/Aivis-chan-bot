import { SlashCommandBuilder } from '@discordjs/builders';
import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    AttachmentBuilder,
    MessageFlags
} from 'discord.js';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from '../../utils/subscription';
import { getMaxDictionaryEntries } from '../../utils/pro-features';
import * as fs from 'fs';
import * as path from 'path';
import { guildDictionary, updateGuildDictionary, saveToDictionaryFile, wordTypeChoices } from '../../utils/dictionaries';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dictionary-manager')
        .setDescription('Pro版限定: 辞書管理の高度な機能')
        .addSubcommand(subcommand =>
            subcommand.setName('export')
            .setDescription('現在の辞書をCSV形式でエクスポートします'))
        .addSubcommand(subcommand =>
            subcommand.setName('import')
            .setDescription('CSVファイルから辞書をインポートします (Premium限定)')
            .addAttachmentOption(option =>
                option.setName('file')
                .setDescription('CSVファイル (単語,読み方,単語タイプ の形式)')
                .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('stats')
            .setDescription('辞書の統計情報を表示します')),
    
    async execute(interaction: ChatInputCommandInteraction) {
        const guildId = interaction.guildId!;
        
        // Pro版以上か確認
        if (!isProFeatureAvailable(guildId, 'dictionary-manager')) {
            await interaction.reply({
                content: 'このコマンドはPro版限定機能です。Pro版へのアップグレードについては `/subscription purchase` で確認できます。',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        try {
            if (subcommand === 'export') {
                await handleExportCommand(interaction, guildId);
            } else if (subcommand === 'import') {
                await handleImportCommand(interaction, guildId);
            } else if (subcommand === 'stats') {
                await handleStatsCommand(interaction, guildId);
            }
        } catch (error) {
            console.error('辞書管理コマンド実行エラー:', error);
            await interaction.reply({
                content: '辞書操作中にエラーが発生しました。',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

// 辞書エクスポートコマンド
async function handleExportCommand(interaction: ChatInputCommandInteraction, guildId: string) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // このサーバーの辞書エントリを取得
    const dictionary = guildDictionary[guildId] || {};
    const entries = Object.entries(dictionary);
    
    if (entries.length === 0) {
        await interaction.editReply({
            content: 'このサーバーには登録された辞書がありません。',
        });
        return;
    }
    
    // CSV形式に変換
    let csvContent = "単語,読み方,単語タイプ\n";
    
    for (const [word, details] of entries) {
        const reading = details.reading || '';
        const wordType = details.wordType || 'COMMON_NOUN';
        csvContent += `"${word}","${reading}","${wordType}"\n`;
    }
    
    // 一時ファイルに保存
    const tempDir = path.join(__dirname, '..', '..', 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFile = path.join(tempDir, `dictionary_${guildId}_${Date.now()}.csv`);
    fs.writeFileSync(tempFile, csvContent, 'utf8');
    
    // ファイルを添付して送信
    const attachment = new AttachmentBuilder(tempFile, { name: `dictionary_${interaction.guild?.name}.csv` });
    
    await interaction.editReply({
        content: `辞書をエクスポートしました (${entries.length}件)`,
        files: [attachment]
    });
    
    // 一時ファイルを削除
    try {
        fs.unlinkSync(tempFile);
    } catch (error) {
        console.error('一時ファイル削除エラー:', error);
    }
}

// 辞書インポートコマンド
async function handleImportCommand(interaction: ChatInputCommandInteraction, guildId: string) {
    // Premium版限定機能
    if (!isPremiumFeatureAvailable(guildId, 'dictionary-manager')) {
        await interaction.reply({
            content: '辞書インポートはPremium版限定機能です。Premium版へのアップグレードについては `/subscription purchase` で確認できます。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const file = interaction.options.getAttachment('file');
    if (!file || !file.url || !file.name.endsWith('.csv')) {
        await interaction.editReply({
            content: '有効なCSVファイルを添付してください。'
        });
        return;
    }
    
    try {
        // ファイルをダウンロード
        const response = await fetch(file.url);
        if (!response.ok) {
            throw new Error(`ファイルのダウンロードに失敗しました: ${response.status}`);
        }
        
        const csvText = await response.text();
        const lines = csvText.split('\n');
        
        // ヘッダー行をスキップ
        const entries = lines.slice(1).filter(line => line.trim() !== '');
        
        // 最大辞書エントリ数をチェック
        const maxEntries = getMaxDictionaryEntries(guildId);
        const currentEntries = Object.keys(guildDictionary[guildId] || {}).length;
        
        if (currentEntries + entries.length > maxEntries) {
            await interaction.editReply({
                content: `辞書エントリが最大数を超えています。現在: ${currentEntries}, 追加: ${entries.length}, 最大: ${maxEntries}`
            });
            return;
        }
        
        // 辞書にインポート
        let successCount = 0;
        let errorCount = 0;
        
        const wordTypes = wordTypeChoices.map(choice => choice.value);
        
        for (const line of entries) {
            try {
                // CSVの各行をパース (簡易的なパース - カンマの中にカンマがある場合は考慮していない)
                const parts = line.split(',').map(part => 
                    part.startsWith('"') && part.endsWith('"') 
                        ? part.substring(1, part.length - 1) 
                        : part.trim()
                );
                
                if (parts.length < 2) continue;
                
                const word = parts[0];
                const reading = parts[1];
                const wordType = parts.length > 2 && wordTypes.includes(parts[2]) ? parts[2] : 'COMMON_NOUN';
                
                if (!word || !reading) continue;
                
                updateGuildDictionary(guildId, word, { reading, wordType });
                successCount++;
            } catch (lineError) {
                errorCount++;
                console.error('CSVライン解析エラー:', lineError);
            }
        }
        
        // 辞書を保存
        saveToDictionaryFile();
        
        await interaction.editReply({
            content: `辞書をインポートしました。成功: ${successCount}件, 失敗: ${errorCount}件`
        });
        
    } catch (error) {
        console.error('辞書インポートエラー:', error);
        await interaction.editReply({
            content: 'CSVファイルの読み込み中にエラーが発生しました。ファイル形式を確認してください。'
        });
    }
}

// 辞書統計コマンド
async function handleStatsCommand(interaction: ChatInputCommandInteraction, guildId: string) {
    // このサーバーの辞書エントリを取得
    const dictionary = guildDictionary[guildId] || {};
    const entries = Object.entries(dictionary);
    
    // 最大エントリー数を取得
    const maxEntries = getMaxDictionaryEntries(guildId);
    
    // 単語タイプごとの集計
    const typeCounts: Record<string, number> = {};
    
    for (const [_, details] of entries) {
        const wordType = details.wordType || 'COMMON_NOUN';
        typeCounts[wordType] = (typeCounts[wordType] || 0) + 1;
    }
    
    // 単語タイプの日本語名を取得
    const typeNames: Record<string, string> = {};
    wordTypeChoices.forEach(choice => {
        typeNames[choice.value] = choice.name;
    });
    
    // 単語タイプごとの集計結果を整形
    const typeStats = Object.entries(typeCounts)
        .map(([type, count]) => `${typeNames[type] || type}: ${count}件`)
        .join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('辞書統計情報')
        .setColor('#00AAFF')
        .addFields(
            { name: '登録単語数', value: `${entries.length} / ${maxEntries === Infinity ? '無制限' : maxEntries}` },
            { name: '単語タイプ別', value: typeStats || 'データなし' }
        )
        .setFooter({ text: `サブスクリプションタイプ: ${isPremiumFeatureAvailable(guildId, 'dictionary-manager') ? 'Premium' : isProFeatureAvailable(guildId, 'dictionary-manager') ? 'Pro' : '無料'}` })
        .setTimestamp();
    
    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}
