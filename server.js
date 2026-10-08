require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      )
    : null;

app.use(cors());
app.use(express.json());


// ======================================================
// HELPERS
// ======================================================

async function telegram(method, body = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      data.description || 'Telegram API request failed'
    );
  }

  return data.result;
}


function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


function buildOrderMessage({
  order_id,
  game,
  packageName,
  price,
  payment_method,
  player_id,
  zone_id,
  account,
  receipt_url,
  status = 'PENDING',
}) {
  const gameName = String(game || '').toUpperCase();

  let message = '';

  message += `<b>╭━━━━━━━━━━━━━━━━━━━━╮</b>\n`;
  message += `<b>        🛒 IVR STORE</b>\n`;
  message += `<b>      NEW ORDER ALERT</b>\n`;
  message += `<b>╰━━━━━━━━━━━━━━━━━━━━╯</b>\n\n`;

  message += `<b>🆔 ORDER</b>\n`;
  message += `<code>${escapeHtml(order_id)}</code>\n\n`;

  message += `<b>🎮 PRODUCT</b>\n`;
  message += `${escapeHtml(gameName)} • <b>${escapeHtml(packageName)}</b>\n\n`;

  if (player_id || zone_id || account) {
    message += `<b>👤 PLAYER INFORMATION</b>\n`;

    if (player_id) {
      message += `Player ID  : <code>${escapeHtml(player_id)}</code>\n`;
    }

    if (zone_id) {
      message += `Zone ID    : <code>${escapeHtml(zone_id)}</code>\n`;
    }

    if (account) {
      message += `Account    : <code>${escapeHtml(account)}</code>\n`;
    }

    message += `\n`;
  }

  message += `<b>💳 PAYMENT</b>\n`;
  message += `Method     : <b>${escapeHtml(payment_method || '-')}</b>\n`;
  message += `Amount     : <b>${escapeHtml(price || '-')} Ks</b>\n\n`;

  message += `<b>🧾 PAYMENT RECEIPT</b>\n`;
  message += receipt_url
    ? `📸 Receipt attached below / use the button\n\n`
    : `⚠️ No receipt URL\n\n`;

  message += `<b>━━━━━━━━━━━━━━━━━━━━</b>\n`;

  if (status === 'APPROVED') {
    message += `<b>✅ STATUS : APPROVED</b>\n`;
  } else if (status === 'REJECTED') {
    message += `<b>❌ STATUS : REJECTED</b>\n`;
  } else {
    message += `<b>⏳ STATUS : PENDING</b>\n`;
  }

  message += `<b>━━━━━━━━━━━━━━━━━━━━</b>\n\n`;
  message += `<i>⚡ IVR STORE • ORDER SYSTEM</i>`;

  return message;
}


// ======================================================
// HOME
// ======================================================

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'IVR Order Backend',
  });
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'IVR Order Backend',
    telegram: TELEGRAM_BOT_TOKEN
      ? 'configured'
      : 'missing',
    supabase: supabase
      ? 'configured'
      : 'missing',
  });
});


// ======================================================
// TELEGRAM TEST
// ======================================================

app.post('/api/test', async (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({
        success: false,
        error: 'Telegram configuration is missing',
      });
    }

    await telegram('sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text:
        '🟢 IVR ORDER BACKEND\n\n' +
        'API test successful!',
    });

    res.json({
      success: true,
      message: 'Telegram message sent successfully',
    });

  } catch (error) {
    console.error('Telegram test error:', error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// ======================================================
// NEW ORDER → TELEGRAM
// ======================================================

app.post('/api/orders/notify', async (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
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

    const text = buildOrderMessage({
      order_id,
      game,
      packageName,
      price,
      payment_method,
      player_id,
      zone_id,
      account,
      receipt_url,
      status: 'PENDING',
    });

    const buttons = [];

    if (receipt_url) {
      buttons.push([
        {
          text: '📸 VIEW RECEIPT',
          url: receipt_url,
        },
      ]);
    }

    buttons.push([
      {
        text: '✅ APPROVE',
        callback_data: `approve:${order_id}`,
      },
      {
        text: '❌ REJECT',
        callback_data: `reject:${order_id}`,
      },
    ]);

    const result = await telegram('sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: buttons,
      },
    });

    console.log(
      `Telegram order notification sent: ${order_id}`
    );

    res.json({
      success: true,
      message: 'Order notification sent to Telegram',
      telegram_message_id: result.message_id,
    });

  } catch (error) {
    console.error(
      'Order notification error:',
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// ======================================================
// TELEGRAM WEBHOOK
// ======================================================

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const update = req.body;

    if (!update || !update.callback_query) {
      return res.json({
        success: true,
      });
    }

    const callback = update.callback_query;

    const callbackData = callback.data || '';

    const fromUser = callback.from;

    const message = callback.message;

    if (!message) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Invalid message.',
        show_alert: true,
      });

      return res.json({
        success: true,
      });
    }

    // --------------------------------------------------
    // SECURITY CHECK
    // --------------------------------------------------

    if (String(message.chat.id) !== String(TELEGRAM_CHAT_ID)) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Unauthorized chat.',
        show_alert: true,
      });

      return res.json({
        success: true,
      });
    }

    // --------------------------------------------------
    // CALLBACK DATA
    // --------------------------------------------------

    const separatorIndex = callbackData.indexOf(':');

    if (separatorIndex === -1) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Invalid action.',
        show_alert: true,
      });

      return res.json({
        success: true,
      });
    }

    const action = callbackData.substring(
      0,
      separatorIndex
    );

    const orderId = callbackData.substring(
      separatorIndex + 1
    );

    if (
      action !== 'approve' &&
      action !== 'reject'
    ) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Unknown action.',
        show_alert: true,
      });

      return res.json({
        success: true,
      });
    }

    if (!orderId) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Order ID missing.',
        show_alert: true,
      });

      return res.json({
        success: true,
      });
    }

    if (!supabase) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Supabase is not configured.',
        show_alert: true,
      });

      return res.json({
        success: true,
      });
    }

    // --------------------------------------------------
    // NEW STATUS
    // --------------------------------------------------

    const newStatus =
      action === 'approve'
        ? 'approved'
        : 'rejected';

    const displayStatus =
      action === 'approve'
        ? 'APPROVED'
        : 'REJECTED';

    // --------------------------------------------------
    // UPDATE SUPABASE
    // --------------------------------------------------

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: newStatus,
      })
      .eq('order_id', orderId)
      .select();

    if (error) {
      console.error(
        'Supabase update error:',
        error
      );

      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Database update failed.',
        show_alert: true,
      });

      return res.json({
        success: false,
        error: error.message,
      });
    }

    if (!data || data.length === 0) {
      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Order not found.',
        show_alert: true,
      });

      return res.json({
        success: false,
        error: 'Order not found',
      });
    }

    // --------------------------------------------------
    // REMOVE APPROVE / REJECT BUTTONS
    // --------------------------------------------------

    await telegram('editMessageReplyMarkup', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: {
        inline_keyboard: [],
      },
    });

    // --------------------------------------------------
    // UPDATE STATUS IN TELEGRAM MESSAGE
    // --------------------------------------------------

    let currentText = message.text || '';

    currentText = currentText
      .replace(
        /⏳ STATUS : PENDING/g,
        `${action === 'approve' ? '✅' : '❌'} STATUS : ${displayStatus}`
      )
      .replace(
        /<b>⏳ STATUS : PENDING<\/b>/g,
        `<b>${action === 'approve' ? '✅' : '❌'} STATUS : ${displayStatus}</b>`
      );

    // If HTML message already contains escaped HTML,
    // replace the exact status safely.
    if (
      !currentText.includes(
        `STATUS : ${displayStatus}`
      )
    ) {
      currentText +=
        `\n\n<b>${action === 'approve' ? '✅' : '❌'} STATUS : ${displayStatus}</b>`;
    }

    await telegram('editMessageText', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: currentText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    // --------------------------------------------------
    // ANSWER BUTTON
    // --------------------------------------------------

    await telegram('answerCallbackQuery', {
      callback_query_id: callback.id,
      text:
        action === 'approve'
          ? '✅ Order approved!'
          : '❌ Order rejected!',
      show_alert: false,
    });

    console.log(
      `Order ${orderId} → ${newStatus} by Telegram user ${fromUser?.id}`
    );

    return res.json({
      success: true,
      order_id: orderId,
      status: newStatus,
    });

  } catch (error) {
    console.error(
      'Telegram webhook error:',
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log('================================');
  console.log('IVR ORDER BACKEND');
  console.log('================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log('================================');
});