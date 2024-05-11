const sha1 = require('sha1');
const { v4: uuidv4 } = require('uuid');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const AuthController = {
  async getConnect(req, res) {
    const authHeader = req.header('Authorization').split(' ')[1];
    const [email, password] = Buffer.from(authHeader, 'base64').toString('utf-8').split(':');
    if (!email || !password) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const hashedPassword = sha1(password);
    const users = dbClient.db.collection('users');
    const user = await users.findOne({ email, password: hashedPassword });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = uuidv4();
    const key = `auth_${token}`;
    await redisClient.set(key, user._id.toString(), 86400);
    res.status(200).json({ token });
  },

  async getDisconnect(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await redisClient.del(key);
    res.status(204).json({});
  },
};

module.exports = AuthController;
