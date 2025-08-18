const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const VENICE_AI_API_URL = 'https://api.venice.ai/api/v1/chat/completions';
const VENICE_AI_API_KEY = process.env.VENICE_API_KEY;

async function getAIResponse(message) {
    try {
        const response = await axios.post(VENICE_AI_API_URL, {
            model: 'venice-uncensored',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant'
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            venice_parameters: {
                enable_web_search: 'on',
                include_venice_system_prompt: true
            },
            frequency_penalty: 0,
            presence_penalty: 0,
            max_tokens: 1000,
            temperature: 0.7,
            top_p: 0.9,
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${VENICE_AI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling Venice AI API:', error.response?.data || error.message);
        return 'Sorry, I encountered an error while processing your message.';
    }
}

client.once('ready', () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user)) {
        const userMessage = message.content.replace(/<@!?\d+>/g, '').trim();
        
        if (!userMessage) {
            await message.reply('Hello! Mention me with a message and I\'ll respond using AI.');
            return;
        }

        try {
            message.channel.sendTyping();
            
            const aiResponse = await getAIResponse(userMessage);
            
            if (aiResponse.length > 2000) {
                const chunks = aiResponse.match(/.{1,2000}/g);
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            } else {
                await message.reply(aiResponse);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            await message.reply('Sorry, I encountered an error while processing your message.');
        }
    }
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN is not set in environment variables');
    process.exit(1);
}

if (!process.env.VENICE_API_KEY) {
    console.error('VENICE_API_KEY is not set in environment variables');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);