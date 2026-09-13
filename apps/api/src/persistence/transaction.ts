/**
 * The production adapter passes Prisma's interactive transaction client here.
 * Keeping this dependency-free lets the current Node baseline type-check without
 * claiming that its in-memory BudgetApp is durable.
 */
export type PrismaTransactionHost<Tx> = {
  $transaction<T>(work: (transaction: Tx) => Promise<T>): Promise<T>;
};

export const withPostgresTransaction = <Tx, T>(
  client: PrismaTransactionHost<Tx>,
  work: (transaction: Tx) => Promise<T>,
) => client.$transaction(work);
