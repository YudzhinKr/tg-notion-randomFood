// notion.js
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DB_ID;

async function addFood({ name, mealType, calories, ingredients }) {
  try {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        "Назва страви": {
          title: [
            {
              text: {
                content: name,
              },
            },
          ],
        },
        'Прийом їжі': {
          select: {
            name: mealType,
          },
        },
        Калорійність: {
          number: calories,
        },
        Інгредієнти: {
          rich_text: [
            {
              text: {
                content: ingredients,
              },
            },
          ],
        },
      },
    });
  } catch (error) {
    console.error('Помилка додавання страви в Notion:', error.message);
    throw error;
  }
}

module.exports = {
  addFood,
};
