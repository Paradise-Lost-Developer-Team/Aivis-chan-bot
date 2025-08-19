import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from '../../utils/subscription';
import {
    getGuildStyles,
    getMaxStylesCount,
    createStyle,
    deleteStyle,
    findStyleByName,
    applyStyle,
    getCurrentStyle
} from '../../utils/voiceStyles';
import { addSpeaker } from '../../utils/speakerManager';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicestyle')
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

    async execute(interaction: ChatInputCommandInteraction) {
        const guildId = interaction.guildId || '';
        if (!isProFeatureAvailable(guildId, 'voice-style')) {
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('Pro版限定')
                        .setDescription('このコマンドはPro版限定です')
                        .setColor(0xffa500)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
            return;
        }
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'create') {
            await handleCreate(interaction, guildId);
        } else if (subcommand === 'list') {
            await handleList(interaction, guildId);
        } else if (subcommand === 'apply') {
            await handleApply(interaction, guildId);
        } else if (subcommand === 'delete') {
            await handleDelete(interaction, guildId);
        } else if (subcommand === 'info') {
            await handleInfo(interaction, guildId);
        } else if (subcommand === 'advanced') {
            await handleAdvanced(interaction, guildId);
        }
        // style適用が完了したら話者リストに追加例
        // 例: addSpeaker(guildId, 999999, 'anime', 'アニメ風話者');
    }
};

async function handleCreate(interaction: ChatInputCommandInteraction, guildId: string) {
    const name = interaction.options.getString('name', true);
    const volume = interaction.options.getNumber('volume') || 0.2;
    const pitch = interaction.options.getNumber('pitch') || 0.0;
    const speed = interaction.options.getNumber('speed') || 1.0;
    const description = interaction.options.getString('description') || '';
    const styles = getGuildStyles(guildId);
    if (styles.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('重複エラー')
                    .setDescription('同名スタイルが存在します')
                    .setColor(0xff0000)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    const max = getMaxStylesCount(guildId);
    if (styles.length >= max) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('上限エラー')
                    .setDescription(`スタイル数が上限(${max})に達しています`)
                    .setColor(0xff0000)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    const created = createStyle(guildId, name, { volume, pitch, speed, description, createdBy: interaction.user.id });
    if (!created) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('作成失敗')
                    .setDescription('作成失敗')
                    .setColor(0xff0000)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    await interaction.reply({
        embeds: [addCommonFooter(
            new EmbedBuilder()
                .setTitle('作成完了')
                .setDescription(`スタイル「${name}」を作成しました`)
                .setColor(0x00bfff)
        )],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string) {
    const styles = getGuildStyles(guildId);
    if (!styles.length) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('スタイルなし')
                    .setDescription('スタイルがありません')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    const info = styles.map(s => `${s.name}${s.isDefault ? '(デフォルト)' : ''}`).join(', ');
    await interaction.reply({
        embeds: [addCommonFooter(
            new EmbedBuilder()
                .setTitle('スタイル一覧')
                .setDescription(`登録スタイル: ${info}`)
                .setColor(0x00bfff)
        )],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

async function handleApply(interaction: ChatInputCommandInteraction, guildId: string) {
    const name = interaction.options.getString('name', true);
    const style = findStyleByName(guildId, name);
    if (!style) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('未発見')
                    .setDescription('スタイルが見つかりません')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    applyStyle(guildId, style.id);
    await interaction.reply({
        embeds: [addCommonFooter(
            new EmbedBuilder()
                .setTitle('適用完了')
                .setDescription(`「${style.name}」を適用しました`)
                .setColor(0x00bfff)
        )],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

async function handleDelete(interaction: ChatInputCommandInteraction, guildId: string) {
    const name = interaction.options.getString('name', true);
    const style = findStyleByName(guildId, name);
    if (!style) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('未発見')
                    .setDescription('スタイルが見つかりません')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    if (!deleteStyle(guildId, style.id)) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('削除失敗')
                    .setDescription('削除失敗')
                    .setColor(0xff0000)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    await interaction.reply({
        embeds: [addCommonFooter(
            new EmbedBuilder()
                .setTitle('削除完了')
                .setDescription(`「${name}」を削除しました`)
                .setColor(0x00bfff)
        )],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

async function handleInfo(interaction: ChatInputCommandInteraction, guildId: string) {
    const style = getCurrentStyle(guildId);
    if (!style) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('未設定')
                    .setDescription('現在のスタイルがありません')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    await interaction.reply({
        embeds: [addCommonFooter(
            new EmbedBuilder()
                .setTitle('現在のスタイル')
                .setDescription(`現在のスタイル: ${style.name}\nvolume:${style.volume} / pitch:${style.pitch} / speed:${style.speed}`)
                .setColor(0x00bfff)
        )],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

async function handleAdvanced(interaction: ChatInputCommandInteraction, guildId: string) {
    if (!isPremiumFeatureAvailable(guildId, 'voice-style-advanced')) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('Premium限定')
                    .setDescription('Premium版のみ利用できます')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    const style = getCurrentStyle(guildId);
    if (!style) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('未設定')
                    .setDescription('スタイルがありません')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    const intonation = interaction.options.getNumber('intonation');
    const emphasis = interaction.options.getNumber('emphasis');
    const formant = interaction.options.getNumber('formant');
    if (intonation === null && emphasis === null && formant === null) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('パラメータ不足')
                    .setDescription('パラメータを指定してください')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    const newName = `${style.name}_adv_${Date.now()}`;
    const newStyle = createStyle(guildId, newName, {
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
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('作成失敗')
                    .setDescription('高度設定スタイル作成失敗')
                    .setColor(0xff0000)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    applyStyle(guildId, newStyle.id);
    await interaction.reply({
        embeds: [addCommonFooter(
            new EmbedBuilder()
                .setTitle('高度設定適用')
                .setDescription(`高度設定スタイル「${newName}」を作成・適用しました`)
                .setColor(0x00bfff)
        )],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}