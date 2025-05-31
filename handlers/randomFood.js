// handlers/randomFood.js

const menuState = {}; // Зберігаємо згенероване меню для кожного користувача

const dailyMenuHandler = async (bot, msg, notion, mainKeyboard) => {
    const chatId = msg.chat.id;

    const generatingMessage = await bot.sendMessage(chatId, 'Генерую меню на день... 🔄'); // Зберігаємо повідомлення для видалення

    try {
        const breakfastItems = await getFoodItemsFromNotion(notion, 'Завтрак');
        const lunchItems = await getFoodItemsFromNotion(notion, 'Обід');
        const dinnerItems = await getFoodItemsFromNotion(notion, 'Вечеря');

        if (breakfastItems.length === 0 || lunchItems.length === 0 || dinnerItems.length === 0) {
            // Видаляємо повідомлення "Генерую меню..."
            await bot.deleteMessage(chatId, generatingMessage.message_id).catch(e => console.log('Could not delete generating message:', e.message));
            return bot.sendMessage(chatId, '❌ Недостатньо страв для генерації повного меню. Додайте по одній страві для "Завтраку", "Обіду" та "Вечері".', mainKeyboard);
        }

        const selectedBreakfast = getRandomItem(breakfastItems);
        const selectedLunch = getRandomItem(lunchItems);
        const selectedDinner = getRandomItem(dinnerItems);

        const menuDetails = {
            breakfast: selectedBreakfast,
            lunch: selectedLunch,
            dinner: selectedDinner,
        };

        // Зберігаємо згенероване меню в стані користувача
        menuState[chatId] = menuDetails;

        let menuMessage = '✨ Пропоную таке меню на день:\n\n';
        menuMessage += `🍳 Завтрак:\n${selectedBreakfast.name} - ${selectedBreakfast.calories} ккал - ${selectedBreakfast.proteins} білків\n`;
        menuMessage += `🍲 Обід:\n${selectedLunch.name} - ${selectedLunch.calories} ккал - ${selectedLunch.proteins} білків\n`;
        menuMessage += `🥗 Вечеря:\n${selectedDinner.name} - ${selectedDinner.calories} ккал - ${selectedDinner.proteins} білків\n\n`;
        menuMessage += 'Хочеш побачити інгредієнти?'; // Ця фраза буде змінюватися

        // Видаляємо повідомлення "Генерую меню..." перед надсиланням нового
        await bot.deleteMessage(chatId, generatingMessage.message_id).catch(e => console.log('Could not delete generating message:', e.message));

        // Відправляємо сформоване меню з інлайн-клавіатурою
        const sentMenuMessage = await bot.sendMessage(chatId, menuMessage, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Так', callback_data: 'show_ingredients_yes' }, { text: '❌ Ні', callback_data: 'show_ingredients_no' }],
                ],
            },
        });
        menuState[chatId].menuMessageId = sentMenuMessage.message_id; // Зберігаємо ID повідомлення з меню

    } catch (error) {
        console.error('🚨 Помилка при генерації меню:', error);
        // Якщо сталася помилка, також видаляємо "Генерую меню..."
        await bot.deleteMessage(chatId, generatingMessage.message_id).catch(e => console.log('Could not delete generating message on error:', e.message));
        return bot.sendMessage(chatId, '❌ Виникла помилка при генерації меню. Спробуйте пізніше.', mainKeyboard);
    }
};

const handleMenuCallbackQuery = async (bot, callbackQuery, mainKeyboard) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const currentMenuText = callbackQuery.message.text; // Отримуємо поточний текст повідомлення

    // Відповідаємо Telegram, щоб прибрати "loading..."
    await bot.answerCallbackQuery(callbackQuery.id);

    const currentMenu = menuState[chatId];

    if (!currentMenu || !currentMenu.menuMessageId) {
        return bot.sendMessage(chatId, 'Поточне меню не знайдено або термін дії вийшов. Спробуйте згенерувати меню знову.', mainKeyboard);
    }

    // Незалежно від вибору (Так/Ні), оновлюємо оригінальне повідомлення з меню
    // Щоб прибрати питання "Хочеш побачити інгредієнти?" та клавіатуру.
    const updatedMenuText = currentMenuText.replace('Хочеш побачити інгредієнти?', '').trim(); // Видаляємо питання

    await bot.editMessageText(updatedMenuText, {
        chat_id: chatId,
        message_id: currentMenu.menuMessageId,
        reply_markup: { inline_keyboard: [] } // Прибираємо кнопки "Так/Ні"
    }).catch(e => console.log('Could not edit menu message text/reply markup:', e.message));


    if (data === 'show_ingredients_yes') {
        let ingredientsMessage = '📋 Інгредієнти для твого меню:\n\n';
        ingredientsMessage += `🍳 ${currentMenu.breakfast.name}:\n${currentMenu.breakfast.ingredients}\n\n`;
        ingredientsMessage += `🍲 ${currentMenu.lunch.name}:\n${currentMenu.lunch.ingredients}\n\n`;
        ingredientsMessage += `🥗 ${currentMenu.dinner.name}:\n${currentMenu.dinner.ingredients}\n\n`;
        ingredientsMessage += 'Ти заслуговуєш на смачний день ! 😊';

        // Відправляємо інгредієнти НОВИМ повідомленням
        await bot.sendMessage(chatId, ingredientsMessage);

        // Очищаємо стан меню після показу інгредієнтів
        delete menuState[chatId];
    } else if (data === 'show_ingredients_no') {
        // Ми вже оновили текст та прибрали клавіатуру вище.
        // Очищаємо стан меню
        delete menuState[chatId];
    }
    // Головна клавіатура залишається активною
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
            calories: page.properties['Калорійність']?.number || 0,
            proteins: page.properties['Білки']?.number || 0,
            ingredients: page.properties['Інгредієнти']?.rich_text[0]?.plain_text || 'Не вказано',
        }));
    } catch (error) {
        console.error(`🚨 Помилка при отриманні страв з Notion для ${mealType}:`, error);
        return [];
    }
}

// Допоміжна функція для випадкового вибору елемента з масиву
function getRandomItem(arr) {
    if (!arr || arr.length === 0) {
        return null;
    }
    const randomIndex = Math.random() * arr.length;
    return arr[Math.floor(randomIndex)];
}

module.exports = {
    dailyMenuHandler,
    handleMenuCallbackQuery,
};