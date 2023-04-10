import { createNativeClient, getDefaultLibraryFilename } from 'node-firebird-driver-native';
import { /*ResultSet, FetchOptions,*/ ConnectOptions } from 'node-firebird-driver';
import dotenv from 'dotenv';
dotenv.config();
//:import { process } from '../server.js';
//const fetchOne: FetchOptions = { fetchSize: 1 };
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.PORT;
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const connectionString = `${DB_HOST}:${DB_NAME}`;
console.log(connectionString);
const loginString: ConnectOptions = { username: `${DB_USER}`, password: `${DB_PASSWORD}` };
const client = createNativeClient(getDefaultLibraryFilename());
const attachment = await client.connect(connectionString, loginString);
console.log(`подключение к базе данных = ${attachment.isValid}`);

export async function QueryOpen(sql: string, prm: undefined[]) {
  console.log(`SQL = ${sql}`);
  console.log(`PRM = ${prm}`);
  const transaction = await attachment.startTransaction();
  const stat = await attachment.prepare(transaction, sql, undefined);
  const recSet = await stat.executeQuery(transaction, prm, undefined);
  const res = await recSet.fetchAsObject();
  return res;
}
