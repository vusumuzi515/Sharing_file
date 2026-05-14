import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { startHttpServer } from './src/httpServer.js';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(backendRoot, '.env') });

startHttpServer();
