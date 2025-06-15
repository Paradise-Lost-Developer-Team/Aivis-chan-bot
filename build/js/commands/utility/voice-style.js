"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const subscription_1 = require("../../utils/subscription");
const voiceStyles_1 = require("../../utils/voiceStyles");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('voice-style')
        .setDescription('Pro版限定: 読み上げ音声のカスタムスタイル設定')
        .addSubcommand(sub => sub
        .setName('create')
        .setDescription('新しい音声スタイルを作成')
        .addStringOption(o => o.setName('name').setDescription('スタイル名').setRequired(true))
        .addNumberOption(o => o.setName('volume').setDescription('音量(0.0〜1.0)'))
        .addNumberOption(o => o.setName('pitch').setDescription('ピッチ(-1.0〜1.0)'))
        .addNumberOption(o => o.setName('speed').setDescription('速度(0.5〜2.0)'))
        .addStringOption(o => o.setName('description').setDescription('スタイル説明')))
        .addSubcommand(sub => sub
        .setName('list')
        .setDescription('保存スタイルを一覧表示'))
        .addSubcommand(sub => sub
        .setName('apply')
        .setDescription('スタイルを適用')
        .addStringOption(o => o.setName('name').setDescription('スタイル名').setRequired(true)))
        .addSubcommand(sub => sub
        .setName('delete')
        .setDescription('スタイルを削除')
        .addStringOption(o => o.setName('name').setDescription('スタイル名').setRequired(true)))
        .addSubcommand(sub => sub
        .setName('info')
        .setDescription('現在適用中のスタイル情報を表示'))
        .addSubcommand(sub => sub
        .setName('advanced')
        .setDescription('Premium版限定: 高度なスタイル設定')
        .addNumberOption(o => o.setName('intonation').setDescription('抑揚(0.0〜1.0)'))
        .addNumberOption(o => o.setName('emphasis').setDescription('強調(0.0〜1.0)'))
        .addNumberOption(o => o.setName('formant').setDescription('フォルマント(-1.0〜1.0)'))),
    async execute(interaction) {
        const guildId = interaction.guildId || '';
        if (!(0, subscription_1.isProFeatureAvailable)(guildId, 'voice-style')) {
            await interaction.reply({ content: 'このコマンドはPro版限定です', flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'create') {
            await handleCreate(interaction, guildId);
        }
        else if (subcommand === 'list') {
            await handleList(interaction, guildId);
        }
        else if (subcommand === 'apply') {
            await handleApply(interaction, guildId);
        }
        else if (subcommand === 'delete') {
            await handleDelete(interaction, guildId);
        }
        else if (subcommand === 'info') {
            await handleInfo(interaction, guildId);
        }
        else if (subcommand === 'advanced') {
            await handleAdvanced(interaction, guildId);
        }
        // style適用が完了したら話者リストに追加例
        // 例: addSpeaker(guildId, 999999, 'anime', 'アニメ風話者');
    }
};
async function handleCreate(interaction, guildId) {
    // ...existing code...
    const name = interaction.options.getString('name', true);
    const volume = interaction.options.getNumber('volume') || 0.2;
    const pitch = interaction.options.getNumber('pitch') || 0.0;
    const speed = interaction.options.getNumber('speed') || 1.0;
    const description = interaction.options.getString('description') || '';
    const styles = (0, voiceStyles_1.getGuildStyles)(guildId);
    if (styles.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        await interaction.reply({ content: '同名スタイルが存在します', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const max = (0, voiceStyles_1.getMaxStylesCount)(guildId);
    if (styles.length >= max) {
        await interaction.reply({ content: `スタイル数が上限(${max})に達しています`, flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const created = (0, voiceStyles_1.createStyle)(guildId, name, { volume, pitch, speed, description, createdBy: interaction.user.id });
    if (!created) {
        await interaction.reply({ content: '作成失敗', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    await interaction.reply({ content: `スタイル「${name}」を作成しました`, flags: discord_js_1.MessageFlags.Ephemeral });
}
async function handleList(interaction, guildId) {
    // ...existing code...
    const styles = (0, voiceStyles_1.getGuildStyles)(guildId);
    if (!styles.length) {
        await interaction.reply({ content: 'スタイルがありません', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const info = styles.map(s => `${s.name}${s.isDefault ? '(デフォルト)' : ''}`).join(', ');
    await interaction.reply({ content: `登録スタイル: ${info}`, flags: discord_js_1.MessageFlags.Ephemeral });
}
async function handleApply(interaction, guildId) {
    // ...existing code...
    const name = interaction.options.getString('name', true);
    const style = (0, voiceStyles_1.findStyleByName)(guildId, name);
    if (!style) {
        await interaction.reply({ content: 'スタイルが見つかりません', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    (0, voiceStyles_1.applyStyle)(guildId, style.id);
    await interaction.reply({ content: `「${style.name}」を適用しました`, flags: discord_js_1.MessageFlags.Ephemeral });
}
async function handleDelete(interaction, guildId) {
    // ...existing code...
    const name = interaction.options.getString('name', true);
    const style = (0, voiceStyles_1.findStyleByName)(guildId, name);
    if (!style) {
        await interaction.reply({ content: 'スタイルが見つかりません', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    if (!(0, voiceStyles_1.deleteStyle)(guildId, style.id)) {
        await interaction.reply({ content: '削除失敗', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    await interaction.reply({ content: `「${name}」を削除しました`, flags: discord_js_1.MessageFlags.Ephemeral });
}
async function handleInfo(interaction, guildId) {
    // ...existing code...
    const style = (0, voiceStyles_1.getCurrentStyle)(guildId);
    if (!style) {
        await interaction.reply({ content: '現在のスタイルがありません', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    await interaction.reply({
        content: `現在のスタイル: ${style.name}\nvolume:${style.volume} / pitch:${style.pitch} / speed:${style.speed}`,
        ephemeral: true
    });
}
async function handleAdvanced(interaction, guildId) {
    // ...existing code...
    if (!(0, subscription_1.isPremiumFeatureAvailable)(guildId, 'voice-style-advanced')) {
        await interaction.reply({ content: 'Premium版のみ利用できます', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const style = (0, voiceStyles_1.getCurrentStyle)(guildId);
    if (!style) {
        await interaction.reply({ content: 'スタイルがありません', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const intonation = interaction.options.getNumber('intonation');
    const emphasis = interaction.options.getNumber('emphasis');
    const formant = interaction.options.getNumber('formant');
    if (intonation === null && emphasis === null && formant === null) {
        await interaction.reply({ content: 'パラメータを指定してください', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const newName = `${style.name}_adv_${Date.now()}`;
    const newStyle = (0, voiceStyles_1.createStyle)(guildId, newName, {
        volume: style.volume,
        pitch: style.pitch,
        speed: style.speed,
        intonation: intonation ?? undefined,
        emphasis: emphasis ?? undefined,
        formant: formant ?? undefined,
        description: '高度設定版',
        createdBy: interaction.user.id
    });
    if (!newStyle) {
        await interaction.reply({ content: '高度設定スタイル作成失敗', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    (0, voiceStyles_1.applyStyle)(guildId, newStyle.id);
    await interaction.reply({ content: `高度設定スタイル「${newName}」を作成・適用しました`, flags: discord_js_1.MessageFlags.Ephemeral });
}
//# sourceMappingURL=voice-style.js.map