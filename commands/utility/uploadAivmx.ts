import { SlashCommandBuilder, CommandInteraction, PermissionsBitField, MessageFlags, EmbedBuilder } from "discord.js";
import { processAivmxUpload } from "../../utils/proUpload";
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

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
		await interaction.reply({
			embeds: [addCommonFooter(
				new EmbedBuilder()
					.setTitle('エラー')
					.setDescription('このコマンドはサーバー内でのみ使用できます。')
					.setColor(0xff0000)
			)],
			flags: MessageFlags.Ephemeral,
			components: [getCommonLinksRow()]
		});
		return;
	}
	// サーバー管理者権限チェック
	if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
		await interaction.reply({
			embeds: [addCommonFooter(
				new EmbedBuilder()
					.setTitle('権限エラー')
					.setDescription('サーバー管理者のみ使用可能です。')
					.setColor(0xff0000)
			)],
			flags: MessageFlags.Ephemeral,
			components: [getCommonLinksRow()]
		});
		return;
	}

	const fileOption = (interaction as any).options.get("file", true);
	const attachment = fileOption.attachment;
	if (!attachment) {
		await interaction.reply({
			embeds: [addCommonFooter(
				new EmbedBuilder()
					.setTitle('ファイルエラー')
					.setDescription('ファイルが指定されていません。')
					.setColor(0xffa500)
			)],
			flags: MessageFlags.Ephemeral,
			components: [getCommonLinksRow()]
		});
		return;
	}

	try {
		// attachment URLからファイルバッファを取得（Node v18以降のfetchを利用）
		const response = await fetch(attachment.url);
		const buffer = Buffer.from(await response.arrayBuffer());
		const savePath = await processAivmxUpload(interaction.guild.id, { name: attachment.name ?? "uploaded.aivmx", buffer });
		await interaction.reply({
			embeds: [addCommonFooter(
				new EmbedBuilder()
					.setTitle('アップロード完了')
					.setDescription(`ファイルが正常に保存されました: ${savePath}`)
					.setColor(0x00bfff)
			)],
			flags: MessageFlags.Ephemeral,
			components: [getCommonLinksRow()]
		});
	} catch (error: any) {
		await interaction.reply({
			embeds: [addCommonFooter(
				new EmbedBuilder()
					.setTitle('アップロード失敗')
					.setDescription(`ファイルアップロードに失敗しました: ${error.message}`)
					.setColor(0xff0000)
			)],
			flags: MessageFlags.Ephemeral,
			components: [getCommonLinksRow()]
		});
	}
}