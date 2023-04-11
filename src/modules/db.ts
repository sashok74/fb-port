import { createNativeClient, getDefaultLibraryFilename } from 'node-firebird-driver-native';
import { /*ResultSet, FetchOptions,*/ Attachment, ConnectOptions } from 'node-firebird-driver';
import { createPool } from 'generic-pool';

import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const connectionString = `${DB_HOST}/${DB_PORT}:${DB_NAME}`;
console.log(connectionString);
const loginString: ConnectOptions = { username: `${DB_USER}`, password: `${DB_PASSWORD}` };

/* фабрика коннектов к базе */
const dbFactory = {
  create: function () {
    const client = createNativeClient(getDefaultLibraryFilename());
    const attachment = client.connect(connectionString, loginString);
    console.log(`подключение к базе данных`);
    return attachment;
  },
  destroy: function (connection: Attachment) {
    console.log(`закрыть базу данных`);
    return connection.disconnect();
  },
};

const opts = {
  max: 100, // maximum size of the pool
  min: 2, // minimum size of the pool
};

const dbPool = createPool(dbFactory, opts);

export const handleExit = () => {
  console.log(`close pool`);
  dbPool.drain().then(() => dbPool.clear());
};

export async function QueryOpen(sql: string, prm: undefined[]): Promise<object[]> {
  const attachment = await dbPool.acquire();
  console.log(`SQL = ${sql}`);
  console.log(`PRM = ${prm}`);
  const transaction = await attachment.startTransaction();
  const stat = await attachment.prepare(transaction, sql, undefined);
  const recSet = await stat.executeQuery(transaction, prm, undefined);
  const res = await recSet.fetchAsObject();
  dbPool.release(attachment);
  return res;
}
