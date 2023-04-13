import {
  createNativeClient,
  getDefaultLibraryFilename,
  Attachment,
  Statement,
  Transaction,
  TransactionOptions,
  TransactionIsolation,
} from 'node-firebird-driver-native';
import { /*ResultSet, FetchOptions, Attachment, */ ConnectOptions } from 'node-firebird-driver';
import { createPool } from 'generic-pool';
import { LRUCache } from 'lru-cache';

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
interface IConnDB {
  attachment: Attachment;
  transactionRO: Transaction;
  queryCache: LRUCache<string, Statement, unknown>;
}

/* кэш результатов запросов минимальное время 3 сек. 
   можно поставить отдельно для каждого запроса.
*/
const resCachOptions = {
  max: 50,
  ttl: 1000 * 3,
  updateAgeOnGet: true,
};
const resCache = new LRUCache<string, object[]>(resCachOptions);

/** перечисление для выбора Read Only транцакции */
export enum TransactionReadType {
  READ_ONLY = 'READ_ONLY',
  READ_WRITE = 'READ_WRITE',
}

const dbFactory = {
  create: async function () {
    const client = createNativeClient(getDefaultLibraryFilename());
    const attachment = await client.connect(connectionString, loginString);

    /** TransactionOptions interface. */
    const trOptions: TransactionOptions = {
      isolation: TransactionIsolation.READ_COMMITTED,
      readCommittedMode: 'NO_RECORD_VERSION',
      accessMode: 'READ_ONLY',
      waitMode: 'NO_WAIT',
    };

    const transactionRO = await attachment.startTransaction(trOptions);
    const statCachOptions = {
      max: 50,
      ttl: 1000 * 60 * 10,
      updateAgeOnGet: true,
    };
    const queryCache = new LRUCache<string, Statement>(statCachOptions);
    const ret: IConnDB = { attachment: attachment, transactionRO: transactionRO, queryCache: queryCache };
    console.log(`connect`);
    return ret;
  },
  destroy: function (connection: IConnDB) {
    connection.queryCache.clear();
    return connection.attachment.disconnect();
  },
};

const opts = {
  max: 10, // maximum size of the pool
  min: 2, // minimum size of the pool
};

const dbPool = createPool(dbFactory, opts);

export const handleExit = () => {
  console.log(`close pool`);
  dbPool.drain().then(() => dbPool.clear());
};

export async function QueryOpen(sql: string, prm: undefined[], transType?: TransactionReadType): Promise<object[]> {
  console.log(`SQL = ${sql}`);
  console.log(`PRM = ${prm}`);
  const statCachKey = `${sql}:${JSON.stringify(prm)}`;

  if (transType === TransactionReadType.READ_ONLY) {
    const resFromCache = resCache.get(statCachKey);
    if (resFromCache) {
      console.log(`return from cache`);
      return resFromCache;
    }
  }

  let transaction;
  let transCommit = true;
  const conn = await dbPool.acquire();
  if (transType === undefined || transType === TransactionReadType.READ_WRITE) {
    transaction = await conn.attachment.startTransaction();
  } else {
    transaction = conn.transactionRO;
    transCommit = false;
  }
  let stat = conn.queryCache.get(sql);
  if (!stat) {
    stat = await conn.attachment.prepare(transaction, sql, undefined);
    conn.queryCache.set(sql, stat);
  }
  console.log(`TRAN = ${transCommit ? 'READ_WRITE' : 'READ_ONLY'}`);
  const recSet = await stat.executeQuery(transaction, prm, undefined);
  const res = await recSet.fetchAsObject();
  if (transCommit) transaction.commit();
  recSet.close();
  dbPool.release(conn);
  resCache.set(statCachKey, res);
  return res;
}
