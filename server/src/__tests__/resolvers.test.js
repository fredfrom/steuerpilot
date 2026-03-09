import express from "express";
import http from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import request from "supertest";
import { typeDefs } from "../schema/typeDefs.js";
import { resolvers } from "../resolvers/index.js";

describe("GraphQL resolvers", () => {
  let app;
  let httpServer;
  let server;

  beforeAll(async () => {
    app = express();
    httpServer = http.createServer(app);
    server = new ApolloServer({ typeDefs, resolvers });
    await server.start();
    app.use(
      "/graphql",
      express.json(),
      expressMiddleware(server, {
        context: async ({ req }) => ({ req }),
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
