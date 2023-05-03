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
const CACHE_RES_TTL = process.env.CACHE_RES_TTL | 0;
const CACHE_PREPARE_TTL = process.env.CACHE_PREPARE_TTL | 0;
const connectionString = `${DB_HOST}/${DB_PORT}:${DB_NAME}`;
console.log(connectionString);

const loginString: ConnectOptions = { username: `${DB_USER}`, password: `${DB_PASSWORD}` };

/* фабрика коннектов к базе */
interface IConnDB {
  attachment: Attachment;
  transactionRO: Transaction;
  queryCache: LRUCache<string, Statement, unknown>;
}

export interface IoptQuery {
  TransactionReadType: TransactionReadType,
  ttl: number;
}

/* кэш результатов запросов минимальное время 3 сек. 
   можно поставить отдельно для каждого запроса.
*/
const resCachOptions = {
  max: 50,
  ttl: CACHE_RES_TTL,
  updateAgeOnGet: true,
};

const resCache = new LRUCache<string, object[]>(resCachOptions);

/** перечисление для выбора Read Only транцакции */
export enum TransactionReadType {
  READ_ONLY = "READ_ONLY",
  READ_WRITE = "READ_WRITE",
}

const dbFactory = {
  create: async function () {
    const client = createNativeClient(getDefaultLibraryFilename());
    const attachment = await client.connect(connectionString, loginString);

    /** TransactionOptions interface. */
    const trOptions: TransactionOptions = {
      isolation: TransactionIsolation.READ_COMMITTED,
      readCommittedMode: "NO_RECORD_VERSION",
      accessMode: "READ_ONLY",
      waitMode: "NO_WAIT",
    };

    const transactionRO = await attachment.startTransaction(trOptions);
    const statCachOptions = {
      max: 50,
      ttl: CACHE_PREPARE_TTL,
      updateAgeOnGet: true,
    };

    const queryCache = new LRUCache<string, Statement>(statCachOptions);
    const ret: IConnDB = {
      attachment: attachment,
      transactionRO: transactionRO,
      queryCache: queryCache,
    };
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

export async function QueryOpen(
  sql: string,
  prm: unknown[],
  optQuery: IoptQuery,
): Promise<object[]> {
  console.log(`SQL = ${sql} PRM = ${JSON.stringify(prm)} TRAN = "${optQuery.TransactionReadType}"`);
  const statCachKey = `${sql}:${JSON.stringify(prm)}`;

  if (optQuery?.TransactionReadType === TransactionReadType.READ_ONLY) {
    const resFromCache = resCache.get(statCachKey);
    if (resFromCache) {
      console.log(`return from cache`);
      return resFromCache;
    }
  }

  let transaction;
  let transCommit = true;
  const conn = await dbPool.acquire();
  if (
    optQuery.TransactionReadType === undefined ||
    optQuery.TransactionReadType === TransactionReadType.READ_WRITE
  ) {
    transaction = await conn.attachment.startTransaction();
    transCommit = true;
  } else {
    transaction = conn.transactionRO;
    transCommit = false;
  }
  let stat = conn.queryCache.get(sql);
  if (!stat) {
    try {
      stat = await conn.attachment.prepare(transaction, sql, undefined);
      conn.queryCache.set(sql, stat);
    } catch (err: any) {
      console.log(`prepare error: ${err.message}`);
    }
  }
  console.log(`TRAN = ${transCommit ? "READ_WRITE" : "READ_ONLY"}`);
  let recSet;
  let res: object[] = [];
  if (stat != undefined) {
    try {
      recSet = await stat.executeQuery(transaction, prm, undefined);
      res = await recSet.fetchAsObject();
      recSet.close();
    } catch (err: any) {
      console.log(`execute error: ${err.message}`);
    }
  }
  if (transCommit) transaction.commit();
  dbPool.release(conn);
  const options = optQuery.ttl > 0 ? { ttl: optQuery?.ttl } : undefined;
  if (res.length > 0) {
    resCache.set(statCachKey, res, options);
    console.log(`result length = ${res.length}`);
  } else {
    console.log(`result length = 0 ${res}`);
  }
  return res;
}
