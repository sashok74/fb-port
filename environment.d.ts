declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: number;
      SERVER: string;
      MODE_ENV: string;
      DB_PORT: number;
      DB_HOST: string;
      DB_NAME: string;
      DB_USER: string;
      DB_PASSWORD: string;
    }
  }
}
export {};
