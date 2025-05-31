// handlers/addFood.js

const userState = {}; // Зберігаємо стан користувачів тут

const handleAddFood = async (bot, msg, userState, notion, mainKeyboard) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userState[chatId];

  // Старт додавання — показуємо inline клавіатуру для вибору прийому їжі
  if (text === '➕ Додати страву') {
    userState[chatId] = { step: 'select_meal' };

    await bot.sendMessage(chatId, '📝  Давайте запишемо нову страву.', {
      reply_markup: { remove_keyboard: true },
    });
  
    // 2. Відправляємо inline-клавіатуру
    return bot.sendMessage(chatId, ' Оберіть прийом їжі:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Завтрак', callback_data: 'meal_breakfast' }],
          [{ text: 'Обід', callback_data: 'meal_lunch' }],
          [{ text: 'Вечеря', callback_data: 'meal_dinner' }],
        ],
      },
    });
  }

  if (!state) return;

  switch (state.step) {
    case 'enter_name':
      state.name = text;
      state.step = 'enter_calories';
      return bot.sendMessage(chatId, '⚡️ Введіть калорійність (число):');

    case 'enter_calories':
      const calories = parseInt(text, 10);
      if (isNaN(calories)) {
        return bot.sendMessage(chatId, '❌ Будь ласка, введіть число для калорійності.');
      }
      state.calories = calories;
      state.step = 'enter_proteins';  // Переходимо до білків
      return bot.sendMessage(chatId, '🍗 Скільки грамів білків у страві? (число):');

    case 'enter_proteins':
      const proteins = parseInt(text, 10);
      if (isNaN(proteins)) {
        return bot.sendMessage(chatId, '❌ Будь ласка, введіть число для білків.');
      }
      state.proteins = proteins;
      state.step = 'enter_ingredients';  // Переходимо до інгредієнтів
      return bot.sendMessage(chatId, '📋 Введіть інгредієнти (через кому):');

    case 'enter_ingredients':
      state.ingredients = text;

      // Додаємо у Notion
      try {
        await notion.pages.create({
          parent: { database_id: process.env.NOTION_DB_ID },
          properties: {
            'Назва страви': {
              title: [{ text: { content: state.name } }],
            },
            'Прийом їжі': {
              select: { name: state.mealType },
            },
            'Калорійність': {
              number: state.calories,
            },
            'Інгредієнти': {
              rich_text: [{ text: { content: state.ingredients } }],
            },
            'Білки': {
              number: state.proteins,
            },
          },
        });

        delete userState[chatId];
        return bot.sendMessage(chatId, `✅ Страву "${state.name}" додано!`, mainKeyboard);
      } catch (error) {
        console.error('🚨 Помилка додавання страви в Notion:', error.message);
        return bot.sendMessage(chatId, `❌ Помилка при додаванні страви: ${error.message}`, mainKeyboard);
      }

    default:
      break;
  }
}; // <-- Ось тут закривається handleAddFood

// Обробка callbackQuery для вибору прийому їжі
const handleCallbackQuery = (bot, callbackQuery, userState) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (!userState[chatId] || userState[chatId].step !== 'select_meal') {
    return bot.answerCallbackQuery(callbackQuery.id);
  }

  const mealMap = {
    meal_breakfast: 'Завтрак',
    meal_lunch: 'Обід',
    meal_dinner: 'Вечеря',
  };

  if (!mealMap[data]) {
    return bot.answerCallbackQuery(callbackQuery.id, { text: 'Невірний вибір' });
  }

  userState[chatId].mealType = mealMap[data];
  userState[chatId].step = 'enter_name';

  bot.answerCallbackQuery(callbackQuery.id);
  return bot.sendMessage(chatId, '🥗 Введіть назву страви:');
};

module.exports = {
  addFoodHandler: handleAddFood,
  handleCallbackQuery,
  userState,
};
