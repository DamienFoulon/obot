import 'dotenv/config';
import { spawn } from 'node:child_process';
import {
  AudioPlayerStatus, StreamType, VoiceConnectionStatus,
  createAudioPlayer, createAudioResource, entersState, generateDependencyReport, joinVoiceChannel,
} from '@discordjs/voice';
import { connectGateway } from '../gateway.js';
import { createAdapterCreator } from '../lib/music/voiceAdapter.js';

/**
 * Checks that the host can play music: joins a voice channel and plays a 10 s tone
 * Usage: node scripts/voice-probe.js <guildId> <voiceChannelId>
 * Stop the bot first: both would answer the server events
 */

const [guildId, channelId] = process.argv.slice(2);
if (!guildId || !channelId) {
  console.error('Usage: node scripts/voice-probe.js <guildId> <voiceChannelId>');
  process.exit(1);
}

console.log(generateDependencyReport());
await connectGateway();

const connection = joinVoiceChannel({ guildId, channelId, adapterCreator: createAdapterCreator(guildId), selfDeaf: true, debug: true });
connection.on('debug', (message) => console.log('[voice]', message));
await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
console.log('Connected to the voice channel ✅ (UDP and DAVE work)');

const ffmpeg = spawn('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
  '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1']);
const player = createAudioPlayer();
connection.subscribe(player);
player.play(createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw }));
await entersState(player, AudioPlayerStatus.Playing, 5_000);
console.log('Playing a 10 s tone 🔊');
await entersState(player, AudioPlayerStatus.Idle, 30_000);

connection.destroy();
console.log('Done 👋');
process.exit(0);
