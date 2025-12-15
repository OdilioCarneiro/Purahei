const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
let client;
let db;

async function getDb() {
  if (db) return db;

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'purheire'); // opcional
  return db;
}

module.exports = { getDb };
