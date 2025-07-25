require('dotenv').config(); // Подключаем .env

const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Секретный токен для верификации Webhook
const VERIFY_TOKEN = 'ig_secret_token_123';

// 🔐 Ключи из .env файла (имена должны совпадать с тем, что настроено в Render)
const OPENAI_API_KEY           = process.env.OPENAI_API_KEY;
const INSTAGRAM_ACCESS_TOKEN   = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_BUSINESS_ID           = process.env.IG_BUSINESS_ID;

app.use(express.json());

// Проверка сервера
app.get('/', (req, res) => {
  res.send('🤖 Ассистент работает!');
});

// Верификация Webhook от Instagram
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Обработка входящих сообщений
app.post('/webhook', async (req, res) => {
  console.log('>>> GOT WEBHOOK POST:', JSON.stringify(req.body, null, 2));
  const body = req.body;

  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      const changes = entry.changes;
      if (changes && changes.length > 0) {
        for (const change of changes) {
          const message    = change.value;
          const senderId   = message.from;
          const messageText = message.text?.body;

          if (messageText) {
            console.log(`📩 Получено сообщение: ${messageText}`);

            const aiReply = await getAIReply(messageText);
            console.log(`🤖 Ответ ИИ: ${aiReply}`);

            // Отправляем ответ обратно в Instagram через Graph API
            try {
              await axios.post(
                `https://graph.facebook.com/v19.0/${IG_BUSINESS_ID}/messages`,
                {
                  recipient: { id: senderId },
                  messaging_type: 'RESPONSE',
                  message: { text: aiReply },
                },
                {
                  headers: {
                    Authorization: `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
            } catch (err) {
              console.error('❌ Ошибка отправки в Instagram:', err.response?.data || err.message);
            }
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Функция-запрос к OpenAI
async function getAIReply(text) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: text }],
        temperature: 0.7,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('❌ Ошибка OpenAI:', error.response?.data || error.message);
    return 'Извините, произошла ошибка.';
  }
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
