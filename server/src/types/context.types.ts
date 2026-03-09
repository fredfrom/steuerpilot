import type { Request } from "express";

export interface ApolloContext {
  req: Request;
}
