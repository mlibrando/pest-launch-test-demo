// Next.js loads .env.local automatically; standalone scripts don't. Import this first.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
