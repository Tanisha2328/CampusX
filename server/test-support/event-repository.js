export function createEventRepository() {
  return {
    event: {
      async findMany() { return [] },
      async findFirst() { return null },
      async findUnique() { return null },
      async create() { return null },
      async update() { return null },
      async count() { return 0 },
    },
    eventRegistration: {
      async count() { return 0 },
      async create() { return null },
      async findMany() { return [] },
      async findUnique() { return null },
      async deleteMany() { return { count: 0 } },
    },
    async $transaction(callback) { return callback(this) },
  }
}
