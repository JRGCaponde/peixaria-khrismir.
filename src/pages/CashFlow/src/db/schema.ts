import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";

// Enums
export const movementTypeEnum = pgEnum('movement_type', ['income', 'expense', 'transfer']);
export const accountTypeEnum = pgEnum('account_type', ['cash', 'bank', 'mobile']);
export const categoryTypeEnum = pgEnum('category_type', ['income', 'expense']);

// Accounts table
export const accounts = pgTable('cf_accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull().default('0'),
  type: accountTypeEnum('type').notNull().default('cash'),
  color: text('color').notNull().default('#06b6d4'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Categories table
export const categories = pgTable('cf_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: categoryTypeEnum('type').notNull(),
  color: text('color').notNull().default('#6b7280'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Movements table
export const movements = pgTable('cf_movements', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  type: movementTypeEnum('type').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  category: text('category').notNull().default(''),
  account: text('account').notNull(),
  accountTo: text('account_to'),
  reference: text('reference'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types derived from schema
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Movement = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;
