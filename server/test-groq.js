#!/usr/bin/env node
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("GROQ_API_KEY not set in .env");
  process.exit(1);
}

try {
  const client = new Groq({ apiKey: key });
  console.log("Sending test prompt to llama-3.1-8b-instant...");
  const result = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: "Say hello in German" }],
  });
  console.log("Response:", result.choices[0].message.content);
} catch (err) {
  console.error("API call failed:", err.message);
  process.exit(1);
}
