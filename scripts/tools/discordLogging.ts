import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.DISCORD_KEY;
const loggingChannelId = process.env.DISCORD_CHANNEL_ID as string;

const client = new Client({
    intents: [

    ]
});

client.login(token);

client.on("ready", async () => {
    // const channel = client.channels.cache.get(loggingChannelId) as TextChannel;
    const channel = await client.channels.fetch(loggingChannelId) as TextChannel;
    channel.send("Bot is ready");
});

export async function logToDiscord(message: string) {
    try {
        const channel = await client.channels.fetch(loggingChannelId) as TextChannel;
        await channel.send(message);
    } catch (e) {
        console.log(e);
    }
}