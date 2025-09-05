import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { DICTIONARY_FILE, TTS_BASE_URL } from '../../utils/TTS-Engine';
import fs from 'fs';

// 辞書ファイルの読み込み
function loadDictionaryFile() {
    try {
        if (fs.existsSync(DICTIONARY_FILE)) {
            const content = fs.readFileSync(DICTIONARY_FILE, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('Error loading dictionary file:', error);
    }
    return {};
}

// 辞書の保存
function saveToDictionaryFile(dictionaryData: any) {
    try {
        fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(dictionaryData, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving dictionary:', error);
        return false;
    }
}

// AivisSpeech サーバーへのリクエスト
async function sendToAivisSpeech(word: string, pronunciation: string, accentType: number, wordType: string): Promise<{ ok: boolean; uuid?: string }> {
    try {
        const encodedWord = encodeURIComponent(word);
        const encodedPronunciation = encodeURIComponent(pronunciation);
        const encodedWordType = encodeURIComponent(wordType);
        const url = `${TTS_BASE_URL}/user_dict_word?surface=${encodedWord}&pronunciation=${encodedPronunciation}&accent_type=${accentType}&word_type=${encodedWordType}`;
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) return { ok: false };
        try {
            const body = await response.json();
            if (body && typeof body === 'object') {
                if (typeof (body as any).uuid === 'string') return { ok: true, uuid: (body as any).uuid };
                const keys = Object.keys(body);
                if (keys.length === 1) {
                    const k = keys[0];
                    if (/^[0-9a-fA-F\-]{36}$/.test(k)) return { ok: true, uuid: k };
                }
            }
        } catch (e) {}
        return { ok: true };
    } catch (error) {
        console.error('Error sending to AivisSpeech:', error);
        return { ok: false };
    }
}

async function findUuidForWord(word: string, pronunciation?: string, accentType?: number, guildId?: string) {
    try {
        if (guildId) {
            try {
                const local = loadDictionaryFile();
                if (local && local[guildId] && local[guildId][word]) {
                    const entry: any = local[guildId][word];
                    if (entry.uuid) return entry.uuid as string;
                    const localPron = entry.pronunciation;
                    const localAccent = typeof entry.accentType !== 'undefined' ? entry.accentType : undefined;
                    try {
                        const res = await fetch(`${TTS_BASE_URL}/user_dict`);
                        if (res.ok) {
                            const uuidDict = await res.json();
                            for (const [key, apiEntry] of Object.entries(uuidDict as any)) {
                                try {
                                    const e: any = apiEntry;
                                    if (e.surface === word) {
                                        if (typeof localPron !== 'undefined' && typeof e.pronunciation !== 'undefined') {
                                            if (e.pronunciation === localPron && (typeof localAccent === 'undefined' || e.accent_type === localAccent)) {
                                                local[guildId][word].uuid = key;
                                                saveToDictionaryFile(local);
                                                return key;
                                            }
                                        }
                                    }
                                } catch (e) {}
                            }
                            for (const [key, apiEntry] of Object.entries(uuidDict as any)) {
                                try {
                                    const e: any = apiEntry;
                                    if (e.surface === word) {
                                        local[guildId][word].uuid = key;
                                        saveToDictionaryFile(local);
                                        return key;
                                    }
                                } catch (e) {}
                            }
                            if (typeof localPron !== 'undefined') {
                                for (const [key, apiEntry] of Object.entries(uuidDict as any)) {
                                    try {
                                        const e: any = apiEntry;
                                        if (e.pronunciation === localPron) {
                                            local[guildId][word].uuid = key;
                                            saveToDictionaryFile(local);
                                            return key;
                                        }
                                    } catch (e) {}
                                }
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        const retries = 5;
        const delayMs = 1000;
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const res = await fetch(`${TTS_BASE_URL}/user_dict`);
                if (!res.ok) {
                    if (attempt < retries - 1) await sleep(delayMs);
                    continue;
                }
                const uuidDict = await res.json();
                for (const [key, entry] of Object.entries(uuidDict as any)) {
                    try {
                        const e: any = entry;
                        if (e.surface === word) {
                            if (typeof pronunciation !== 'undefined' && typeof e.pronunciation !== 'undefined') {
                                if (e.pronunciation === pronunciation && (typeof accentType === 'undefined' || e.accent_type === accentType)) {
                                    return key;
                                }
                            }
                        }
                    } catch (e) {}
                }
                for (const [key, entry] of Object.entries(uuidDict as any)) {
                    try {
                        const e: any = entry;
                        if (e.surface === word) return key;
                    } catch (e) {}
                }
            } catch (e) {}
            if (attempt < retries - 1) await sleep(delayMs);
        }
    } catch (e) {
        console.warn('findUuidForWord: failed to fetch user_dict', e);
    }
    return undefined;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dictionaries')
        .setDescription('辞書管理コマンド')
    .addSubcommand((sub: any) =>
            sub.setName('add')
                .setDescription('辞書に単語を追加')
                .addStringOption((option: any) =>
                    option.setName('word').setDescription('登録する単語').setRequired(true))
                .addStringOption((option: any) =>
                    option.setName('pronunciation').setDescription('単語の発音（カタカナ）').setRequired(true))
                .addIntegerOption((option: any) =>
                    option.setName('accent_type').setDescription('アクセント型（0から始まる整数）').setRequired(false))
                .addStringOption((option: any) =>
                    option.setName('word_type').setDescription('単語の品詞').setRequired(false)
                        .addChoices(
                            { name: '固有名詞', value: 'PROPER_NOUN' },
                            { name: '地名', value: 'PLACE_NAME' },
                            { name: '組織名', value: 'ORGANIZATION_NAME' },
                            { name: '人名', value: 'PERSON_NAME' },
                            { name: '姓', value: 'PERSON_FAMILY_NAME' },
                            { name: '名', value: 'PERSON_GIVEN_NAME' },
                            { name: '普通名詞', value: 'COMMON_NOUN' },
                            { name: '動詞', value: 'VERB' },
                            { name: '形容詞', value: 'ADJECTIVE' },
                            { name: '語尾', value: 'SUFFIX' }
                        ))
        )
    .addSubcommand((sub: any) =>
            sub.setName('edit')
                .setDescription('辞書の単語を編集')
                .addStringOption((option: any) =>
                    option.setName('word').setDescription('編集する単語').setRequired(true))
                .addStringOption((option: any) =>
                    option.setName('pronunciation').setDescription('新しい発音（カタカナ）').setRequired(true))
                .addIntegerOption((option: any) =>
                    option.setName('accent_type').setDescription('新しいアクセント型（0から始まる整数）').setRequired(false))
                .addStringOption((option: any) =>
                    option.setName('word_type').setDescription('新しい品詞').setRequired(false)
                        .addChoices(
                            { name: '固有名詞', value: 'PROPER_NOUN' },
                            { name: '地名', value: 'PLACE_NAME' },
                            { name: '組織名', value: 'ORGANIZATION_NAME' },
                            { name: '人名', value: 'PERSON_NAME' },
                            { name: '姓', value: 'PERSON_FAMILY_NAME' },
                            { name: '名', value: 'PERSON_GIVEN_NAME' },
                            { name: '普通名詞', value: 'COMMON_NOUN' },
                            { name: '動詞', value: 'VERB' },
                            { name: '形容詞', value: 'ADJECTIVE' },
                            { name: '語尾', value: 'SUFFIX' }
                        ))
        )
    .addSubcommand((sub: any) =>
            sub.setName('remove')
                .setDescription('辞書から単語を削除')
                .addStringOption((option: any) =>
                    option.setName('word').setDescription('削除する単語').setRequired(true))
            )
        .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('辞書の単語一覧を表示')
            ),
    async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
        if (sub === 'add') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const word = interaction.options.getString('word', true);
                const pronunciation = interaction.options.getString('pronunciation', true);
                const accentType = interaction.options.getInteger('accent_type') ?? 0;
                const wordType = interaction.options.getString('word_type') ?? 'COMMON_NOUN';
                const guildId = interaction.guildId!;
                // AivisSpeech サーバーに送信
                const aivisspeechResult = await sendToAivisSpeech(word, pronunciation, accentType, wordType);
                if (aivisspeechResult.ok) {
                    // 辞書に追加
                    const dictionaryData = loadDictionaryFile();
                    if (!dictionaryData[guildId]) dictionaryData[guildId] = {};
                    dictionaryData[guildId][word] = { pronunciation, accentType, wordType };
                    const dictionaryResult = saveToDictionaryFile(dictionaryData);
                    if (dictionaryResult) {
                        await interaction.editReply({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('単語追加')
                                    .setDescription(`単語 '${word}' を辞書に登録しました。`)
                                    .addFields(
                                        { name: '発音', value: pronunciation, inline: true },
                                        { name: 'アクセント', value: accentType.toString(), inline: true },
                                        { name: '品詞', value: wordType, inline: true }
                                    )
                                    .setColor(0x00bfff)
                            )],
                            components: [getCommonLinksRow()]
                        });
                    } else {
                        await interaction.editReply({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('保存失敗')
                                    .setDescription('VOICEVOXへの登録は成功しましたが、辞書ファイルへの保存に失敗しました。')
                                    .setColor(0xffa500)
                            )],
                            components: [getCommonLinksRow()]
                        });
                    }
                } else {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('追加失敗')
                                .setDescription(`単語 '${word}' の登録に失敗しました。サーバーの応答を確認してください。`)
                                .setColor(0xff0000)
                        )],
                        components: [getCommonLinksRow()]
                    });
                }
            } catch (error) {
                console.error('Command execution error:', error);
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('単語の登録中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
            }
        } else if (sub === 'edit') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const word = interaction.options.getString('word', true);
                const pronunciation = interaction.options.getString('pronunciation', true);
                const accentType = interaction.options.getInteger('accent_type') ?? 0;
                const wordType = interaction.options.getString('word_type') ?? 'COMMON_NOUN';
                const guildId = interaction.guildId!;
                // API から UUID を取得（ローカル辞書の uuid を優先）
                let uuid: string | undefined = await findUuidForWord(word, pronunciation, accentType, guildId);
                if (!uuid) {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('編集失敗')
                                .setDescription(`単語 '${word}' のUUIDが見つかりませんでした。まずは追加してください。`)
                                .setColor(0xffa500)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
                // VOICEVOXサーバーにPUT
                const encodedWord = encodeURIComponent(word);
                const encodedPronunciation = encodeURIComponent(pronunciation);
                const encodedWordType = encodeURIComponent(wordType);
                const url = `${TTS_BASE_URL}/user_dict_word/${uuid}?surface=${encodedWord}&pronunciation=${encodedPronunciation}&accent_type=${accentType}&word_type=${encodedWordType}`;
                const response = await fetch(url, { method: 'PUT' });
                if (response.status === 204) {
                    // 辞書ファイルも更新
                    const dictionaryData = loadDictionaryFile();
                    if (!dictionaryData[guildId]) dictionaryData[guildId] = {};
                    dictionaryData[guildId][word] = { pronunciation, accentType, wordType };
                    const dictionaryResult = saveToDictionaryFile(dictionaryData);
                    if (dictionaryResult) {
                        await interaction.editReply({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('単語編集')
                                    .setDescription(`単語 '${word}' を編集しました。`)
                                    .addFields(
                                        { name: '発音', value: pronunciation, inline: true },
                                        { name: 'アクセント', value: accentType.toString(), inline: true },
                                        { name: '品詞', value: wordType, inline: true }
                                    )
                                    .setColor(0x00bfff)
                            )],
                            components: [getCommonLinksRow()]
                        });
                    } else {
                        await interaction.editReply({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('保存失敗')
                                    .setDescription('VOICEVOXへの編集は成功しましたが、辞書ファイルへの保存に失敗しました。')
                                    .setColor(0xffa500)
                            )],
                            components: [getCommonLinksRow()]
                        });
                    }
                } else {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('編集失敗')
                                .setDescription(`単語 '${word}' の編集に失敗しました。サーバーの応答: ${response.status}`)
                                .setColor(0xff0000)
                        )],
                        components: [getCommonLinksRow()]
                    });
                }
            } catch (error) {
                console.error('Command execution error:', error);
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('単語の編集中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
            }
        } else if (sub === 'remove') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const word = interaction.options.getString('word', true);
                const guildId = interaction.guildId!;
                // API から UUID を取得（ローカル辞書の uuid を優先）
                let uuid: string | undefined = await findUuidForWord(word, undefined, undefined, guildId);
                if (!uuid) {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('削除失敗')
                                .setDescription(`単語 '${word}' のUUIDが見つかりませんでした。`)
                                .setColor(0xffa500)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
                // VOICEVOXサーバーにDELETE
                const url = `${TTS_BASE_URL}/user_dict_word/${uuid}`;
                const response = await fetch(url, { method: 'DELETE' });
                if (response.status === 204) {
                    // 辞書ファイルも更新
                    const dictionaryData = loadDictionaryFile();
                    if (dictionaryData[guildId] && dictionaryData[guildId][word]) {
                        delete dictionaryData[guildId][word];
                        saveToDictionaryFile(dictionaryData);
                    }
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('単語削除')
                                .setDescription(`単語 '${word}' を辞書から削除しました。`)
                                .setColor(0x00bfff)
                        )],
                        components: [getCommonLinksRow()]
                    });
                } else {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('削除失敗')
                                .setDescription(`単語 '${word}' の削除に失敗しました。サーバーの応答: ${response.status}`)
                                .setColor(0xff0000)
                        )],
                        components: [getCommonLinksRow()]
                    });
                }
            } catch (error) {
                console.error('Command execution error:', error);
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('単語の削除中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
            }
        } else if (sub === 'list') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                const guildId = interaction.guildId!;
                const dictionaryData = loadDictionaryFile();
                const words = dictionaryData[guildId] || {};
                if (Object.keys(words).length === 0) {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('単語一覧')
                                .setDescription('辞書に単語が登録されていません。')
                                .setColor(0x00bfff)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
                // Embedの文字数制限対応
                const MAX_CHARS = 4000;
                let description = '';
                let wordCount = 0;
                for (const [word, details] of Object.entries(words)) {
                    try {
                        const d: any = details;
                        const pronunciation = d.pronunciation || '不明';
                        const accentType = d.accentType !== undefined ? d.accentType : '不明';
                        const wordType = d.wordType || '不明';
                        const wordLine = `${word}: ${pronunciation}, アクセント: ${accentType}, 品詞: ${wordType}`;
                        if (description.length + wordLine.length + 1 > MAX_CHARS) {
                            description += `\n...他 ${Object.keys(words).length - wordCount} 件の単語があります`;
                            break;
                        }
                        if (description) description += '\n';
                        description += wordLine;
                        wordCount++;
                    } catch (error) {
                        if (description) description += '\n';
                        description += `${word}: [データエラー]`;
                        wordCount++;
                    }
                }
                const embed = new EmbedBuilder()
                    .setTitle('辞書の単語一覧')
                    .setDescription(description || '単語データの表示中にエラーが発生しました。')
                    .setFooter({ text: `合計: ${Object.keys(words).length}単語` });
                await interaction.editReply({
                    embeds: [addCommonFooter(embed)],
                    components: [getCommonLinksRow()]
                });
            } catch (error) {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('単語一覧の取得中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
            }
        }
    }
};
