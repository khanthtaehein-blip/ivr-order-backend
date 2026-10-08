require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


// ================================
// HOME
// ================================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'IVR Order Backend',
  });
});


// ================================
// HEALTH CHECK
// ================================
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'IVR Order Backend',
    telegram: process.env.TELEGRAM_BOT_TOKEN
      ? 'configured'
      : 'missing',
  });
});


// ================================
// TELEGRAM TEST
// ================================
app.post('/api/test', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🟢 IVR ORDER BACKEND\n\nAPI test successful!',
        }),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      return res.status(500).json({
        success: false,
        error: data.description,
      });
    }

    res.json({
      success: true,
      message: 'Telegram message sent successfully',
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// ================================
// NEW ORDER → TELEGRAM
// ================================
app.post('/api/orders/notify', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        success: false,
        error: 'Telegram configuration is missing',
      });
    }

    const {
      order_id,
      game,
      package: packageName,
      price,
      payment_method,
      player_id,
      zone_id,
      account,
      receipt_url,
    } = req.body;

    if (!order_id || !game || !packageName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required order information',
      });
    }

    const text = [
      '🛒 NEW IVR STORE ORDER',
      '',
      `🆔 Order ID: ${order_id}`,
      `🎮 Game: ${game}`,
      `📦 Package: ${packageName}`,
      `💰 Price: ${price} Ks`,
      `💳 Payment: ${payment_method}`,
      '',
      player_id ? `👤 Player ID: ${player_id}` : null,
      zone_id ? `🌐 Zone ID: ${zone_id}` : null,
      account ? `📧 Account: ${account}` : null,
      '',
      '📸 Payment Receipt:',
      receipt_url || 'No receipt URL',
      '',
      '⏳ Status: PENDING',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
        }),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram API Error:', data);

      return res.status(500).json({
        success: false,
        error: data.description,
      });
    }

    console.log(`Telegram order notification sent: ${order_id}`);

    res.json({
      success: true,
      message: 'Order notification sent to Telegram',
    });

  } catch (error) {
    console.error('Order notification error:', error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// ================================
// START SERVER
// ================================
app.listen(PORT, () => {
  console.log('================================');
  console.log('IVR ORDER BACKEND');
  console.log('================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log('================================');
});