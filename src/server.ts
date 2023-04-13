import app from './app.js';
import * as dotenv from 'dotenv';
import { handleExit } from './modules/db.js';

dotenv.config();

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) =>
  process.on(signal, () => {
    handleExit();
    process.exit();
  }),
);

const PORT = process.env.PORT || 3333;
const SERVER = process.env.SERVER || '127.0.0.1';
app.listen(PORT, SERVER, () => console.log(`start server at IP ADDRESS:${SERVER} PORT:${PORT}`));
