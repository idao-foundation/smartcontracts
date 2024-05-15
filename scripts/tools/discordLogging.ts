import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.DISCORD_KEY;
let loggingChannelId = process.env.SEPOLIA_DISCORD_CHANNEL_ID as string;

if (process.env.network == "polygon") {
    loggingChannelId = process.env.POLYGON_DISCORD_CHANNEL_ID as string
    console.log("Using Polygon setup");
}

if (process.env.network == "sepolia") {
    console.log("Using Sepolia defaults");
}

const client = new Client({
    intents: [

    ]
});

client.login(token);

client.on("ready", async () => {
    // const channel = client.channels.cache.get(loggingChannelId) as TextChannel;
    const channel = await client.channels.fetch(loggingChannelId) as TextChannel;
    await channel.send("Bot is ready");
});

export async function logToDiscord(message: string) {
    try {
        const channel = await client.channels.fetch(loggingChannelId) as TextChannel;
        await channel.send(message.substring(0, 1999));
    } catch (e) {
        console.log(e);
    }
}