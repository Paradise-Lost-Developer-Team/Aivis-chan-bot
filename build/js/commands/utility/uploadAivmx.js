"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const proUpload_1 = require("../../utils/proUpload");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("uploadaivmx")
    .setDescription("aivmxファイルをアップロードして音声合成モデルとして保存します")
    .addAttachmentOption(option => option.setName("file")
    .setDescription("アップロードするaivmxファイル")
    .setRequired(true));
async function execute(interaction) {
    if (!interaction.guild) {
        await interaction.reply({ content: "このコマンドはサーバー内でのみ使用できます。", flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    // サーバー管理者権限チェック
    if (!interaction.memberPermissions?.has(discord_js_1.PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: "サーバー管理者のみ使用可能です。", flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const fileOption = interaction.options.get("file", true);
    const attachment = fileOption.attachment;
    if (!attachment) {
        await interaction.reply({ content: "ファイルが指定されていません。", flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    try {
        // attachment URLからファイルバッファを取得（Node v18以降のfetchを利用）
        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const savePath = await (0, proUpload_1.processAivmxUpload)(interaction.guild.id, { name: attachment.name ?? "uploaded.aivmx", buffer });
        await interaction.reply({ content: `ファイルが正常に保存されました: ${savePath}`, flags: discord_js_1.MessageFlags.Ephemeral });
    }
    catch (error) {
        await interaction.reply({ content: `ファイルアップロードに失敗しました: ${error.message}`, flags: discord_js_1.MessageFlags.Ephemeral });
    }
}
//# sourceMappingURL=uploadAivmx.js.map