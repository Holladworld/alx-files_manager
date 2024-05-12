const { ObjectID } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

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
    const userID = new ObjectID(userId);
    const files = await dbClient.db.collection('files').findOne({ _id: fileId, userId: userID });
    if (!files) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(files);
  },

  async getIndex(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { parentId, page = 0 } = req.query;
    const filesPerPage = 20;
    const skip = parseInt(page, 10) * filesPerPage;
    const limit = filesPerPage;
    let searchQuery;
    if (!parentId) {
      searchQuery = { userId: ObjectID(userId) };
    } else {
      searchQuery = {
        parentId: ObjectID(parentId),
        userId: ObjectID(userId),
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
};

module.exports = FilesController;
