const { ObjectID } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const mime = require('mime-types');
const Bull = require('bull');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const fileQueue = new Bull('fileQueue');

const FilesController = {
  async postUpload(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && type !== 'folder') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }

    if (parentId) {
      const idObject = ObjectID(parentId);
      const parentFolder = await dbClient.db.collection('files').findOne({ _id: idObject });
      if (!parentFolder) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (parentFolder.type !== 'folder') {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }
    const newFile = {
      name,
      type,
      userId,
      parentId,
      isPublic,
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(newFile);
      const [{
        name, _id, isPublic, userId, type, parentId,
      }] = result.ops;
      res.status(201).json({
        id: _id.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
      return;
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.promises.mkdir(folderPath, { recursive: true });
    const filePath = `${folderPath}/${uuidv4()}`;
    await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
    newFile.localPath = filePath;
    if (type !== 'folder') {
      const result = await dbClient.db.collection('files').insertOne(newFile);
      const [{
        name, _id, isPublic, userId, type, parentId,
      }] = result.ops;
      res.status(201).json({
        id: _id.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
      if (type === 'image') {
        await fileQueue.add({ userId, fileId: _id });
      }
    }
  },

  async getShow(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const fileId = new ObjectID(id);
    const files = await dbClient.db.collection('files').findOne({ _id: fileId, userId });
    if (!files) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(files);
  },

  async getIndex(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const redisUserId = await redisClient.get(key);
    if (!redisUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { parentId, page = 0 } = req.query;
    const skip = parseInt(page, 10) * 20;
    const limit = 20;
    let searchQuery;
    if (!parentId) {
      searchQuery = { userId: redisUserId };
    } else {
      searchQuery = {
        parentId,
        userId: redisUserId,
      };
    }
    const aggregateArgs = [
      { $match: searchQuery },
      { $skip: skip },
      { $limit: limit },
    ];
    const allFiles = dbClient.db.collection('files');
    const files = await allFiles.aggregate(aggregateArgs).toArray();
    res.status(200).json(files);
  },

  async putPublish(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const fileId = new ObjectID(id);

    const file = await dbClient.db.collection('files').findOne({ _id: fileId, userId });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await dbClient.db.collection('files').updateOne({ _id: fileId }, { $set: { isPublic: true } });
    file.isPublic = true;
    res.status(200).json(file);
  },

  async putUnpublish(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const fileId = new ObjectID(id);

    const file = await dbClient.db.collection('files').findOne({ _id: fileId, userId });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await dbClient.db.collection('files').updateOne({ _id: fileId }, { $set: { isPublic: false } });
    file.isPublic = false;

    res.status(200).json(file);
  },

  async getFile(req, res) {
    const { id } = req.params;
    const { size } = req.query;
    const allFiles = dbClient.db.collection('files');
    const fileID = new ObjectID(id);
    const file = await allFiles.findOne({ _id: fileID });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (
      !file.isPublic
      && (!userId || file.userId !== userId)
    ) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (file.type === 'folder') {
      res.status(400).json({ error: "A folder doesn't have content" });
      return;
    }
    let filename = file.localPath;
    if (size) {
      const validSizes = ['500', '250', '100'];
      if (!validSizes.includes(size)) {
        res.status(400).json({ error: 'Invalid size' });
        return;
      }
      filename = `${file.localPath}_${size}`;
    }

    fs.stat(file.localPath, (err) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
      }
    });

    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);
    const fileContent = await fs.promises.readFile(filename);
    res.status(200).send(fileContent);
  },
};

module.exports = FilesController;
