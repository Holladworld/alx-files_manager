const redis = require('../utils/redis');
const db = require('../utils/db');

const getStatus = async (req, res) => {
  const redisAlive = await redis.isAlive();
  const dbAlive = await db.isAlive();
  res.status(200).json({ redis: redisAlive, db: dbAlive });
};
const getStats = async (req, res) => {
  const usersCount = await db.nbUsers();
  const filesCount = await db.nbFiles();
  res.status(200).json({ users: usersCount, files: filesCount });
};

module.exports = { getStatus, getStats };
