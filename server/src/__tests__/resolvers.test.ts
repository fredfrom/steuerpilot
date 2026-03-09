import express from "express";
import http from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import request from "supertest";
import { typeDefs } from "../schema/typeDefs.js";
import { resolvers } from "../resolvers/index.js";
import type { ApolloContext } from "../types/context.types.js";

describe("GraphQL resolvers", () => {
  let app: ReturnType<typeof express>;
  let httpServer: http.Server;
  let server: ApolloServer<ApolloContext>;

  beforeAll(async () => {
    app = express();
    httpServer = http.createServer(app);
    server = new ApolloServer<ApolloContext>({ typeDefs, resolvers });
    await server.start();
    app.use(
      "/graphql",
      express.json(),
      expressMiddleware(server, {
        context: async ({ req }): Promise<ApolloContext> => ({ req }),
      })
    );
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("search query", () => {
    it.todo("should return answer and sources for a valid question");
    it.todo("should accept optional steuerart filter");
    it.todo("should require question argument");
  });

  describe("stats query", () => {
    it.todo("should return totalDocuments, lastUpdated, and byCategory");
  });
});
