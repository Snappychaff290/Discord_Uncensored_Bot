# Discord AI Bot with Uncensored.ai

A Discord bot that responds to mentions using the uncensored.ai API endpoint.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Fill in your credentials in `.env`:
   - `DISCORD_TOKEN`: Your Discord bot token from Discord Developer Portal
   - `UNCENSORED_AI_API_KEY`: Your API key for uncensored.ai

## Running the Bot

```bash
npm start
```

## Usage

Mention the bot in any Discord channel where it has access, and it will respond using AI:

```
@YourBot Hello, how are you?
```

The bot will respond with an AI-generated message using the uncensored.ai API.

## Features

- Responds only when mentioned
- Uses uncensored.ai API for AI responses
- Handles long messages by splitting into multiple replies
- Error handling and logging
- Typing indicator while processing