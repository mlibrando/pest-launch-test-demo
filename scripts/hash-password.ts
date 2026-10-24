// Usage: yarn hash-password '<password>'
// Prints the env lines to paste into .env.local.
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/auth/password";

const password = process.argv[2];
if (!password) {
    console.error("Usage: yarn hash-password '<password>'");
    process.exit(1);
}

console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
console.log(`JWT_SECRET=${randomBytes(32).toString("base64url")}`);
