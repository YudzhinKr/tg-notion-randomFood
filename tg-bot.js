require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('@notionhq/client');
const express = require('express');

const { addFoodHandler, handleCallbackQuery, userState } = require('./handlers/addFood');
const { deleteFoodHandler, handleDeleteCallback } = require('./handlers/deleteFood'); // deleteState більше не потрібен в імпорті
const { dailyMenuHandler, handleMenuCallbackQuery } = require('./handlers/randomFood'); // <-- Змінено шлях імпорту

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Головне меню
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['➕ Додати страву', '🗑 Видалити страву'],
      ['🍱 Підібрати меню на день'], // <-- Нова кнопка
    ],
    resize_keyboard: true,
  },
};

// Стартове повідомлення з клавіатурою
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Привіт! Обери дію:', mainKeyboard);
});

// Обробка повідомлень
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;

  if (text === '➕ Додати страву') {
    return addFoodHandler(bot, msg, userState, notion, mainKeyboard);
  }

  if (text === '🗑 Видалити страву') {
    return deleteFoodHandler(bot, msg, notion, mainKeyboard);
  }

  if (text === '🍱 Підібрати меню на день') { // <-- Нова логіка для кнопки
    return dailyMenuHandler(bot, msg, notion, mainKeyboard);
  }

  if (userState[chatId]) { // Продовжуємо логіку додавання, якщо користувач в процесі
    return addFoodHandler(bot, msg, userState, notion, mainKeyboard);
  }
});

// Обробка callback_query
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    // Спочатку спробуємо обробити callback для додавання їжі
    if (data.startsWith('meal_')) {
        await handleCallbackQuery(bot, callbackQuery, userState);
    }
    // Якщо це не кнопка додавання, спробуємо обробити callback для видалення
    else if (data.startsWith('delete_') || data.startsWith('confirm_')) {
        await handleDeleteCallback(bot, callbackQuery, notion, mainKeyboard);
    }
    // Якщо це не кнопки додавання/видалення, спробуємо обробити callback для меню
    else if (data.startsWith('show_ingredients_')) { // <-- Нова логіка для меню
        await handleMenuCallbackQuery(bot, callbackQuery, mainKeyboard);
    }

    // Відповідаємо Telegram, щоб прибрати "loading..."
    // Це потрібно викликати один раз для кожного callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});

console.log('Бот запущено 🚀');


const app = express();
const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.send('✅ Bot is alive');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server is listening on port ${PORT}`);
});
