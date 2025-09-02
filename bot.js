const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const VENICE_AI_API_URL = "https://api.venice.ai/api/v1/chat/completions";
const VENICE_AI_IMAGE_API_URL = "https://api.venice.ai/api/v1/image/generate";
const VENICE_AI_API_KEY = process.env.VENICE_API_KEY;
const VENICE_IMAGE_MODEL = process.env.VENICE_IMAGE_MODEL || "venice-sd35";

// Store conversation history per bot per channel
const conversationHistories = {
  bot1: new Map(),
  bot2: new Map(),
};

function getChannelHistory(botId, channelId) {
  const conversationHistory = conversationHistories[botId];
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  return conversationHistory.get(channelId);
}

function addToHistory(botId, channelId, role, content) {
  const history = getChannelHistory(botId, channelId);
  history.push({ role, content });

  // Keep only last 20 messages (10 exchanges) to manage context length
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }
}

function processCitations(content, citations) {
  console.log("🔍 PROCESS CITATIONS DEBUG:");
  console.log("Content:", content);
  console.log("Citations array length:", citations.length);

  let processedContent = content;
  let citationsList = "";

  // Extract and replace citation references with numbers
  const citationMap = new Map();
  let displayIndex = 1;

  // Find all [REF]numbers[/REF] patterns (handles comma-separated numbers)
  const refPattern = /\[REF\]([0-9,\s]+)\[\/REF\]/g;
  let match;

  console.log("Looking for REF patterns...");
  while ((match = refPattern.exec(content)) !== null) {
    console.log("Found REF pattern:", match[0], "with numbers:", match[1]);
    const refNumbers = match[1].split(",").map((n) => parseInt(n.trim()));
    console.log("Parsed numbers:", refNumbers);

    // Map each reference number to a display number
    for (const refNum of refNumbers) {
      if (
        refNum >= 0 &&
        refNum < citations.length &&
        !citationMap.has(refNum)
      ) {
        citationMap.set(refNum, displayIndex);
        console.log(
          `Mapped citation ${refNum} to display number ${displayIndex}`
        );
        displayIndex++;
      }
    }
  }

  console.log("Citation map:", citationMap);

  // Replace [REF]numbers[/REF] with formatted citation numbers
  processedContent = processedContent.replace(refPattern, (match, refNums) => {
    const refNumbers = refNums.split(",").map((n) => parseInt(n.trim()));
    const displayNums = refNumbers
      .filter((refNum) => citationMap.has(refNum))
      .map((refNum) => citationMap.get(refNum));

    if (displayNums.length === 0) return match;
    if (displayNums.length === 1) return `[${displayNums[0]}]`;
    return `[${displayNums.join(",")}]`;
  });

  // Build citations list
  if (citationMap.size > 0) {
    citationsList = "\n\n**Sources:**\n";

    // Sort citations by display number
    const sortedCitations = Array.from(citationMap.entries()).sort(
      (a, b) => a[1] - b[1]
    );

    for (const [citationIndex, displayNum] of sortedCitations) {
      const citation = citations[citationIndex];
      if (citation) {
        try {
          const domain = new URL(citation.url).hostname.replace("www.", "");
          citationsList += `[${displayNum}] **${citation.title}** - ${domain}\n${citation.url}\n\n`;
        } catch (error) {
          // Fallback if URL parsing fails
          citationsList += `[${displayNum}] **${citation.title}**\n${citation.url}\n\n`;
        }
      }
    }
  }

  return processedContent + citationsList;
}

function splitMessage(message) {
  const chunks = [];

  // Check if message contains sources
  const sourcesIndex = message.indexOf("\n\n**Sources:**\n");

  if (sourcesIndex === -1) {
    // No sources, use simple splitting
    return splitTextByLength(message, 2000);
  }

  const mainContent = message.substring(0, sourcesIndex);
  const sourcesContent = message.substring(sourcesIndex);

  // If main content fits in one message, keep it together
  if (mainContent.length <= 2000) {
    chunks.push(mainContent);

    // Split sources section
    const sourceChunks = splitTextByLength(sourcesContent, 2000);
    chunks.push(...sourceChunks);
  } else {
    // Split main content
    const mainChunks = splitTextByLength(mainContent, 2000);
    chunks.push(...mainChunks);

    // Split sources section
    const sourceChunks = splitTextByLength(sourcesContent, 2000);
    chunks.push(...sourceChunks);
  }

  return chunks;
}

function splitTextByLength(text, maxLength) {
  const chunks = [];
  let currentChunk = "";

  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // Single sentence is too long, split by characters
        for (let i = 0; i < sentence.length; i += maxLength) {
          chunks.push(sentence.substring(i, i + maxLength));
        }
        currentChunk = "";
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function generateImage(prompt) {
  try {
    console.log(`🎨 Using model: ${VENICE_IMAGE_MODEL}`);
    const response = await axios.post(
      VENICE_AI_IMAGE_API_URL,
      {
        model: VENICE_IMAGE_MODEL,
        prompt: prompt,
        style_preset: "3D Model",
        height: 1024,
        width: 1024,
        steps: 30,
        cfg_scale: 7.5,
        seed: Math.floor(Math.random() * 1000000000),
        lora_strength: 50,
        safe_mode: false,
        return_binary: false,
        hide_watermark: false,
      },
      {
        headers: {
          Authorization: `Bearer ${VENICE_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Advanced debugging - log full API response
    console.log("🔍 IMAGE API FULL RESPONSE DEBUG:");
    console.log("Status:", response.status);
    console.log("Headers:", JSON.stringify(response.headers, null, 2));
    console.log("Full Response Data:", JSON.stringify(response.data, null, 2));

    // Handle base64 image data from Venice.ai (check both possible locations)
    let base64Data = null;
    if (response.data.images && response.data.images.length > 0) {
      base64Data = response.data.images[0];
    } else if (response.data.data && response.data.data.length > 0) {
      base64Data = response.data.data[0];
    }

    if (base64Data) {
      console.log(`✅ SUCCESS with model: ${VENICE_IMAGE_MODEL}`);
      // Return the raw base64 data, we'll handle conversion in the message handler
      return { type: "base64", data: base64Data };
    }

    // Fallback: Try other possible response formats
    const imageUrl =
      response.data.url || response.data.image_url || response.data.result?.url;
    if (imageUrl) {
      console.log(`✅ SUCCESS with model: ${VENICE_IMAGE_MODEL}`);
      return { type: "url", data: imageUrl };
    }

    throw new Error("No image data found in response");
  } catch (error) {
    console.error("🔍 IMAGE API ERROR DEBUG:");
    console.error("Error Status:", error.response?.status);
    console.error(
      "Error Headers:",
      JSON.stringify(error.response?.headers, null, 2)
    );
    console.error(
      "Error Response Data:",
      JSON.stringify(error.response?.data, null, 2)
    );
    console.error("Full Error Object:", error);
    console.error(
      `❌ Image generation failed with model ${VENICE_IMAGE_MODEL}:`,
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to generate image: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

async function getAIResponse(
  message,
  channelId,
  botId,
  systemPrompt,
  referencedMessage = null
) {
  try {
    const history = getChannelHistory(botId, channelId);

    // Build user message with context if available
    let userMessage = message;
    if (referencedMessage) {
      userMessage = `Context (message being replied to): "${referencedMessage.content}"\n\nUser request: ${message}`;
    }

    // Build messages array with conversation history
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...history,
      {
        role: "user",
        content: userMessage,
      },
    ];

    const response = await axios.post(
      VENICE_AI_API_URL,
      {
        model: "venice-uncensored",
        messages: messages,
        venice_parameters: {
          enable_web_search: "on",
          enable_web_citations: true,
          include_venice_system_prompt: false,
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

    // Advanced debugging - log full API response
    console.log("🔍 CHAT API FULL RESPONSE DEBUG:");
    console.log("Status:", response.status);
    console.log("Headers:", JSON.stringify(response.headers, null, 2));
    console.log("Full Response Data:", JSON.stringify(response.data, null, 2));

    let aiResponse = response.data.choices[0].message.content;

    // Debug citation processing
    console.log("🔍 CITATION DEBUG:");
    console.log("Original response:", aiResponse);
    console.log("Venice parameters:", response.data.venice_parameters);

    // Process citations if available
    const citations = response.data.venice_parameters?.web_search_citations;
    console.log("Citations found:", citations ? citations.length : 0);

    if (citations && citations.length > 0) {
      console.log("Processing citations...");
      const processedResponse = processCitations(aiResponse, citations);
      console.log("Processed response length:", processedResponse.length);
      console.log(
        "Processed response preview:",
        processedResponse.substring(0, 500) + "..."
      );
      aiResponse = processedResponse;
    } else {
      console.log("No citations to process");
    }

    // Add both user message and AI response to history
    addToHistory(botId, channelId, "user", userMessage);
    addToHistory(botId, channelId, "assistant", aiResponse);

    return aiResponse;
  } catch (error) {
    console.error("🔍 CHAT API ERROR DEBUG:");
    console.error("Error Status:", error.response?.status);
    console.error(
      "Error Headers:",
      JSON.stringify(error.response?.headers, null, 2)
    );
    console.error(
      "Error Response Data:",
      JSON.stringify(error.response?.data, null, 2)
    );
    console.error("Full Error Object:", error);
    console.error(
      "Error calling Venice AI API:",
      error.response?.data || error.message
    );
    return "Sorry, I encountered an error while processing your message.";
  }
}

// Create bot setup function
function createBot(token, botId, config) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", () => {
    console.log(`${config.name} is ready! Logged in as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Handle |imagine command only for bot1
    if (config.hasImageGen && message.content.startsWith("|imagine ")) {
      const prompt = message.content.slice(9).trim();

      if (!prompt) {
        await message.reply(
          "Please provide a prompt for image generation. Usage: `|imagine [your prompt]`"
        );
        return;
      }

      try {
        message.channel.sendTyping();
        await message.reply("🎨 Generating your image, please wait...");

        const imageResult = await generateImage(prompt);

        if (imageResult) {
          let attachment;
          let filename = "generated-image";

          if (imageResult.type === "base64") {
            const buffer = Buffer.from(imageResult.data, "base64");
            attachment = buffer;
            filename = "generated-image.webp";
          } else if (imageResult.type === "url") {
            attachment = imageResult.data;
            filename = "generated-image.png";
          }

          await message.channel.send({
            content: `✨ Here's your generated image for: "${prompt}"`,
            files: [{ attachment: attachment, name: filename }],
          });
        } else {
          await message.channel.send(
            "❌ Sorry, I couldn't generate an image. The API didn't return a valid image."
          );
        }
      } catch (error) {
        console.error("Error generating image:", error);
        await message.channel.send(
          "❌ Sorry, I encountered an error while generating your image. Please try again later."
        );
      }
      return;
    }

    if (message.mentions.has(client.user)) {
      const userMessage = message.content.replace(/<@!?\d+>/g, "").trim();

      if (!userMessage) {
        await message.reply(
          config.hasImageGen
            ? "Hello! Mention me with a message and I'll respond using AI. You can also use `|imagine [prompt]` to generate images."
            : "Hello! Mention me with a message and I'll respond using AI."
        );
        return;
      }

      try {
        message.channel.sendTyping();

        let referencedMessage = null;
        if (message.reference && message.reference.messageId) {
          try {
            referencedMessage = await message.channel.messages.fetch(
              message.reference.messageId
            );
          } catch (error) {
            console.log("Could not fetch referenced message:", error);
          }
        }

        const aiResponse = await getAIResponse(
          userMessage,
          message.channel.id,
          botId,
          config.systemPrompt,
          referencedMessage
        );

        if (aiResponse.length > 2000) {
          const chunks = splitMessage(aiResponse);
          await message.reply(chunks[0]);
          for (let i = 1; i < chunks.length; i++) {
            await message.channel.send(chunks[i]);
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
    console.error(`${config.name} Discord client error:`, error);
  });

  return client;
}

// Check required environment variables
if (!process.env.DISCORD_TOKEN_BOT1) {
  console.error("DISCORD_TOKEN_BOT1 is not set in environment variables");
  process.exit(1);
}

if (!process.env.DISCORD_TOKEN_BOT2) {
  console.error("DISCORD_TOKEN_BOT2 is not set in environment variables");
  process.exit(1);
}

if (!process.env.VENICE_API_KEY) {
  console.error("VENICE_API_KEY is not set in environment variables");
  process.exit(1);
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Bot configurations
const bot1Config = {
  name: "Bot 1 (with image generation)",
  hasImageGen: true,
  systemPrompt: process.env.BOT1_SYSTEM_PROMPT || "",
};

const bot2Config = {
  name: "Bot 2 (without image generation)",
  hasImageGen: false,
  systemPrompt: process.env.BOT2_SYSTEM_PROMPT || "",
};

// Create and start both bots
const bot1 = createBot(process.env.DISCORD_TOKEN_BOT1, "bot1", bot1Config);
const bot2 = createBot(process.env.DISCORD_TOKEN_BOT2, "bot2", bot2Config);

bot1.login(process.env.DISCORD_TOKEN_BOT1);
bot2.login(process.env.DISCORD_TOKEN_BOT2);
