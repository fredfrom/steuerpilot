import { gql } from "graphql-tag";

export const typeDefs = gql`
  type Query {
    search(question: String!, steuerart: String): SearchResult!
    stats: IndexStats!
  }

  type SearchResult {
    answer: String!
    sources: [Source!]!
  }

  type Source {
    title: String!
    date: String!
    gz: String!
    steuerart: String!
    bmfUrl: String!
    relevanceScore: Float!
  }

  type IndexStats {
    totalDocuments: Int!
    lastUpdated: String!
    byCategory: [CategoryCount!]!
  }

  type CategoryCount {
    steuerart: String!
    count: Int!
  }
`;
