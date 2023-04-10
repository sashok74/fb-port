import app from './app.js';
import dotenv from 'dotenv';

declare let process: {
  env: {
    PORT: number;
    SERVER: string;
    MODE_ENV: string;
    DB_PORT: number;
    DB_HOST: string;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
  };
};

dotenv.config();

//const PORT = Number(process.env.PORT) || 3333;
const PORT = process.env.PORT || 3333;
const SERVER = process.env.SERVER || '127.0.0.1';
app.listen(PORT, SERVER, () => console.log(`start server at IP ADDRESS:${SERVER} PORT:${PORT}`));
