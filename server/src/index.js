import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./resolvers/index.js";
import { connectDB } from "./config/db.js";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

await server.start();

app.use(
  "/graphql",
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => ({ req }),
  })
);

await connectDB();

await new Promise((resolve) =>
  httpServer.listen({ port: process.env.PORT || 4000 }, resolve)
);
console.log(
  `🚀 Server ready at http://localhost:${process.env.PORT || 4000}/graphql`
);
