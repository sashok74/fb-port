import { createNativeClient, getDefaultLibraryFilename, Attachment, Statement } from 'node-firebird-driver-native';
import { /*ResultSet, FetchOptions, Attachment, */ ConnectOptions } from 'node-firebird-driver';
import { createPool } from 'generic-pool';
import { LRUCache } from 'lru-cache'

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
interface IConnDB{
  attachment: Attachment,
  queryCache: LRUCache<any, any, unknown>,
}

const dbFactory = {
  create: async function () {
    const client = createNativeClient(getDefaultLibraryFilename());
    const attachment = await client.connect(connectionString, loginString);
    const options = {
      max: 50,
      ttl: 1000 * 60 * 60,
    }  
    const queryCache = new LRUCache<string, Statement>(options)
    const ret:IConnDB = {attachment: attachment, queryCache: queryCache}
    console.log(`connect`);
    return ret;
  },
  destroy: function (connection:IConnDB) {
    connection.queryCache.clear();
    return connection.attachment.disconnect();
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
  const conn = await dbPool.acquire();
  console.log(`SQL = ${sql}`);
  console.log(`PRM = ${prm}`);
  const transaction = await conn.attachment.startTransaction();
  let stat:Statement = conn.queryCache.get(sql);
  if (!stat) {
    stat = await conn.attachment.prepare(transaction, sql, undefined);
    conn.queryCache.set(sql,stat);
  }
  const recSet = await stat.executeQuery(transaction, prm, undefined);
  const res = await recSet.fetchAsObject();
  recSet.close();
  dbPool.release(conn);
  return res;
}
