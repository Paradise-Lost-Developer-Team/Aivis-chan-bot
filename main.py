import discord
from discord import app_commands
from discord.player import FFmpegPCMAudio
from discord.ui import View, Select
import requests
import json
import asyncio
import io
import tempfile
from config import TOKEN
import re
import os

server_statuses = {} # サーバーのステータスを格納する辞書

save_text_and_voice_channels = {} # テキストチャンネルとボイスチャンネルを格納する辞書

activity = discord.Activity(name="起動中…", type=discord.ActivityType.playing)
intents = discord.Intents.all()
intents.message_content = True
intents.voice_states = True
intents.guilds = True
client = discord.Client(intents=intents, activity=activity)
tree = app_commands.CommandTree(client)
text_channels = {} # テキストチャンネルを格納する辞書
guild_id = {}  # ギルドIDを格納するための辞書
voice_clients = {} # キューを格納するための辞書
current_speaker = {}  # ギルドごとの話者設定
auto_join_channels = {} # 自動入室するボイスチャンネル
audio_queues = {}  # ギルドごとの音声キュー

FFMPEG_PATH = "C:/ffmpeg/bin/ffmpeg.exe"

class ServerStatus:
    def __init__(self, guild_id: int):
        self.guild_id = guild_id
        self.task = asyncio.create_task(self.save_task())
    
    async def save_task(self):
        while True:
            # guild.idを保存するロジックをここに追加
            print(f"Saving guild id: {self.guild_id}")
            await asyncio.sleep(60)  # 60秒ごとに保存

class AivisAdapter:
    def __init__(self):
        # APIサーバーのエンドポイントURL
        self.URL = "http://127.0.0.1:10101"
        # 話者ID (話させたい音声モデルidに変更してください)
        self.speaker = {}

    def speak_voice(self, text: str, voice_client: discord.VoiceClient):
        params = {"text": text, "speaker": self.speaker}
        query_response = requests.post(f"{self.URL}/audio_query", params=params).json()

        audio_response = requests.post(
            f"{self.URL}/synthesis",
            params={"speaker": self.speaker},
            data=json.dumps(query_response)
        )
        voice_client.play(create_ffmpeg_audio_source(io.BytesIO(audio_response.content)))

def create_ffmpeg_audio_source(source):
    if isinstance(source, str):
        return FFmpegPCMAudio(source, executable=FFMPEG_PATH)
    elif isinstance(source, io.BytesIO):
        return FFmpegPCMAudio(source, pipe=True, executable=FFMPEG_PATH)
    else:
        raise ValueError("Unsupported audio source type")

def post_audio_query(text: str, speaker: int):
    params = {"text": text, "speaker": speaker}
    response = requests.post("http://127.0.0.1:10101/audio_query", params=params)
    return response.json()

def post_synthesis(audio_query: dict, speaker: int):
    response = requests.post(
        "http://127.0.0.1:10101/synthesis",
        params={"speaker": speaker},
        headers={"accept": "audio/wav", "Content-Type": "application/json"},
        data=json.dumps(audio_query),
    )
    return response.content

voice_settings = {
    "volume": {},  # デフォルトの音量を0.3に設定
    "pitch": {},
    "rate": {},
    "speed": {},
    "style_strength": {},
    "tempo": {}
}

def adjust_audio_query(audio_query: dict, guild_id: int):
    audio_query["volumeScale"] = voice_settings["volume"].get(guild_id, 0.3)  # デフォルトの音量を0.3に設定
    audio_query["pitchScale"] = voice_settings["pitch"].get(guild_id, 0.0)
    audio_query["rateScale"] = voice_settings["rate"].get(guild_id, 1.0)
    audio_query["speedScale"] = voice_settings["speed"].get(guild_id, 1.0)
    audio_query["styleStrength"] = voice_settings["style_strength"].get(guild_id, 1.0)
    audio_query["tempoScale"] = voice_settings["tempo"].get(guild_id, 1.0)
    return audio_query

DICTIONARY_FILE = "guild_dictionaries.json"
guild_dictionary = {}

try:
    with open(DICTIONARY_FILE, "r", encoding="utf-8") as file:
        guild_dictionary = json.load(file)
except (FileNotFoundError, json.JSONDecodeError):
    guild_dictionary = {}

MAX_TEXT_LENGTH = 200  # 読み上げる文章の文字数上限

def speak_voice(text: str, speaker: int, guild_id: int):
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH] + "..."  # 上限を超えた場合は切り捨てて "..." を追加
    audio_query = post_audio_query(text, speaker)
    audio_query = adjust_audio_query(audio_query, guild_id)
    audio_content = post_synthesis(audio_query, speaker)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio_file:
        temp_audio_file.write(audio_content)
        temp_audio_file_path = temp_audio_file.name
    return temp_audio_file_path

async def fetch_uuids_periodically():
    while True:
        fetch_all_uuids()
        await asyncio.sleep(300)  # 5分ごとに実行

AUTO_JOIN_FILE = "auto_join_channels.json"
auto_join_channels = {}

def load_auto_join_channels():
    try:
        with open(AUTO_JOIN_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict):  # JSONが辞書形式であることを確認
                return data  # そのまま辞書として返す
            else:
                print("⚠️ JSONのフォーマットが正しくありません。")
                return {}
    except FileNotFoundError:
        print("❌ auto_join_channels.json が見つかりません。")
        return {}
    except json.JSONDecodeError:
        print("❌ JSONファイルのフォーマットエラーが発生しました。")
        return {}
    except Exception as e:
        print(f"❌ 予期しないエラーが発生しました: {e}")
        return {}


def save_auto_join_channels():
    with open(AUTO_JOIN_FILE, "w", encoding="utf-8") as file:
        json.dump(auto_join_channels, file, ensure_ascii=False, indent=4)

@client.event
async def on_ready():
    print("起動完了")
    try:
        synced = await tree.sync()
        print(f"{len(synced)}個のコマンドを同期しました")
    except Exception as e:
        print(e)

    # 15秒毎にアクティヴィティを更新します
    client.loop.create_task(fetch_uuids_periodically())  # UUID取得タスクを開始
    while True:
        joinserver = len(client.guilds)
        servers = str(joinserver)
        await client.change_presence(
            activity=discord.CustomActivity(name="サーバー数:" + servers))
        await asyncio.sleep(15)
        joinvc = len(client.voice_clients)
        vc = str(joinvc)
        await client.change_presence(
            activity=discord.CustomActivity(name="VC:" + vc))
        await asyncio.sleep(15)


async def play_audio_queue(guild_id):
    """ 音声キューを順番に再生するための処理 """
    vc = voice_clients.get(guild_id)
    if not vc:
        return

    while not audio_queues[guild_id].empty():
        audio_path = await audio_queues[guild_id].get()
        if not vc.is_playing():
            vc.play(create_ffmpeg_audio_source(audio_path))
            while vc.is_playing():
                await asyncio.sleep(1)  # 再生が終わるまで待機

@tree.command(
    name="join", 
    description="ボイスチャンネルに接続し、指定したテキストチャンネルのメッセージを読み上げます。"
)
@app_commands.describe(
    voice_channel="接続するボイスチャンネルを選択してください。",
    text_channel="読み上げるテキストチャンネルを選択してください。"
)
async def join_command(
    interaction: discord.Interaction, 
    voice_channel: discord.VoiceChannel = None, 
    text_channel: discord.TextChannel = None
):
    global voice_clients, text_channels, save_text_and_voice_channels # グローバル変数を使用するため宣言
    # サーバー外では実行不可
    if interaction.guild is None:
        await interaction.response.send_message(
            "このコマンドはサーバー内でのみ使用できます。", 
            ephemeral=True
        )
        return

    # guild_id を必ず定義する
    guild_id = str(interaction.guild.id)

    # ユーザーがボイスチャンネルを指定していない場合は、自身が接続しているボイスチャンネルを取得する
    if voice_channel is None:
        if not interaction.user.voice or not interaction.user.voice.channel:
            await interaction.response.send_message(
                "あなたはボイスチャンネルに接続していません。",
                ephemeral=True
            )
            return
        voice_channel = interaction.user.voice.channel

    # テキストチャンネルが指定されていなければ、コマンド実行チャンネルを使用する
    if text_channel is None:
        text_channel = interaction.channel

    # 既に他のBOTが接続しているか確認
    for vc in voice_clients.values():
        if vc.channel == voice_channel:
            await interaction.response.send_message(
                "既に他のBOTがこのボイスチャンネルに接続しています。",
                ephemeral=True
            )
            return

    # テキストチャンネルの情報を保存する
    if guild_id not in text_channels:
        text_channels[guild_id] = {}
    text_channels[guild_id]["text_channel"] = text_channel.id

    save_text_and_voice_channels = {
        "guild": interaction.guild.id,
        "voice_channel": voice_channel.id,
        "text_channel": text_channel.id
    }
    print(f"Join command: guild={interaction.guild.id}, voice_channel={voice_channel.id}, text_channel={text_channel.id}")

    try:
        voice_client = voice_clients.get(interaction.guild.id)
        if voice_client and voice_client.is_connected():
            await voice_client.move_to(voice_channel)
            print(f"Moved to voice channel {voice_channel.id}")
            await interaction.response.send_message(
                f"{voice_channel.name} に移動しました。\n読み上げチャンネル: {text_channel.mention}"
            )
            path = speak_voice(
                f"{voice_channel.name} に移動しました。",
                current_speaker.get(interaction.guild.id, 888753760),
                interaction.guild.id,
            )
            while voice_clients[interaction.guild.id].is_playing():
                await asyncio.sleep(1)
            voice_clients[interaction.guild.id].play(create_ffmpeg_audio_source(path))

        else:
            global server_statuses
            voice_clients[interaction.guild.id] = await voice_channel.connect()
            print(f"Connected to voice channel {voice_channel.id}")
            await interaction.response.send_message(
                f"{voice_channel.name} に接続しました。\n読み上げチャンネル: {text_channel.mention}"
            )
            server_statuses[interaction.guild.id] = ServerStatus(interaction.guild.id)
            path = speak_voice(
                f"{voice_channel.name} に接続しました。",
                current_speaker.get(interaction.guild.id, 888753760),
                interaction.guild.id,
            )
            while voice_clients[interaction.guild.id].is_playing():
                await asyncio.sleep(1)
            voice_clients[interaction.guild.id].play(create_ffmpeg_audio_source(path))
    except discord.errors.ClientException as e:
        print(f"ClientException: {e}")
        await interaction.response.send_message(f"エラーが発生しました: {str(e)}", ephemeral=True)

@tree.command(
    name="leave", description="ボイスチャンネルから切断します。"
)
async def leave_command(interaction: discord.Interaction):
    global voice_clients
    guild_id_int = interaction.guild.id
    guild_id_str = str(guild_id_int)

    # 整数型、または文字列型のキーのどちらかで登録されているかチェック
    if guild_id_int in voice_clients:
        voice_client = voice_clients[guild_id_int]
        key_used = guild_id_int
    elif guild_id_str in voice_clients:
        voice_client = voice_clients[guild_id_str]
        key_used = guild_id_str
    else:
        await interaction.response.send_message("現在、ボイスチャンネルに接続していません。")
        return

    try:
        await voice_client.disconnect()
    except Exception as e:
        await interaction.response.send_message(f"切断中にエラーが発生しました: {e}")
        return

    del voice_clients[key_used]
    await interaction.response.send_message("ボイスチャンネルから切断しました。")


# ping応答コマンドを定義します
@tree.command(
    name="ping", description="BOTの応答時間をテストします。"
)
async def ping_command(interaction: discord.Interaction):
    text = f"Pong! BotのPing値は{round(client.latency*1000)}msです。"
    embed = discord.Embed(title="Latency", description=text)
    print(text)
    await interaction.response.send_message(embed=embed)

@tree.command(
    name="register_auto_join", description="BOTの自動入室機能を登録します。"
)
@app_commands.describe(
    voice_channel="自動入室するボイスチャンネルを選択してください。",
    text_channel="通知を送るテキストチャンネルを選択してください。(任意)"
)
async def register_auto_join_command(
    interaction: discord.Interaction,
    voice_channel: discord.VoiceChannel,
    text_channel: discord.TextChannel = None
):
    global auto_join_channels
    load_auto_join_channels()
    guild_id = str(interaction.guild.id)

    if voice_channel:
        if text_channel is not None:
            auto_join_channels[guild_id] = {
                "voice_channel_id": str(voice_channel.id),
                "text_channel_id": str(text_channel.id)
            }
        else:
            auto_join_channels[guild_id] = {
                "voice_channel_id": str(voice_channel.id),
                "text_channel_id": str(voice_channel.id)
            }
    
    save_auto_join_channels()
    guild = interaction.guild
    channel_name = text_channel.name if text_channel else voice_channel.name
    await interaction.response.send_message(
        f"サーバー {guild.name} の自動入室チャンネルを {channel_name} に設定しました。"
    )

    # テキストチャンネルの情報を保存する
    if guild_id not in text_channels:
        text_channels[guild_id] = {}
    text_channels[guild_id]["text_channel"] = text_channel.id if text_channel else voice_channel.id

@tree.command(
    name="unregister_auto_join",
    description="自動接続の設定を解除します。"
)
async def unregister_auto_join(interaction: discord.Interaction):
    global auto_join_channels
    guild_id = str(interaction.guild.id)
    
    # 登録時と同じグローバル変数を更新する
    # もし load_auto_join_channels() がグローバル変数 auto_join_channels を更新するなら呼び出すだけでOKです
    auto_join_channels = load_auto_join_channels()  # もしくは、load_auto_join_channels()が既にグローバル変数を更新していれば不要

    if guild_id in auto_join_channels:
        del auto_join_channels[guild_id]
        save_auto_join_channels()  # グローバル変数 auto_join_channels を保存
        await interaction.response.send_message("自動接続設定を解除しました。")
    else:
        await interaction.response.send_message("このサーバーには登録された自動接続設定がありません。", ephemeral=True)

@client.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    """ ユーザーのボイスチャンネルの入退出を処理 """
    if member.bot:
        return

    guild_id = str(member.guild.id)

    # 自動入室機能の実行
    global voice_clients, current_speaker, save_text_and_voice_channels, text_channels
    auto_join_channels = load_auto_join_channels()
    for guild_id, channel_info in auto_join_channels.items():
        guild = client.get_guild(int(guild_id))
        if guild:
            channel = guild.get_channel(int(channel_info["voice_channel_id"]))
            if channel and guild.id not in voice_clients:
                if len(channel.members) > 0:  # チャンネルにメンバーがいる場合のみ接続
                    # 既に他のBOTが接続しているか確認
                    for vc in voice_clients.values():
                        if vc.channel == channel:
                            return
                    voice_clients[guild.id] = await channel.connect()
                    print(f"自動入室: ギルドID {guild_id} のチャンネル {channel.name} に接続しました。")
                    path = speak_voice(f"{channel.name} に接続しました。", current_speaker.get(guild.id, 888753760), guild.id)
                    while voice_clients[guild.id].is_playing():
                        await asyncio.sleep(1)
                    voice_clients[guild.id].play(create_ffmpeg_audio_source(path))
                    server_statuses[guild.id] = ServerStatus(guild.id)
                    save_text_and_voice_channels = {
                        "guild": guild.id,
                        "voice_channel": channel.id,
                        "text_channel": channel_info.get("text_channel_id")
                    }
                    # テキストチャンネルの情報を保存する
                    if guild_id not in text_channels:
                        text_channels[guild_id] = {}
                    text_channels[guild_id]["text_channel"] = client.get_channel(int(channel_info.get("text_channel_id")))

    if member.guild.id in voice_clients and voice_clients[member.guild.id].is_connected():
        if before.channel is None and after.channel is not None:
            # ユーザーがボイスチャンネルに参加したとき
            if voice_clients[member.guild.id].channel == after.channel:
                nickname = member.display_name
                path = speak_voice(f"{nickname} さんが入室しました。", current_speaker.get(member.guild.id, 888753760), member.guild.id)
                while voice_clients[member.guild.id].is_playing():
                    await asyncio.sleep(1)
                voice_clients[member.guild.id].play(create_ffmpeg_audio_source(path))
        elif before.channel is not None and after.channel is None:
            # ユーザーがボイスチャンネルから退出したとき
            if voice_clients[member.guild.id].channel == before.channel:
                nickname = member.display_name
                path = speak_voice(f"{nickname} さんが退室しました。", current_speaker.get(member.guild.id, 888753760), member.guild.id)
                while voice_clients[member.guild.id].is_playing():
                    await asyncio.sleep(1)
                voice_clients[member.guild.id].play(create_ffmpeg_audio_source(path))
        # ボイスチャンネルに誰もいなくなったら退室
        if len(voice_clients[member.guild.id].channel.members) == 1:  # ボイスチャンネルにいるのがBOTだけの場合
            await voice_clients[member.guild.id].disconnect()
            del voice_clients[member.guild.id]

# URL、ファイル、EMBEDを除外するための正規表現パターン
URL_PATTERN = r"https?://[^\s]+"

# カスタム絵文字(Nitroを含む)を除外するための正規表現パターン
CUSTOM_EMOJI_REGEX = r"<a?:\w+:\d+>"

@client.event
async def on_message(message):
    if message.author.bot:
        print("Message is from a bot, ignoring.")
        return
    # メッセージから絵文字、カスタム絵文字、メンション、URL、マークダウン、スポイラーを除外
    message_content = message.content
    message_content = re.sub(r'\|\|.*?\|\|', '', message_content)  # スポイラーを除外
    message_content = re.sub(CUSTOM_EMOJI_REGEX, '', message_content)
    message_content = re.sub(URL_PATTERN, '', message_content)
    message_content = re.sub(r'<@!?[0-9]+>', '', message_content)  # ユーザー、ロールメンションを除外
    message_content = re.sub(r'<#!?[0-9]+>', '', message_content)  # チャンネルメンションを除外
    message_content = re.sub(r'\*|_|~|`', '', message_content)  # マークダウンを除外
    message_content = ''.join(char for char in message_content if char not in message.guild.emojis)
    
    # (音量0) が文頭にある場合は読み上げない
    if re.match(r'^\(音量0\)', message_content):
        print("Message contains (音量0) at the beginning, ignoring.")
        return
    
    global voice_clients, text_channels, current_speaker, save_text_and_voice_channels
    voice_client = voice_clients.get(message.guild.id)
    text_channel_id = text_channels.get(str(message.guild.id), {}).get("text_channel")
    
    # save_text_and_voice_channelsからテキストチャンネルIDを取得
    if not text_channel_id and save_text_and_voice_channels.get("guild") == message.guild.id:
        text_channel_id = save_text_and_voice_channels.get("text_channel")
    
    print(f"Voice client: {voice_client}")
    print(f"Current speaker: {current_speaker}")
    print(f"Message content: {message_content}")
    print(f"Message channel: {message.channel}")
    print(f"Text channel: {text_channel_id}")
    
    if text_channel_id is None:
        print("Text channel ID is None, ignoring message.")
        return
    
    if isinstance(text_channel_id, discord.TextChannel):
        text_channel_id = text_channel_id.id
    
    if voice_client and voice_client.is_connected() and message.channel.id == text_channel_id:
        print("Voice client is connected and message is in the correct channel, handling message.")
        await handle_message(message, message_content, voice_client)
    else:
        print("Voice client is not connected or message is in the wrong channel, ignoring message.")

async def handle_message(message, message_content, voice_client):
    print(f"Handling message: {message_content}")
    speaker_id = current_speaker.get(message.guild.id, 888753760)  # デフォルトの話者ID
    path = speak_voice(message_content, speaker_id, message.guild.id)
    while voice_client.is_playing():
        await asyncio.sleep(0.1)
    voice_client.play(create_ffmpeg_audio_source(path))
    print(f"Finished playing message: {message_content}")

# スピーカー情報を読み込む
speakers = []
speakers_file = "speakers.json"

try:
    if os.path.exists(speakers_file):
        with open(speakers_file, "r", encoding="utf-8") as f:
            speakers = json.load(f)
    else:
        print(f"⚠️ ファイル '{speakers_file}' が見つかりません。デフォルトの設定を使用します。")
except (json.JSONDecodeError, IOError) as e:
    print(f"⚠️ スピーカー情報の読み込み中にエラーが発生しました: {e}")
    speakers = []

# スピーカー名とスタイルのリストを作成（データがある場合のみ）
speaker_choices = []
if speakers:
    speaker_choices = [
        app_commands.Choice(
            name=f"{speaker.get('name', '不明')} - {style.get('name', '不明')}",
            value=str(style["id"]),
        )
        for speaker in speakers
        for style in speaker.get("styles", [])
        if isinstance(style.get("id"), int)  # IDが整数であることを確認
    ]

def get_speaker_info_by_id(speaker_id):
    for speaker in speakers:
        for style in speaker.get("styles", []):
            if style.get("id") == speaker_id:
                return speaker, style
    return None, None

class SpeakerSelect(Select):
    """ 話者を選択するためのプルダウンメニュー """

    def __init__(self, speakers, user_id, guild_id):
        options = [
            discord.SelectOption(
                label=f"{speaker.get('name', '不明')} - {style.get('name', '不明')}",
                value=str(style["id"])
            )
            for speaker in speakers
            for style in speaker.get("styles", [])
        ]

        # 選択メニューの初期化
        super().__init__(
            placeholder="話者を選択してください",
            min_values=1,
            max_values=1,
            options=options
        )
        self.user_id = user_id
        self.guild_id = guild_id

    async def callback(self, interaction: discord.Interaction):
        """ 話者を変更する処理 """
        speaker_id = int(self.values[0])
        speaker_info, style_info = get_speaker_info_by_id(speaker_id)

        if speaker_info and style_info:
            current_speaker[self.guild_id] = speaker_id  # ギルドごとに設定
            await interaction.response.send_message(
                f"✅ 話者を **{speaker_info['name']}**（スタイル: {style_info['name']}）に変更しました。",
                ephemeral=True
            )
        else:
            await interaction.response.send_message("⚠️ 無効な選択です。", ephemeral=True)


class SpeakerSelectView(View):
    """ 選択メニューのビュー """
    def __init__(self, speakers, user_id, guild_id):
        super().__init__()
        self.add_item(SpeakerSelect(speakers, user_id, guild_id))

@tree.command(
    name="set_speaker", description="話者を選択メニューから切り替えます。"
)
async def set_speaker_command(interaction: discord.Interaction):
    """ 話者の選択メニューを表示 """
    if not speakers:
        await interaction.response.send_message("⚠️ スピーカー情報が読み込まれていません。", ephemeral=True)
        return

    view = SpeakerSelectView(speakers, interaction.user.id, interaction.guild.id)
    await interaction.response.send_message("🎙️ **話者を選択してください:**", view=view, ephemeral=True)

@tree.command(
    name="set_volume", description="音量を設定します。"
)
@app_commands.describe(
    volume="設定する音量を入力してください (0.0 - 2.0)。"
)
async def set_volume_command(interaction: discord.Interaction, volume: float):
    if 0.0 <= volume <= 2.0:
        voice_settings["volume"][interaction.guild.id] = volume
        await interaction.response.send_message(f"音量を {volume} に設定しました。")
    else:
        await interaction.response.send_message("無効な音量値です。0.0から2.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_pitch", description="音高を設定します。"
)
@app_commands.describe(
    pitch="設定する音高を入力してください (-1.0 - 1.0)。"
)
async def set_pitch_command(interaction: discord.Interaction, pitch: float):
    if -1.0 <= pitch <= 1.0:
        voice_settings["pitch"][interaction.guild.id] = pitch
        await interaction.response.send_message(f"音高を {pitch} に設定しました。")
    else:
        await interaction.response.send_message("無効な音高値です。-1.0から1.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_speed", description="話速を設定します。"
)
@app_commands.describe(
    speed="設定する話速を入力してください (0.5 - 2.0)。"
)
async def set_speed_command(interaction: discord.Interaction, speed: float):
    if 0.5 <= speed <= 2.0:
        voice_settings["speed"][interaction.guild.id] = speed
        await interaction.response.send_message(f"話速を {speed} に設定しました。")
    else:
        await interaction.response.send_message("無効な話速値です。0.5から2.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_style_strength", description="スタイルの強さを設定します。"
)
@app_commands.describe(
    style_strength="設定するスタイルの強さを入力してください (0.0 - 2.0)。"
)
async def set_style_strength_command(interaction: discord.Interaction, style_strength: float):
    if 0.0 <= style_strength <= 2.0:
        voice_settings["style_strength"][interaction.guild.id] = style_strength
        await interaction.response.send_message(f"スタイルの強さを {style_strength} に設定しました。")
    else:
        await interaction.response.send_message("無効なスタイルの強さです。0.0から2.0の間で設定してください。", ephemeral=True)

@tree.command(
    name="set_tempo", description="テンポの緩急を設定します。"
)
@app_commands.describe(
    tempo="設定するテンポの緩急を入力してください (0.5 - 2.0)。"
)
async def set_tempo_command(interaction: discord.Interaction, tempo: float):
    if 0.5 <= tempo <= 2.0:
        voice_settings["tempo"][interaction.guild.id] = tempo
        await interaction.response.send_message(f"テンポの緩急を {tempo} に設定しました。")
    else:
        await interaction.response.send_message("無効なテンポの緩急です。0.5から2.0の間で設定してください。", ephemeral=True)

word_type_choices = [
    app_commands.Choice(name="固有名詞", value="PROPER_NOUN"),
    app_commands.Choice(name="地名", value="LOCATION_NAME"),
    app_commands.Choice(name="組織・施設名", value="ORGANIZATION_NAME"),
    app_commands.Choice(name="人名", value="PERSON_NAME"),
    app_commands.Choice(name="性", value="PERSON_FAMILY_NAME"),
    app_commands.Choice(name="名", value="PERSON_GIVEN_NAME"),
    app_commands.Choice(name="一般名詞", value="COMMON_NOUN"),
    app_commands.Choice(name="動詞", value="VERB"),
    app_commands.Choice(name="形容詞", value="ADJECTIVE"),
    app_commands.Choice(name="語尾", value="SUFFIX"),
]

# JSONファイルの読み込み
try:
    with open(DICTIONARY_FILE, "r", encoding="utf-8") as file:
        parsed_data = json.load(file)
except (FileNotFoundError, json.JSONDecodeError):
    parsed_data = {}

# すべてのGuildの単語を取得
word_set = set()  # 重複を防ぐためにsetを使用
for guild_id, words in parsed_data.items():
    word_set.update(words.keys())  # 各Guildの単語をセットに追加

# リストに変換
all_words = list(word_set)

print(all_words)

def fetch_all_uuids():
    try:
        response = requests.get("http://localhost:10101/user_dict")
        response.raise_for_status()  # エラーがあれば例外を発生させる
        uuid_dict = response.json()
        return uuid_dict
    except requests.exceptions.RequestException as e:
        print(f"Error fetching user dictionary: {e}")
        return {}

# UUID一覧を取得
uuid_dict = fetch_all_uuids()

# UUID一覧をリストに変換
uuid_list = list(uuid_dict.keys())

if uuid_list:
    print("取得したUUID一覧:")
    for uuid in uuid_list:
        print(f"{uuid}: {uuid_dict[uuid]['surface']}") # 取得したUUIDを出力

    # UUID一覧をuuid.jsonに保存
    with open("uuid.json", "w", encoding="utf-8") as file:
        json.dump(uuid_dict, file, ensure_ascii=False, indent=4)
else:
    print("UUID一覧が空です。")

def save_to_dictionary_file():
    with open(DICTIONARY_FILE, "w", encoding="utf-8") as file:
        json.dump(guild_dictionary, file, ensure_ascii=False, indent=4)

def update_guild_dictionary(guild_id, word, details):
    guild_id_str = str(guild_id)  # guild_idを文字列に変換
    if guild_id_str not in guild_dictionary:
        guild_dictionary[guild_id_str] = {}
    guild_dictionary[guild_id_str][word] = details
    save_to_dictionary_file()

@tree.command(
    name="add_word", description="辞書に単語を登録します。"
)
@app_commands.describe(
    word="登録する単語を入力してください。",
    pronunciation="単語の発音をカタカナで入力してください。",
    accent_type="アクセントの種類を入力してください。",
    word_type="単語の品詞を選択してください。"
)
@app_commands.choices(word_type=word_type_choices)
async def add_word_command(interaction: discord.Interaction, word: str, pronunciation: str, accent_type: int, word_type: str):
    guild_id = interaction.guild.id
    add_url = f"http://localhost:10101/user_dict_word?surface={word}&pronunciation={pronunciation}&accent_type={accent_type}&word_type={word_type}"

    response = requests.post(add_url)
    print("API response status:", response.status_code)

    if response.status_code == 200:
        details = {
            "pronunciation": pronunciation,
            "accent_type": accent_type,
            "word_type": word_type,
        }
        update_guild_dictionary(guild_id, word, details)
        await interaction.response.send_message(f"単語 '{word}' の発音を '{pronunciation}', アクセント '{accent_type}', 品詞 '{word_type}' に登録しました。")
    else:
        await interaction.response.send_message(f"単語 '{word}' の登録に失敗しました。", ephemeral=True)

@tree.command(
    name="edit_word", description="辞書の単語を編集します。"
)
@app_commands.describe(
    word="登録する単語を入力してください。",
    new_pronunciation="単語の発音をカタカナで入力してください。",
    accent_type="アクセントの種類を入力してください。",
    word_type="単語の品詞を選択してください。"
)
@app_commands.choices(word_type=word_type_choices)
async def edit_word_command(interaction: discord.Interaction, word: str, new_pronunciation: str, accent_type: int, word_type: str):
    if re.search(r'[a-zA-Z0-9!-/:-@[-`{-~]', word):
        await interaction.response.send_message("単語に半角英数字や半角記号を含めることはできません。", ephemeral=True)
        return

    guild_id = interaction.guild.id
    uuid_dict = fetch_all_uuids()  # UUID一覧を取得
    uuid = next((key for key, value in uuid_dict.items() if value["surface"] == word), None)
    edit_url = f"http://localhost:10101/user_dict_word/{uuid}?surface={word}&pronunciation={new_pronunciation}&accent_type={accent_type}&word_type={word_type}"
    if word in all_words:
        print(f"Word UUID: {uuid}")
        if uuid:
            response = requests.put(edit_url)
            print(response.status_code)
            if response.status_code == 204:
                details = {
                    "pronunciation": new_pronunciation,
                    "accent_type": accent_type,
                    "word_type": word_type,
                    "uuid": uuid
                }
                update_guild_dictionary(guild_id, word, details)
                await interaction.response.send_message(f"単語 '{word}' の発音を '{new_pronunciation}', アクセント '{accent_type}', 品詞 '{word_type}' に編集しました。")
            else:
                await interaction.response.send_message(f"単語 '{word}' の編集に失敗しました。", ephemeral=True)
        else:
            await interaction.response.send_message(f"単語 '{word}' のUUIDが見つかりませんでした。", ephemeral=True)

@tree.command(
    name="remove_word", description="辞書から単語を削除します。"
)
@app_commands.describe(
    word="削除する単語を入力してください。"
)
async def remove_word_command(interaction: discord.Interaction, word: str):
    if re.search(r'[a-zA-Z0-9!-/:-@[-`{-~]', word):
        await interaction.response.send_message("単語に半角英数字や半角記号を含めることはできません。", ephemeral=True)
        return

    guild_id = interaction.guild.id
    uuid_dict = fetch_all_uuids()  # UUID一覧を取得
    uuid = next((key for key, value in uuid_dict.items() if value["surface"] == word), None)
    remove_url = f"http://localhost:10101/user_dict_word/{uuid}"
    if word in all_words:
        print(f"Word UUID: {uuid}")
        if uuid:
            response = requests.delete(remove_url)
            print(response.status_code)
            if response.status_code == 204:
                guild_id_str = str(guild_id)  # guild_idを文字列に変換
                if guild_id_str in guild_dictionary and word in guild_dictionary[guild_id_str]:
                    del guild_dictionary[guild_id_str][word]
                    save_to_dictionary_file()
                await interaction.response.send_message(f"単語 '{word}' を辞書から削除しました。")
            else:
                await interaction.response.send_message(f"単語 '{word}' の削除に失敗しました。", ephemeral=True)
        else:
            await interaction.response.send_message(f"単語 '{word}' のUUIDが見つかりませんでした。", ephemeral=True)

class DictionaryView(View):
    def __init__(self, words, page=0, per_page=10):
        super().__init__(timeout=None)
        self.words = words
        self.page = page
        self.per_page = per_page
        self.update_button_state()  # ボタンの状態を更新

    def update_button_state(self):
        # すでにデコレーターで定義されたボタンに対して disabled を設定する
        for item in self.children:
            if item.custom_id == "previous":
                item.disabled = self.page <= 0
            elif item.custom_id == "next":
                item.disabled = (self.page + 1) * self.per_page >= len(self.words)
    
    @discord.ui.button(label="Previous", style=discord.ButtonStyle.primary, custom_id="previous")
    async def previous_page(self, interaction: discord.Interaction):
        if self.page > 0:
            self.page -= 1
            self.update_button_state()
            await interaction.response.edit_message(embed=self.create_embed(), view=self)
    
    @discord.ui.button(label="Next", style=discord.ButtonStyle.primary, custom_id="next")
    async def next_page(self, interaction: discord.Interaction):
        if (self.page + 1) * self.per_page < len(self.words):
            self.page += 1
            self.update_button_state()
            await interaction.response.edit_message(embed=self.create_embed(), view=self)

    def create_embed(self):
        start = self.page * self.per_page
        end = start + self.per_page
        embed = discord.Embed(title="辞書の単語一覧")
        for word, details in self.words[start:end]:
            embed.add_field(name=word, value=f"発音: {details['pronunciation']}, アクセント: {details['accent_type']}, 品詞: {details['word_type']}", inline=False)
        embed.set_footer(text=f"Page {self.page + 1}/{(len(self.words) - 1) // self.per_page + 1}")
        return embed

@tree.command(
    name="list_words", description="辞書の単語一覧を表示します。"
)
async def list_words_command(interaction: discord.Interaction):
    if interaction.guild is None:
        await interaction.response.send_message("このコマンドはサーバー内でのみ使用できます。", ephemeral=True)
        return
    guild_id = str(interaction.guild.id)

    # 都度 dictionary.json を取得
    try:
        with open(DICTIONARY_FILE, "r", encoding="utf-8") as file:
            guild_dictionary = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        guild_dictionary = {}

    words = guild_dictionary.get(guild_id, {})
    print(f"Guild ID: {guild_id}")  # デバッグ用にギルドIDを出力
    print(f"Words: {words}")  # デバッグ用に単語一覧を出力
    if not words:
        await interaction.response.send_message("辞書に単語が登録されていません。", ephemeral=True)
        return

    view = DictionaryView(list(words.items()))  # 辞書のアイテムをリストに変換
    await interaction.response.send_message(embed=view.create_embed(), view=view)

class HelpView(View):
    def __init__(self):
        super().__init__(timeout=None)
        self.current_page = 0
        self.embeds = self.create_embeds()
        self.update_button_state()

    def create_embeds(self):
        pages = [
            {
                "title": "基本コマンド",
                "commands": [
                    {"name": "/join", "description": "ボイスチャンネルに接続し、指定したテキストチャンネルのメッセージを読み上げます。"},
                    {"name": "/leave", "description": "ボイスチャンネルから切断します。"},
                    {"name": "/ping", "description": "BOTの応答時間をテストします。"},
                ]
            },
            {
                "title": "自動入室コマンド",
                "commands": [
                    {"name": "/register_auto_join", "description": "BOTの自動入室機能を登録します。"},
                    {"name": "/unregister_auto_join", "description": "自動接続の設定を解除します。"},
                ]
            },
            {
                "title": "設定コマンド",
                "commands": [
                    {"name": "/set_speaker", "description": "話者を選択メニューから切り替えます。"},
                    {"name": "/set_volume", "description": "音量を設定します。"},
                    {"name": "/set_pitch", "description": "音高を設定します。"},
                    {"name": "/set_speed", "description": "話速を設定します。"},
                    {"name": "/set_style_strength", "description": "スタイルの強さを設定します。"},
                    {"name": "/set_tempo", "description": "テンポの緩急を設定します。"},
                ]
            },
            {
                "title": "辞書コマンド",
                "commands": [
                    {"name": "/add_word", "description": "辞書に単語を登録します。"},
                    {"name": "/edit_word", "description": "辞書の単語を編集します。"},
                    {"name": "/remove_word", "description": "辞書から単語を削除します。"},
                    {"name": "/list_words", "description": "辞書の単語一覧を表示します。"},
                ]
            }
        ]

        embeds = []
        for page in pages:
            embed = discord.Embed(title=page["title"], color=discord.Color.blue())
            for command in page["commands"]:
                embed.add_field(name=command["name"], value=command["description"], inline=False)
            embeds.append(embed)
        return embeds

    def update_button_state(self):
        self.children[0].disabled = self.current_page == 0
        self.children[1].disabled = self.current_page == len(self.embeds) - 1

    @discord.ui.button(label="Previous", style=discord.ButtonStyle.primary)
    async def previous_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page -= 1
        self.update_button_state()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)

    @discord.ui.button(label="Next", style=discord.ButtonStyle.primary)
    async def next_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page += 1
        self.update_button_state()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)

@tree.command(
    name="help", description="利用可能なコマンドのリストを表示します。"
)
async def help_command(interaction: discord.Interaction):
    view = HelpView()
    await interaction.response.send_message(embed=view.embeds[0], view=view)

client.run(TOKEN)