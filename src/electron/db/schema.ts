import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const kopa = sqliteTable('kopa', {
  id: text('id').primaryKey(),
})
