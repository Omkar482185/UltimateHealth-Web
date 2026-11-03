import {
  TOPIC_DESCRIPTIONS,
  TOPIC_LABELS,
  type TopicId,
} from "@/lib/corpus/sources";
import { getStore } from "@/lib/db/index";

/**
 * Real corpus statistics, read from the database.
 *
 * Every number shown in the interface comes from here. There are no illustrative
 * or placeholder figures anywhere in the product.
 */

export type TopicSummaryView = {
  topic: string;
  label: string;
  description: string;
  documentCount: number;
  chunkCount: number;
};

export type CorpusSummary = {
  documentCount: number;
  chunkCount: number;
  publisherCount: number;
  publishers: string[];
  licenceCount: number;
  topics: TopicSummaryView[];
  isEmpty: boolean;
  backend: string;
};

export function getCorpusSummary(): CorpusSummary {
  const store = getStore();
  const documents = store.listDocuments();
  const topicRows = store.listTopics();

  const publishers = Array.from(
    new Set(documents.map((d) => d.publisher)),
  ).sort();
  const licences = new Set(documents.map((d) => d.licence));

  const topics: TopicSummaryView[] = topicRows.map((row) => ({
    topic: row.topic,
    label: TOPIC_LABELS[row.topic as TopicId] ?? row.topic,
    description: TOPIC_DESCRIPTIONS[row.topic as TopicId] ?? "",
    documentCount: row.documentCount,
    chunkCount: row.chunkCount,
  }));

  return {
    documentCount: documents.length,
    chunkCount: store.countChunks(),
    publisherCount: publishers.length,
    publishers,
    licenceCount: licences.size,
    topics,
    isEmpty: documents.length === 0,
    backend: store.backend,
  };
}
