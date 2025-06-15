import { SlashCommandBuilder, CommandInteraction, PermissionsBitField, MessageFlags } from "discord.js";
import { processAivmxUpload } from "../../utils/proUpload";

export const data = new SlashCommandBuilder()
	.setName("uploadaivmx")
	.setDescription("aivmxファイルをアップロードして音声合成モデルとして保存します")
	.addAttachmentOption(option =>
		option.setName("file")
			.setDescription("アップロードするaivmxファイル")
			.setRequired(true)
	);

export async function execute(interaction: CommandInteraction): Promise<void> {
	if (!interaction.guild) {
		await interaction.reply({ content: "このコマンドはサーバー内でのみ使用できます。", flags: MessageFlags.Ephemeral });
		return;
	}
	// サーバー管理者権限チェック
	if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
		await interaction.reply({ content: "サーバー管理者のみ使用可能です。", flags: MessageFlags.Ephemeral });
		return;
	}

	const fileOption = interaction.options.get("file", true);
	const attachment = fileOption.attachment;
	if (!attachment) {
		await interaction.reply({ content: "ファイルが指定されていません。", flags: MessageFlags.Ephemeral });
		return;
	}

	try {
		// attachment URLからファイルバッファを取得（Node v18以降のfetchを利用）
		const response = await fetch(attachment.url);
		const buffer = Buffer.from(await response.arrayBuffer());
		const savePath = await processAivmxUpload(interaction.guild.id, { name: attachment.name ?? "uploaded.aivmx", buffer });
		await interaction.reply({ content: `ファイルが正常に保存されました: ${savePath}`, flags: MessageFlags.Ephemeral });
	} catch (error: any) {
		await interaction.reply({ content: `ファイルアップロードに失敗しました: ${error.message}`, flags: MessageFlags.Ephemeral });
	}
}