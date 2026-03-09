import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import cron from "node-cron";
import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./resolvers/index.js";
import { connectDB } from "./config/db.js";
import type { ApolloContext } from "./types/context.types.js";

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const httpServer = http.createServer(app);

// Security headers
app.use(helmet());

const server = new ApolloServer<ApolloContext>({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  // Never expose stack traces to the client
  includeStacktraceInErrorResponses: false,
});

await server.start();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// CORS — restrict to known origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

// Rate limiting — 20 requests per minute per IP
const graphqlLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-6",
  legacyHeaders: false,
  message: {
    errors: [
      {
        message:
          "Zu viele Anfragen. Bitte warten Sie einen Moment.",
      },
    ],
  },
});

app.use(
  "/graphql",
  graphqlLimiter,
  cors({ origin: allowedOrigins }),
  express.json({ limit: "10kb" }),
  expressMiddleware(server, {
    context: async ({ req }): Promise<ApolloContext> => ({ req }),
  })
);

await connectDB();

// Schedule daily RSS ingestion via node-cron
const cronSchedule = process.env.CRON_SCHEDULE ?? "0 6 * * *";
if (cronSchedule !== "disabled") {
  const scriptPath = path.resolve(__dirname, "../../scripts/ingest.ts");
  cron.schedule(cronSchedule, () => {
    console.error(`[cron] RSS ingestion triggered at ${new Date().toISOString()}`);
    // Spawn as child process — scripts/ has its own rootDir and dependencies
    const child = spawn("npx", ["tsx", scriptPath], {
      cwd: path.resolve(__dirname, "../../scripts"),
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => {
      console.error(`[cron] RSS ingestion exited with code ${String(code ?? "unknown")}`);
    });
    child.on("error", (error: Error) => {
      console.error(`[cron] RSS ingestion spawn error: ${error.message}`);
    });
  });
  console.error(`[cron] Scheduled RSS ingestion: ${cronSchedule}`);
}

const PORT = process.env.PORT ?? 4000;
await new Promise<void>((resolve) =>
  httpServer.listen({ port: PORT }, resolve)
);
console.error(`Server ready at http://localhost:${String(PORT)}/graphql`);
