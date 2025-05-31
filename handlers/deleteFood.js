// handlers/deleteFood.js

const deleteState = {}; // Зберігаємо стан для кожного користувача

const deleteFoodHandler = async (bot, msg, notion, mainKeyboard) => {
    const chatId = msg.chat.id;

    // Ініціалізація стану видалення для цього користувача
    deleteState[chatId] = { step: 'select_category' };

    await bot.sendMessage(chatId, 'Видалення — оберіть страву:', {
        reply_markup: { remove_keyboard: true }, // Прибираємо основну клавіатуру
    });

    // Відправляємо inline-клавіатуру для вибору категорії
    await bot.sendMessage(chatId, '🔻 Оберіть прийом їжі:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Завтрак', callback_data: 'delete_category_Завтрак' }],
                [{ text: 'Обід', callback_data: 'delete_category_Обід' }],
                [{ text: 'Вечеря', callback_data: 'delete_category_Вечеря' }],
            ],
        },
    });
};

const handleDeleteCallback = async (bot, callbackQuery, notion, mainKeyboard) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;

    // Відповідаємо Telegram, щоб прибрати "loading..."
    await bot.answerCallbackQuery(callbackQuery.id);

    const state = deleteState[chatId];

    // Якщо стану немає або крок не відповідає очікуваному, ігноруємо
    if (!state) {
        // Можливо, це callback зі старого повідомлення
        return bot.sendMessage(chatId, 'Дія видалення не активна. Спробуйте знову.', mainKeyboard);
    }

    // КРОК 1: Вибір категорії
    if (state.step === 'select_category' && data.startsWith('delete_category_')) {
        const mealType = data.replace('delete_category_', '');
        state.mealType = mealType;
        state.step = 'select_food_item';

        await bot.editMessageText(`🔻 Прийом їжі - ${mealType}.`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] } // Прибираємо попередні кнопки
        });

        const foodItems = await getFoodItemsFromNotion(notion, mealType);

        if (foodItems.length === 0) {
            delete deleteState[chatId]; // Очищаємо стан
            return bot.sendMessage(chatId, `❌ У категорії "**${mealType}**" немає страв.`, mainKeyboard);
        }

        const inlineButtons = foodItems.map(item => [{ text: item.name, callback_data: `delete_food_id_${item.id}` }]);
        inlineButtons.push([{ text: '↩️ Назад до категорій', callback_data: 'delete_go_back_category' }]); // Кнопка "назад"

        await bot.sendMessage(chatId, '🥗 Оберіть страву для видалення:', {
            reply_markup: { inline_keyboard: inlineButtons },
        });
        return;
    }

    // КРОК 2: Вибір конкретної страви
    if (state.step === 'select_food_item' && data.startsWith('delete_food_id_')) {
        const pageId = data.replace('delete_food_id_', '');
        state.pageId = pageId;
        state.step = 'confirm_deletion';

        // Можна дістати назву страви для підтвердження
        const foodName = callbackQuery.message.reply_markup.inline_keyboard
            .flat()
            .find(btn => btn.callback_data === data)?.text || 'вибрана страва';


        await bot.editMessageText(`🥗 Ви обрали: ${foodName}.`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] } // Прибираємо попередні кнопки
        });

        await bot.sendMessage(chatId, `❓ Ви дійсно хочете видалити страву "${foodName}"?`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Так', callback_data: 'delete_confirm_yes' }, { text: '❌ Ні', callback_data: 'delete_confirm_no' }],
                    
                ],
            },
        });
        return;
    }

    // КРОК 3: Підтвердження видалення
    if (state.step === 'confirm_deletion') {
        if (data === 'delete_confirm_yes') {
            try {
                if (!state.pageId) {
                    throw new Error('Не знайдено ID сторінки для видалення.');
                }
                await notion.pages.update({
                    page_id: state.pageId,
                    archived: true, // Архівація замість повного видалення
                });
                delete deleteState[chatId]; // Очищаємо стан після успіху
                await bot.sendMessage(chatId, '✅ Страву успішно видалено.', mainKeyboard);
            } catch (error) {
                console.error('🚨 Помилка при видаленні страви в Notion:', error);
                delete deleteState[chatId]; // Очищаємо стан при помилці
                await bot.sendMessage(chatId, `❌ Помилка при видаленні страви: ${error.message}`, mainKeyboard);
            }
        } else if (data === 'delete_confirm_no') {
            delete deleteState[chatId]; // Очищаємо стан при скасуванні
            await bot.sendMessage(chatId, '↩️ Видалення скасовано.', mainKeyboard);
        }
        return;
    }

    // Обробка кнопки "Назад до категорій"
    if (data === 'delete_go_back_category') {
        deleteState[chatId] = { step: 'select_category' }; // Повертаємось до першого кроку
        await bot.editMessageText('↩️ Оберіть прийом їжі:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Завтрак', callback_data: 'delete_category_Завтрак' }],
                    [{ text: 'Обід', callback_data: 'delete_category_Обід' }],
                    [{ text: 'Вечеря', callback_data: 'delete_category_Вечеря' }],
                ],
            },
        });
        return;
    }
};

// Допоміжна функція для отримання страв з Notion
async function getFoodItemsFromNotion(notion, mealType) {
    try {
        const response = await notion.databases.query({
            database_id: process.env.NOTION_DB_ID,
            filter: {
                property: 'Прийом їжі',
                select: { equals: mealType },
            },
        });
        return response.results.map(page => ({
            id: page.id,
            name: page.properties['Назва страви'].title[0]?.plain_text || 'Без назви',
        }));
    } catch (error) {
        console.error('🚨 Помилка при отриманні страв з Notion:', error);
        return [];
    }
}

module.exports = {
    deleteFoodHandler,
    handleDeleteCallback,
    deleteState, // Експортуємо deleteState для tg-bot.js
};