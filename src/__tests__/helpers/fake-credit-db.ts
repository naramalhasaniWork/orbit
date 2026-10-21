/**
 * In-memory stand-in for the workspace row and credit_transactions, with a
 * row lock that behaves like SELECT ... FOR UPDATE: a transaction that locks
 * waits for the previous holder's transaction to finish. `lock: false` makes
 * the lock a no-op, to show what the lock prevents.
 */

export interface FakeCreditRow {
  workspaceId: string;
  type: string;
  amount: number;
  balance: number;
  description?: string;
  testRunId?: string;
  metadata?: Record<string, unknown>;
}

interface FakeWorkspace {
  creditsCurrent: number;
  creditsRollover: number;
  creditsPurchased: number;
  creditsGranted: number;
  creditBalance: number;
  rolloverExpiresAt: Date | null;
}

interface FindWhere {
  type?: string;
  testRunId?: string;
  metadata?: { path: string[]; equals: unknown };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createFakeCreditDb(
  initial: { current: number; rollover?: number; purchased?: number; granted?: number },
  { lock = true }: { lock?: boolean } = {}
) {
  const workspace: FakeWorkspace = {
    creditsCurrent: initial.current,
    creditsRollover: initial.rollover ?? 0,
    creditsPurchased: initial.purchased ?? 0,
    creditsGranted: initial.granted ?? initial.current,
    creditBalance: initial.current + (initial.rollover ?? 0) + (initial.purchased ?? 0),
    rolloverExpiresAt: null,
  };
  const rows: FakeCreditRow[] = [];
  let lockTail: Promise<void> = Promise.resolve();

  const matches = (row: FakeCreditRow, where: FindWhere) =>
    (where.type === undefined || row.type === where.type) &&
    (where.testRunId === undefined || row.testRunId === where.testRunId) &&
    (where.metadata === undefined || row.metadata?.[where.metadata.path[0]] === where.metadata.equals);

  async function $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    let release = () => {};
    const done = new Promise<void>((resolve) => (release = resolve));
    const tx = {
      $queryRaw: async () => {
        if (lock) {
          const previous = lockTail;
          lockTail = previous.then(() => done);
          await previous;
        }
        await tick();
        return [];
      },
      workspace: {
        findUniqueOrThrow: async () => {
          await tick();
          return { ...workspace };
        },
        update: async ({ data }: { data: Partial<FakeWorkspace> }) => {
          await tick();
          Object.assign(workspace, data);
          return { ...workspace };
        },
      },
      creditTransaction: {
        findFirst: async ({ where }: { where: FindWhere }) => {
          await tick();
          return rows.find((r) => matches(r, where)) ?? null;
        },
        create: async ({ data }: { data: FakeCreditRow }) => {
          rows.push(data);
          return data;
        },
      },
      testRun: { update: async () => ({}) },
    };
    try {
      return await fn(tx);
    } finally {
      release();
    }
  }

  return { workspace, rows, $transaction };
}
