import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  phone: text("phone"),
  propertyInterest: text("property_interest"),
  timeline: text("timeline"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  kind: text("kind").notNull(),
  facing: text("facing"),
  score: real("score"),
  createdAt: integer("created_at").notNull(),
});

export type Lead = typeof leads.$inferSelect;
