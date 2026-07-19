import { Injectable } from "@nestjs/common";

/**
 * Serializes join transitions per Socket.IO id while allowing unrelated sockets to progress in
 * parallel. A newer request invalidates the previous generation as soon as it is submitted, even
 * though its operation remains FIFO behind the currently running transition.
 */
@Injectable()
export class StudioLiveJoinTransitionSequencer {
  private readonly generations = new Map<string, number>();
  private readonly tails = new Map<string, Promise<void>>();
  private generationSequence = 0;

  runLatest<T>(
    socketId: string,
    operation: (generation: number) => Promise<T>
  ): Promise<T> {
    const generation = this.nextGeneration(socketId);
    return this.enqueue(socketId, async () => {
      try {
        return await operation(generation);
      } finally {
        if (this.generations.get(socketId) === generation) {
          this.generations.delete(socketId);
        }
      }
    });
  }

  isCurrent(socketId: string, generation: number): boolean {
    return this.generations.get(socketId) === generation;
  }

  invalidate(socketId: string): void {
    this.generations.delete(socketId);
  }

  clearAll(): void {
    this.generations.clear();
    this.tails.clear();
  }

  private nextGeneration(socketId: string): number {
    // Socket.IO ids can be reused immediately after disconnect. A provider-wide monotonic token
    // prevents an old in-flight operation from matching a replacement socket's first generation.
    this.generationSequence += 1;
    const generation = this.generationSequence;
    this.generations.set(socketId, generation);
    return generation;
  }

  private enqueue<T>(socketId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(socketId) ?? Promise.resolve();
    const run = previous.then(operation);
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.tails.set(socketId, tail);
    void tail.then(() => {
      if (this.tails.get(socketId) === tail) this.tails.delete(socketId);
    });
    return run;
  }
}
