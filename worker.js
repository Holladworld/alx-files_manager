const Bull = require('bull');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs').promises;
const dbClient = require('./utils/db');

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const allFiles = dbClient.db.collection('files');
  const file = await allFiles.findOne({ _id: fileId, userId });

  if (!file) {
    throw new Error('File not found');
  }
  const filePath = file.localPath;

  const thumbnail500 = await imageThumbnail(filePath, { width: 500 });
  const thumbnail250 = await imageThumbnail(filePath, { width: 250 });
  const thumbnail100 = await imageThumbnail(filePath, { width: 100 });

  const thumbnail500Path = `${filePath}_500`;
  const thumbnail250Path = `${filePath}_250`;
  const thumbnail100Path = `${filePath}_100`;

  await Promise.all([
    fs.writeFile(thumbnail500Path, thumbnail500),
    fs.writeFile(thumbnail250Path, thumbnail250),
    fs.writeFile(thumbnail100Path, thumbnail100),
  ]);
});

module.exports = fileQueue;
