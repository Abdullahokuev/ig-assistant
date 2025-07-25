require('dotenv').config();                         // Подключаем .env
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Секрет для верификации Webhook — должен совпадать с тем, что в Facebook App
const VERIFY_TOKEN = 'ig_secret_token_123';

// 🔐 Переменные из .env / Render Dashboard
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_BUSINESS_ID = process.env.IG_BUSINESS_ID;

app.use(express.json());

// ————————————————
// 1) Проверка здоровья сервера
app.get('/', (req, res) => {
  res.send('🤖 Ассистент работает!');
});

// 2) Верификация Webhook (GET /webhook)
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 3) Прием Webhook-постов (POST /webhook)
app.post('/webhook', async (req, res) => {
  console.log('>>> GOT WEBHOOK POST:', JSON.stringify(req.body, null, 2));
  const body = req.body;

  // Убедимся, что это именно Instagram-событие
  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      // Instagram-шлюз кладет события в entry.messaging
      const messages = entry.messaging || [];
      for (const msgEvent of messages) {
        const senderId   = msgEvent.sender.id;
        const messageText = msgEvent.message?.text;
        if (!messageText) continue;

        console.log(`📩 Получено сообщение: ${messageText}`);

        // 4) Генерим ответ через OpenAI
        const aiReply = await getAIReply(messageText);
        console.log(`🤖 Ответ ИИ: ${aiReply}`);

        // 5) Отправляем обратно в Instagram
        try {
          const resp = await axios.post(
            `https://graph.facebook.com/v23.0/${IG_BUSINESS_ID}/messages`,
            {
              recipient: { id: senderId },
              messaging_type: 'RESPONSE',
              message: { text: aiReply }
            },
            {
              headers: {
                Authorization: `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('✅ Ответ отправлен в Instagram:', resp.data);
        } catch (err) {
          console.error('❌ Ошибка отправки в Instagram:', err.response?.data || err.message);
        }
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  // Если это не наш Webhook — 404
  res.sendStatus(404);
});

// 6) Функция общения с OpenAI
async function getAIReply(text) {
  try {
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: text }],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    return resp.data.choices[0].message.content;
  } catch (err) {
    console.error('❌ Ошибка OpenAI:', err.response?.data || err.message);
    return 'Извините, произошла ошибка.';
  }
}

// 7) Стартуем сервер
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
