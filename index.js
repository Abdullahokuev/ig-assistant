require('dotenv').config(); // Подключаем .env

const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Секретный токен для верификации Webhook
const VERIFY_TOKEN = 'ig_secret_token_123';

// 🔐 Ключи из .env (имена в Render должны быть точно такими)
const OPENAI_API_KEY         = process.env.OPENAI_API_KEY;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_BUSINESS_ID         = process.env.IG_BUSINESS_ID;

app.use(express.json());

// 1) Проверка сервера
app.get('/', (req, res) => {
  res.send('🤖 Ассистент работает!');
});

// 2) Верификация Webhook при подключении
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

// 3) Обработка входящих Webhook POST
app.post('/webhook', async (req, res) => {
  console.log('>>> GOT WEBHOOK POST:', JSON.stringify(req.body, null, 2));
  const body = req.body;

  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      const changes = entry.changes;
      if (!changes || changes.length === 0) continue;

      for (const change of changes) {
        const message     = change.value;
        const senderId    = message.from;
        const messageText = message.text?.body;

        if (!messageText) continue;
        console.log(`📩 Получено сообщение от ${senderId}: ${messageText}`);

        // 4) Запрос в OpenAI
        const aiReply = await getAIReply(messageText);
        console.log(`🤖 Ответ ИИ: ${aiReply}`);

        // 5) Отправка ответа в Instagram
        console.log('🔜 Отправляю в Instagram:', {
          url: `https://graph.facebook.com/v19.0/${IG_BUSINESS_ID}/messages`,
          body: {
            recipient: { id: senderId },
            messaging_type: 'RESPONSE',
            message: { text: aiReply }
          }
        });

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
          console.log('✅ Успешно отправили ответ в Instagram');
        } catch (err) {
          console.error('❌ Ошибка отправки в Instagram:', err.response?.data || err.message);
        }
      }
    }

    // Подтверждаем получение Webhook
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Функция для запроса к OpenAI
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
