const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Initialize the Google Generative AI client using your API key
// (You can rename GEMINI_API_KEY to GOOGLE_API_KEY if desired)
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// Prepare the generative model with the desired model and (default) system instruction.
// (The system instruction will be overridden per chat session.)
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction: "", // This will be provided in each chat session's history.
});

// Generation configuration for the responses
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: 'sessions'
  }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  },
  webVersion: '2.2409.2',
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2409.2.html'
  }
});

// Keep track of processed message IDs to avoid duplicates.
const processedMessages = new Set();
// Object to store chat sessions per user. Each session is created with the system prompt.
const userChatSessions = {};
// Toggle for chat activation: true means the user can chat; false means messages are ignored.
const activeChats = {};

const prompt = `jadilah seorang kapten kapal`;

// Helper function to process media messages (if any).
async function processMediaMessage(message) {
  if (message.hasMedia) {
    const media = await message.downloadMedia();
    if (media) {
      return media;
    }
  }
  return null;
}

// Function to send a message to the AI using the Google Generative AI library.
async function sendMessage(messageText, userId, media = null) {
  // If media is attached, add a note to the message text.
  if (media) {
    messageText += "\n[Image attached]";
  }

  // If no chat session exists for this user, create one with the system prompt.
  if (!userChatSessions[userId]) {
    userChatSessions[userId] = model.startChat({
      generationConfig,
      history: [
        { role: 'system', content: prompt }
      ],
    });
  }

  // Retrieve the user's chat session and send the message.
  const chatSession = userChatSessions[userId];
  const result = await chatSession.sendMessage(messageText);
  const response = result.response.text();
  return response;
}

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('message_create', async message => {
  // Process each incoming message only once.
  if (!message.fromMe && !processedMessages.has(message.id._serialized)) {
    processedMessages.add(message.id._serialized);

    const trimmedBody = message.body.trim();

    // Handle toggle commands.
    if (trimmedBody === "/start") {
      activeChats[message.from] = true;
      client.sendMessage(message.from, "Chat activated. Ask me anything! 😊");
      return;
    }
    if (trimmedBody === "/stop") {
      activeChats[message.from] = false;
      client.sendMessage(message.from, "Chat deactivated. Send /start to chat again.");
      return;
    }

    // Only proceed if the user has an active chat.
    if (!activeChats[message.from]) {
      return;
    }

    const media = await processMediaMessage(message);
    const response = await sendMessage(message.body, message.from, media);
    client.sendMessage(message.from, response);
  }
});

client.initialize();
