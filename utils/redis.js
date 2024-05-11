const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (error) => console.log(error));
    this.client.on('ready', () => {
      this.isConnected = true;
    });
    this.asyncGet = promisify(this.client.get).bind(this.client);
    this.asyncSet = promisify(this.client.set).bind(this.client);
    this.asyncDel = promisify(this.client.del).bind(this.client);
    this.isConnected = false;
  }

  isAlive() {
    return this.isConnected;
  }

  async get(key) {
    return this.asyncGet(key).then((value) => value);
  }

  async set(key, value, duration) {
    await this.asyncSet(key, value);
    if (duration) {
      await this.client.expire(key, duration);
    }
  }

  async del(key) {
    await this.asyncDel(key);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
