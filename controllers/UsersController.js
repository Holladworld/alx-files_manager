const sha1 = require('sha1');
const dbClient = require('../utils/db');

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
        users.insertOne({ email, passwordHash }).then((user) => {
          res.status(201).json({ id: user.insertedId, email });
        });
      }
    });
  },
};

module.exports = UsersController;
