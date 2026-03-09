import { gql } from '@apollo/client'

export const SEARCH_QUERY = gql`
  query Search($question: String!, $steuerart: String) {
    search(question: $question, steuerart: $steuerart) {
      answer
      sources {
        title
        date
        gz
        steuerart
        bmfUrl
        relevanceScore
        tldr
      }
    }
  }
`

export const STATS_QUERY = gql`
  query Stats {
    stats {
      totalDocuments
      lastUpdated
      byCategory {
        steuerart
        count
      }
    }
  }
`

export interface Source {
  title: string
  date: string
  gz: string
  steuerart: string
  bmfUrl: string
  relevanceScore: number
  tldr: string | null
}

export interface SearchData {
  search: {
    answer: string
    sources: Source[]
  }
}

export interface CategoryCount {
  steuerart: string
  count: number
}

export interface StatsData {
  stats: {
    totalDocuments: number
    lastUpdated: string
    byCategory: CategoryCount[]
  }
}
