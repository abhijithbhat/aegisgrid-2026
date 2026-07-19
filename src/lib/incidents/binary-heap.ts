/**
 * A generic binary min-heap.
 *
 * `compare(a, b) < 0` means `a` is removed before `b`.
 * - peek: O(1)
 * - push: O(log n)
 * - pop: O(log n)
 * - heap construction: O(n)
 */
export class BinaryHeap<T> {
  private readonly values: T[];

  constructor(
    private readonly compare: (a: T, b: T) => number,
    initialValues: Iterable<T> = [],
  ) {
    this.values = Array.from(initialValues);
    for (let index = Math.floor(this.values.length / 2) - 1; index >= 0; index -= 1) {
      this.siftDown(index);
    }
  }

  get size(): number {
    return this.values.length;
  }

  get isEmpty(): boolean {
    return this.values.length === 0;
  }

  peek(): T | undefined {
    return this.values[0];
  }

  push(value: T): void {
    this.values.push(value);
    this.siftUp(this.values.length - 1);
  }

  pop(): T | undefined {
    if (this.values.length === 0) return undefined;
    if (this.values.length === 1) return this.values.pop();

    const first = this.values[0];
    const last = this.values.pop();
    if (last !== undefined) {
      this.values[0] = last;
      this.siftDown(0);
    }
    return first;
  }

  clear(): void {
    this.values.length = 0;
  }

  toArray(): T[] {
    return [...this.values];
  }

  /** Returns priority order without mutating this heap. O(n log n). */
  toSortedArray(): T[] {
    const clone = new BinaryHeap(this.compare, this.values);
    const result: T[] = [];
    while (!clone.isEmpty) {
      const item = clone.pop();
      if (item !== undefined) result.push(item);
    }
    return result;
  }

  private siftUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[index], this.values[parent]) >= 0) break;
      [this.values[index], this.values[parent]] = [this.values[parent], this.values[index]];
      index = parent;
    }
  }

  private siftDown(startIndex: number): void {
    let index = startIndex;
    const length = this.values.length;

    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let next = index;

      if (left < length && this.compare(this.values[left], this.values[next]) < 0) {
        next = left;
      }
      if (right < length && this.compare(this.values[right], this.values[next]) < 0) {
        next = right;
      }
      if (next === index) return;

      [this.values[index], this.values[next]] = [this.values[next], this.values[index]];
      index = next;
    }
  }
}
