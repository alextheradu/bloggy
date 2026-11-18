import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const providerEnum = pgEnum('auth_provider', ['github', 'hca']);
export const postStatusEnum = pgEnum('post_status', ['draft', 'published', 'unlisted']);

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    provider: providerEnum('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    username: text('username'),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_provider_uid').on(t.provider, t.providerUserId)],
);

export const sessions = pgTable(
  'sessions',
  {
    // sha-256(token) hex; the raw token only ever lives in the cookie
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull().default(''),
    excerpt: text('excerpt').notNull().default(''),
    // TipTap JSON is the source of truth; html is a render cache.
    contentJson: jsonb('content_json').notNull().default({ type: 'doc', content: [] }),
    contentHtml: text('content_html').notNull().default(''),
    contentText: text('content_text').notNull().default(''),
    readingMinutes: integer('reading_minutes').notNull().default(1),
    coverImage: text('cover_image'),
    status: postStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('posts_slug_idx').on(t.slug),
    index('posts_status_published_idx').on(t.status, t.publishedAt),
  ],
);

export const reactions = pgTable(
  'reactions',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // unicode emoji as the literal character(s), custom emoji as ":name:"
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId, t.emoji] }),
    index('reactions_post_idx').on(t.postId, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostStatus = (typeof postStatusEnum.enumValues)[number];
