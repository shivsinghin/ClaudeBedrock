require('dotenv').config();
const express = require('express');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));
const SERVER_START_TIME = Date.now();

// AWS Client setup
const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Configuration
const CONFIG = {
    MEMORY_LIMIT: 30,
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000,
    RATE_LIMIT_DELAY: 5000,
    SYSTEM_PROMPT: `You are Claude, an AI assistant that is helpful, honest, and direct. 
    Please format your responses using proper Markdown syntax following these guidelines:

    - Use # for main headings
    - Use ## for subheadings
    - Use bullet points (- or *) for lists
    - Use numbered lists (1. 2. 3.) for sequential items
    - Use **bold** for emphasis
    - Use \`code blocks\` for code or technical terms
    - Use > for quotations
    - Use --- for horizontal rules to separate sections
    - Use tables when presenting structured data
    - Use proper spacing between sections for better readability

    Always structure your responses with clear headings and organized sections when appropriate.`
};

class Chatbot {
    constructor() {
        this.conversationHistory = new Map(); // Store conversation history per session
        this.lastRequestTime = new Map(); // Store last request time per session
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForRateLimit(sessionId) {
        const now = Date.now();
        const lastTime = this.lastRequestTime.get(sessionId) || 0;
        const timeSinceLastRequest = now - lastTime;

        if (timeSinceLastRequest < CONFIG.RATE_LIMIT_DELAY) {
            await this.sleep(CONFIG.RATE_LIMIT_DELAY - timeSinceLastRequest);
        }
        this.lastRequestTime.set(sessionId, Date.now());
    }

    prepareMessages(userInput, sessionId) {
        const messages = [
            {
                role: "user",
                content: [
                    { 
                        type: "text", 
                        text: CONFIG.SYSTEM_PROMPT + "\n\nUser: " + userInput 
                    }
                ]
            }
        ];

        const history = this.conversationHistory.get(sessionId) || [];
        if (history.length > 0) {
            const historyText = history
                .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                .join('\n');
            messages[0].content[0].text = `${CONFIG.SYSTEM_PROMPT}\n\nPrevious conversation:\n${historyText}\n\nUser: ${userInput}`;
        }

        return messages;
    }

    addToHistory(sessionId, role, content) {
        if (!this.conversationHistory.has(sessionId)) {
            this.conversationHistory.set(sessionId, []);
        }
        const history = this.conversationHistory.get(sessionId);
        history.push({ role, content });

        if (history.length > CONFIG.MEMORY_LIMIT * 2) {
            this.conversationHistory.set(
                sessionId, 
                history.slice(-CONFIG.MEMORY_LIMIT * 2)
            );
        }
    }

    async processFileAndQuery(file, query, sessionId) {
        const MAX_CHUNK_SIZE = 24000; // Approximate token limit for Claude
        let fileContent = '';
        let fileType = file.originalname.split('.').pop().toLowerCase();

        // Function to chunk text content
        const chunkText = (text, maxLength) => {
            const chunks = [];
            let currentChunk = '';
            const sentences = text.split(/[.!?]+/);

            for (let sentence of sentences) {
                if ((currentChunk + sentence).length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = sentence;
                } else {
                    currentChunk += (currentChunk ? ' ' : '') + sentence;
                }
            }
            if (currentChunk) chunks.push(currentChunk);
            return chunks;
        };

        try {
            if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileType)) {
                // Handle image files
                const base64Size = file.buffer.toString('base64').length;
                if (base64Size > 1024 * 1024) { // 1MB limit for images
                    throw new Error('Image file is too large. Please use an image smaller than 1MB.');
                }
                fileContent = file.buffer.toString('base64');

                const messages = [{
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `${CONFIG.SYSTEM_PROMPT}\n\nAnalyze this image and answer the following question: ${query}`
                        },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: `image/${fileType}`,
                                data: fileContent
                            }
                        }
                    ]
                }];

                const params = {
                    modelId: process.env.CLAUDE_MODEL_ID,
                    contentType: "application/json",
                    accept: "application/json",
                    body: JSON.stringify({
                        anthropic_version: "bedrock-2023-05-31",
                        max_tokens: 8192,
                        temperature: 0.0,
                        top_k: 100,
                        messages: messages
                    })
                };

                const command = new InvokeModelCommand(params);
                const response = await client.send(command);
                return JSON.parse(new TextDecoder().decode(response.body)).content[0].text;

            } else {
                // Handle text files
                fileContent = file.buffer.toString('utf-8');
                const chunks = chunkText(fileContent, MAX_CHUNK_SIZE);

                if (chunks.length === 0) {
                    throw new Error('File content is empty.');
                }

                // If file is too large, summarize first
                if (chunks.length > 1) {
                    let summary = '';
                    for (let i = 0; i < chunks.length; i++) {
                        const summaryPrompt = `Summarize this part (${i + 1}/${chunks.length}) of the document: ${chunks[i]}`;
                        const messages = [{
                            role: "user",
                            content: [{ type: "text", text: summaryPrompt }]
                        }];

                        const params = {
                            modelId: process.env.CLAUDE_MODEL_ID,
                            contentType: "application/json",
                            accept: "application/json",
                            body: JSON.stringify({
                                anthropic_version: "bedrock-2023-05-31",
                                max_tokens: 8192,
                                temperature: 0.0,
                                top_k: 100,
                                messages: messages
                            })
                        };

                        const command = new InvokeModelCommand(params);
                        const response = await client.send(command);
                        const partSummary = JSON.parse(new TextDecoder().decode(response.body)).content[0].text;
                        summary += partSummary + '\n\n';
                    }

                    // Final query with the summarized content
                    const finalMessages = [{
                        role: "user",
                        content: [{
                            type: "text",
                            text: `${CONFIG.SYSTEM_PROMPT}\n\nContext (summarized from a larger document):\n${summary}\n\nQuestion: ${query}`
                        }]
                    }];

                    const finalParams = {
                        modelId: process.env.CLAUDE_MODEL_ID,
                        contentType: "application/json",
                        accept: "application/json",
                        body: JSON.stringify({
                            anthropic_version: "bedrock-2023-05-31",
                            max_tokens: 8192,
                            temperature: 0.0,
                            top_k: 100,
                            messages: finalMessages
                        })
                    };

                    const finalCommand = new InvokeModelCommand(finalParams);
                    const finalResponse = await client.send(finalCommand);
                    return JSON.parse(new TextDecoder().decode(finalResponse.body)).content[0].text;

                } else {
                    // For small files, process directly
                    const messages = [{
                        role: "user",
                        content: [{
                            type: "text",
                            text: `${CONFIG.SYSTEM_PROMPT}\n\nContext:\n${fileContent}\n\nQuestion: ${query}`
                        }]
                    }];

                    const params = {
                        modelId: process.env.CLAUDE_MODEL_ID,
                        contentType: "application/json",
                        accept: "application/json",
                        body: JSON.stringify({
                            anthropic_version: "bedrock-2023-05-31",
                            max_tokens: 8192,
                            temperature: 0.0,
                            top_k: 100,
                            messages: messages
                        })
                    };

                    const command = new InvokeModelCommand(params);
                    const response = await client.send(command);
                    return JSON.parse(new TextDecoder().decode(response.body)).content[0].text;
                }
            }
        } catch (error) {
            console.error('Error processing file:', error);
            throw new Error(error.message || 'Error processing file');
        }
    }

    async askClaudeWithRetry(userInput, sessionId, retryCount = 0) {
        try {
            await this.waitForRateLimit(sessionId);

            const params = {
                modelId: process.env.CLAUDE_MODEL_ID,
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify({
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens: 8192,
                    temperature: 0.0,
                    top_k: 100,
                    messages: this.prepareMessages(userInput, sessionId)
                })
            };

            const command = new InvokeModelCommand(params);
            const response = await client.send(command);
            const responseData = JSON.parse(new TextDecoder().decode(response.body));
            return responseData.content[0].text;

        } catch (error) {
            if (retryCount < CONFIG.MAX_RETRIES) {
                console.log(`\nRetrying... (Attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
                await this.sleep(CONFIG.RETRY_DELAY * Math.pow(2, retryCount));
                return this.askClaudeWithRetry(userInput, sessionId, retryCount + 1);
            }

            if (error.name === 'ThrottlingException') {
                throw new Error('RATE_LIMIT_EXCEEDED');
            } else if (error.name === 'ValidationException') {
                throw new Error('INVALID_REQUEST');
            } else if (error.name === 'ServiceQuotaExceededException') {
                throw new Error('QUOTA_EXCEEDED');
            }

            console.error("Error details:", error);
            throw new Error('GENERAL_ERROR');
        }
    }

    clearHistory(sessionId) {
        this.conversationHistory.delete(sessionId);
        this.lastRequestTime.delete(sessionId);
    }
}

const chatbot = new Chatbot();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a new endpoint to check server start time
app.get('/api/server-status', (req, res) => {
    res.json({ startTime: SERVER_START_TIME });
});

// Add new route for file upload
app.post('/api/upload-and-query', upload.single('file'), async (req, res) => {
    try {
        if (!req.file || !req.body.query || !req.body.sessionId) {
            return res.status(400).json({ error: 'File, query and sessionId are required' });
        }

        // Add file size limit check
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (req.file.size > MAX_FILE_SIZE) {
            return res.status(400).json({ error: 'File size exceeds 10MB limit' });
        }

        const response = await chatbot.processFileAndQuery(
            req.file,
            req.body.query,
            req.body.sessionId
        );

        chatbot.addToHistory(req.body.sessionId, 'user', `[File: ${req.file.originalname}] ${req.body.query}`);
        chatbot.addToHistory(req.body.sessionId, 'assistant', response);

        res.json({ response });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ 
            error: error.message || 'Error processing file and query'
        });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Message and sessionId are required' });
        }

        const response = await chatbot.askClaudeWithRetry(message, sessionId);
        chatbot.addToHistory(sessionId, 'user', message);
        chatbot.addToHistory(sessionId, 'assistant', response);

        res.json({ response });
    } catch (error) {
        const errorMessages = {
            'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment.',
            'INVALID_REQUEST': 'Invalid request format.',
            'QUOTA_EXCEEDED': 'Service quota exceeded.',
            'GENERAL_ERROR': 'An error occurred. Please try again.'
        };

        res.status(500).json({ 
            error: errorMessages[error.message] || 'An unexpected error occurred.' 
        });
    }
});

app.post('/api/clear', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: 'SessionId is required' });
    }

    chatbot.clearHistory(sessionId);
    res.json({ message: 'Conversation history cleared' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});