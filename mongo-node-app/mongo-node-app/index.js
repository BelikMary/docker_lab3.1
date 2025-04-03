const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/salesdb';

let db;
function cleanDateString(dateString) {
  return dateString.replace(/(\(.*\)|\s*\+.*)/, '');
}

async function initDB() {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('sales')) {
      await db.createCollection('sales');
      console.log('Коллекция sales создана');
    }
    
    if (!collectionNames.includes('monthly_revenue')) {
      await db.createCollection('monthly_revenue');
      console.log('Коллекция monthly_revenue создана');
    }
    
    console.log('Подключение к MongoDB установлено');
  } catch (error) {
    console.error('Ошибка подключения к MongoDB:', error);
  }
}

function generateSale() {
  return {
    item: 'Product ' + Math.floor(Math.random() * 100),
    quantity: Math.floor(Math.random() * 10) + 1,
    price: parseFloat((Math.random() * 100).toFixed(2)),
    date: cleanDateString(new Date().toString().replace("  ", "").replace("GMT", "+00:00")) 
  };
}

function parseDateString(dateString) {
  return new Date(dateString);
}

async function updateMonthlyRevenue() {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

    const aggregationResult = await db.collection('sales').aggregate([
      {
        $addFields: {
          parsedDate: {
            $dateFromString: {
              dateString: "$date",
              timezone: "UTC"
            }
          }
        }
      },
      {
        $match: {
          parsedDate: {
            $gte: firstDay,
            $lte: lastDay
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: { $multiply: ["$price", "$quantity"] }
          },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const totalRevenue = aggregationResult.length > 0 
      ? parseFloat(aggregationResult[0].totalRevenue.toFixed(2))
      : 0;

    await db.collection('monthly_revenue').updateOne(
      { month, year },
      {
        $set: {
          totalRevenue,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date(),
          month,
          year
        }
      },
      { upsert: true }
    );

    return { month, year, totalRevenue };
  } catch (error) {
    console.error('Ошибка при расчете выручки:', error);
    throw error;
  }
}

// API
app.post('/sale', async (req, res) => {
  const sale = generateSale();
  try {
    console.log(142142)
    const result = await db.collection('sales').insertOne(sale);
    const revenueData = await updateMonthlyRevenue();
    
    res.json({
      message: 'Продажа сохранена и выручка обновлена',
      sale,
      id: result.insertedId,
      monthlyRevenue: revenueData
    });
  } catch (error) {
    console.error('Ошибка при сохранении продажи:', error);
    res.status(500).json({ error: 'Ошибка при сохранении продажи' });
  }
});

// API
app.get('/sales', async (req, res) => {
  try {
    const sales = await db.collection('sales').find().toArray();
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
});

// API 
app.get('/revenue/monthly', async (req, res) => {
  try {
    const revenue = await db.collection('monthly_revenue')
      .find()
      .sort({ year: 1, month: 1 })
      .toArray();
    res.json(revenue);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении выручки' });
  }
});

initDB().then(() => {
  app.listen(port, () => {
    console.log(`Сервис запущен на http://localhost:${port}`);
  });
});