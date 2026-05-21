import { defineConfig } from 'prisma/config';
import 'dotenv/config'; // Make sure dotenv is installed

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});