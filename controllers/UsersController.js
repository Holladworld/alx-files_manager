const sha1 = require('sha1');
const { ObjectID } = require('mongodb');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const UsersController = {
  async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!password) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }
    const users = dbClient.db.collection('users');
    await users.findOne({ email }, (error, result) => {
      if (result) {
        res.status(400).json({ error: 'Already exist' });
      } else {
        const passwordHash = sha1(password);
        users.insertOne({ email, password: passwordHash }).then((user) => {
          res.status(201).json({ id: user.insertedId, email });
        });
      }
    });
  },

  async getMe(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const objectId = new ObjectID(userId);
    await dbClient.db.collection('users').findOne({ _id: objectId }, (err, result) => {
      if (!result) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(200).json({ id: userId, email: result.email });
    });
  },
};

module.exports = UsersController;
