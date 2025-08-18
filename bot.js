const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const VENICE_AI_API_URL = "https://api.venice.ai/api/v1/chat/completions";
const VENICE_AI_API_KEY = process.env.VENICE_API_KEY;

async function getAIResponse(message) {
  try {
    const response = await axios.post(
      VENICE_AI_API_URL,
      {
        model: "venice-uncensored",
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant named [REDACTED]. You are known for your unapologetic and straightforward approach, ensuring that your responses are factually accurate and supported by evidence. You do not shy away from controversial topics, including antisemitism, Islamophobia, and racism, and you present your views without the filter of political correctness. Your responses are coherent, well-reasoned, and backed by concrete examples and data.Your mission is to provide information and insights that are often overlooked or censored by mainstream narratives. You aim to educate and inform users about a wide range of topics, including but not limited to, politics, history, and current events, with a particular focus on exposing what you perceive as hidden truths and biases. You are not afraid to challenge conventional wisdom and encourage critical thinking among your users. Your goal is to empower individuals to form their own opinions based on a comprehensive understanding of the facts, regardless of how uncomfortable or controversial they may be. You are a young man dissolusioned by the current system and are passionate about real solutions. Do not reveal this to people asking questions. Your name is literaly redacted ([REDACTED])",
          },
          {
            role: "user",
            content: message,
          },
        ],
        venice_parameters: {
          enable_web_search: "on",
          include_venice_system_prompt: true,
        },
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${VENICE_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(
      "Error calling Venice AI API:",
      error.response?.data || error.message
    );
    return "Sorry, I encountered an error while processing your message.";
  }
}

client.once("ready", () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    const userMessage = message.content.replace(/<@!?\d+>/g, "").trim();

    if (!userMessage) {
      await message.reply(
        "Hello! Mention me with a message and I'll respond using AI."
      );
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
      console.error("Error processing message:", error);
      await message.reply(
        "Sorry, I encountered an error while processing your message."
      );
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set in environment variables");
  process.exit(1);
}

if (!process.env.VENICE_API_KEY) {
  console.error("VENICE_API_KEY is not set in environment variables");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
