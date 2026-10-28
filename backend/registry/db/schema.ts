import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const registrations=sqliteTable('registrations',{
 claimId:text('claim_id').primaryKey(),
 plan:text('plan').notNull(),
 slot:integer('slot'),
 nameKey:text('name_key').notNull(),
 sessionToken:text('session_token').notNull(),
 role:text('role').notNull(),
 displayName:text('display_name').notNull(),
 annotatorId:text('annotator_id').notNull(),
 createdAt:text('created_at').notNull(),
 releasedAt:text('released_at'),
 releasedBy:text('released_by'),
 releaseId:text('release_id')
},table=>[
 uniqueIndex('active_slot').on(table.plan,table.slot).where(sql`${table.releasedAt} IS NULL`),
 uniqueIndex('active_name').on(table.plan,table.nameKey).where(sql`${table.releasedAt} IS NULL`),
 uniqueIndex('active_annotator').on(table.plan,table.annotatorId).where(sql`${table.releasedAt} IS NULL`)
]);