import { mutationQueueStorage } from './storage';

export interface QueuedMutation {
  id: string;
  type: 'like' | 'unlike' | 'post';
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

const QUEUE_KEY = 'MUTATION_QUEUE';
const MAX_RETRIES = 5;
const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Manages offline mutation queue for operations that should sync when online.
 */
class MutationQueue {
  private getQueue(): QueuedMutation[] {
    const data = mutationQueueStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private saveQueue(queue: QueuedMutation[]): void {
    mutationQueueStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  /**
   * Add a mutation to the queue
   */
  add(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retryCount'>): string {
    const queue = this.getQueue();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    queue.push({
      ...mutation,
      id,
      timestamp: Date.now(),
      retryCount: 0,
    });

    this.saveQueue(queue);
    return id;
  }

  /**
   * Remove a mutation from the queue
   */
  remove(id: string): void {
    const queue = this.getQueue().filter(m => m.id !== id);
    this.saveQueue(queue);
  }

  /**
   * Increment retry count for a mutation
   */
  incrementRetry(id: string): void {
    const queue = this.getQueue().map(m =>
      m.id === id ? { ...m, retryCount: m.retryCount + 1 } : m
    );
    this.saveQueue(queue);
  }

  /**
   * Get all queued mutations, filtering out expired or exhausted entries
   */
  getAll(): QueuedMutation[] {
    const queue = this.getQueue();
    const now = Date.now();
    const valid = queue.filter(m =>
      m.retryCount < MAX_RETRIES && (now - m.timestamp) < EXPIRATION_MS
    );
    if (valid.length !== queue.length) {
      this.saveQueue(valid);
    }
    return valid;
  }

  /**
   * Get count of pending mutations
   */
  getCount(): number {
    return this.getAll().length;
  }

  /**
   * Clear the entire queue
   */
  clear(): void {
    this.saveQueue([]);
  }
}

export const mutationQueue = new MutationQueue();
export default mutationQueue;
