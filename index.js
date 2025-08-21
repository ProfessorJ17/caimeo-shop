const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// CORS configuration
app.use(cors({
    origin: [
        'https://caimeo.shop',
        'https://caimeo.moddarkrevolt.repl.co',
        'http://localhost:3000',
        'https://ProfessorJ17.github.io'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set in .env or Secrets');
    process.exit(1);
}

const openaiHeaders = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
};

// Chat endpoint (OpenAI chat completion)
app.post('/api/chat', async (req, res) => {
    const { model, messages, max_tokens, temperature, top_p } = req.body;

    if (!model || !messages) {
        return res.status(400).json({ error: { message: 'Model and messages are required' } });
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            { model, messages, max_tokens, temperature, top_p },
            { headers: openaiHeaders }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Chat API error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: { message: error.response?.data?.error?.message || error.message }
        });
    }
});

// Image generation endpoint (OpenAI DALL·E)
app.post('/api/image', async (req, res) => {
    const { model, prompt, n, size, quality, response_format } = req.body;

    if (!model || !prompt) {
        return res.status(400).json({ error: { message: 'Model and prompt are required' } });
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/images/generations',
            { model, prompt, n, size, quality, response_format },
            { headers: openaiHeaders }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Image API error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: { message: error.response?.data?.error?.message || error.message }
        });
    }
});

// Text-to-speech endpoint (OpenAI TTS)
app.post('/api/tts', async (req, res) => {
    const { model, input, voice, response_format } = req.body;

    if (!model || !input) {
        return res.status(400).json({ error: { message: 'Model and input are required' } });
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/audio/speech',
            { model, input, voice, response_format },
            { headers: openaiHeaders, responseType: 'arraybuffer' }
        );
        res.set('Content-Type', 'audio/mpeg');
        res.send(response.data);
    } catch (error) {
        console.error('TTS API error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: { message: error.response?.data?.error?.message || error.message }
        });
    }
});

// Transcription endpoint (OpenAI Whisper)
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
    const { model } = req.body;
    const file = req.file;

    if (!model || !file) {
        return res.status(400).json({ error: { message: 'Model and file are required' } });
    }

    try {
        const formData = new FormData();
        formData.append('file', file.buffer, { filename: 'audio.webm' });
        formData.append('model', model);

        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            { headers: { ...openaiHeaders, 'Content-Type': 'multipart/form-data' } }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Transcribe API error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: { message: error.response?.data?.error?.message || error.message }
        });
    }
});

// Error-handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: {
            message: err.message || 'Internal Server Error',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
