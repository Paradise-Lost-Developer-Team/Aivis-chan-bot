import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, APIEmbed, APIActionRowComponent, APIButtonComponent } from 'discord.js';

export const COMMON_LINKS = [
    { label: '利用規約', url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Term-of-Service/' },
    { label: 'プライバシーポリシー', url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Privacy-Policy/' },
    { label: 'サポートサーバー', url: 'https://discord.gg/MPx2ny8HXT' },
    { label: 'ホームページ', url: 'https://www.aivis-chan-bot.com' },
    { label: 'ソースコード', url: 'https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot' },
];

export function addCommonFooter(embed: EmbedBuilder): EmbedBuilder {
    return embed
        .setFooter({
            text: '© 2025 Aivis Chan Bot by Paradise Lost Developer Team'
        })
        .setTimestamp();
}

export function getCommonLinksRow(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const link of COMMON_LINKS) {
        row.addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel(link.label)
                .setURL(link.url)
        );
    }
    return row;
}
