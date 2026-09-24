export type Column<T = unknown> = {
  readonly key: string;
  readonly tableName: string;
  readonly __value?: T;
};

export type DefaultValue = unknown | (() => unknown);

export type Table<
  Row extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly collectionName: string;
  readonly primaryKey: readonly string[];
  readonly autoIncrement?: string;
  readonly uuidField?: string;
  readonly defaults: Readonly<Record<string, DefaultValue>>;
  readonly updatedAtField?: string;
  readonly columns: Readonly<Record<string, Column>>;
  readonly $inferSelect: Row;
  readonly $inferInsert: Partial<Row>;
} & { readonly [Key in keyof Row]: Column<Row[Key]> };

function table<Row extends Record<string, unknown>>(
  name: string,
  fields: readonly (keyof Row & string)[],
  options: {
    primaryKey: readonly (keyof Row & string)[];
    autoIncrement?: keyof Row & string;
    uuidField?: keyof Row & string;
    defaults?: Partial<Record<keyof Row & string, DefaultValue>>;
    updatedAtField?: keyof Row & string;
  },
): Table<Row> {
  const columns = Object.fromEntries(
    fields.map((key) => [key, { key, tableName: name }]),
  ) as Record<string, Column>;
  return {
    collectionName: name,
    primaryKey: options.primaryKey,
    autoIncrement: options.autoIncrement,
    uuidField: options.uuidField,
    defaults: options.defaults ?? {},
    updatedAtField: options.updatedAtField,
    columns,
    ...columns,
  } as Table<Row>;
}

export interface User extends Record<string, unknown> {
  id: string;
  auth0UserId: string | null;
  clerkUserId: string | null;
  clerkDeletedAt: Date | null;
  email: string | null;
  passwordHash: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  preferredName: string | null;
  birthday: string | null;
  struggles: string | null;
  strengths: string | null;
  interests: string | null;
  bio: string | null;
  motivationalQuote: string | null;
  phone: string | null;
  timezone: string | null;
  emailVerifiedAt: Date | null;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const usersTable = table<User>(
  "users",
  [
    "id",
    "auth0UserId",
    "clerkUserId",
    "clerkDeletedAt",
    "email",
    "passwordHash",
    "firstName",
    "lastName",
    "profileImageUrl",
    "preferredName",
    "birthday",
    "struggles",
    "strengths",
    "interests",
    "bio",
    "motivationalQuote",
    "phone",
    "timezone",
    "emailVerifiedAt",
    "onboardedAt",
    "createdAt",
    "updatedAt",
  ],
  {
    primaryKey: ["id"],
    uuidField: "id",
    updatedAtField: "updatedAt",
    defaults: {
      auth0UserId: null,
      clerkUserId: null,
      clerkDeletedAt: null,
      email: null,
      passwordHash: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      preferredName: null,
      birthday: null,
      struggles: null,
      strengths: null,
      interests: null,
      bio: null,
      motivationalQuote: null,
      phone: null,
      timezone: null,
      emailVerifiedAt: null,
      onboardedAt: null,
      createdAt: () => new Date(),
      updatedAt: () => new Date(),
    },
  },
);

export type UpsertUser = Partial<User> & Pick<User, "id">;

export interface Affirmation extends Record<string, unknown> {
  id: number;
  text: string;
  isActive: boolean;
  createdAt: Date;
}

export const affirmationsTable = table<Affirmation>(
  "affirmations",
  ["id", "text", "isActive", "createdAt"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { isActive: true, createdAt: () => new Date() },
  },
);
export type InsertAffirmation = Omit<Affirmation, "id" | "createdAt">;

export interface BetaGrant extends Record<string, unknown> {
  id: string;
  userId: string;
  grantedBy: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

export const betaGrantsTable = table<BetaGrant>(
  "beta_grants",
  [
    "id",
    "userId",
    "grantedBy",
    "grantedAt",
    "expiresAt",
    "revokedAt",
    "revokedBy",
  ],
  {
    primaryKey: ["id"],
    uuidField: "id",
    defaults: {
      grantedBy: null,
      grantedAt: () => new Date(),
      expiresAt: null,
      revokedAt: null,
      revokedBy: null,
    },
  },
);

export interface BodyScan extends Record<string, unknown> {
  id: number;
  userId: string;
  scannedAt: Date;
  feelings: string[];
  energyLevel: number;
  physicalSensations: string | null;
  notes: string | null;
  createdAt: Date;
}

export const bodyScansTable = table<BodyScan>(
  "body_scans",
  [
    "id",
    "userId",
    "scannedAt",
    "feelings",
    "energyLevel",
    "physicalSensations",
    "notes",
    "createdAt",
  ],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: {
      scannedAt: () => new Date(),
      feelings: () => [],
      physicalSensations: null,
      notes: null,
      createdAt: () => new Date(),
    },
  },
);
export type InsertBodyScan = Omit<BodyScan, "id" | "createdAt">;

export interface CalendarConnection extends Record<string, unknown> {
  userId: string;
  provider: string;
  encryptedRefreshToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export const calendarConnectionsTable = table<CalendarConnection>(
  "calendar_connections",
  ["userId", "provider", "encryptedRefreshToken", "createdAt", "updatedAt"],
  {
    primaryKey: ["userId"],
    updatedAtField: "updatedAt",
    defaults: {
      provider: "google",
      createdAt: () => new Date(),
      updatedAt: () => new Date(),
    },
  },
);

export interface Conversation extends Record<string, unknown> {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: Date;
  archivedAt: Date | null;
}

export const conversations = table<Conversation>(
  "conversations",
  ["id", "userId", "title", "status", "createdAt", "archivedAt"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: {
      status: "active",
      createdAt: () => new Date(),
      archivedAt: null,
    },
  },
);
export type InsertConversation = Omit<
  Conversation,
  "id" | "createdAt" | "archivedAt"
>;

export interface DailyUsage extends Record<string, unknown> {
  userId: string;
  date: string;
  count: number;
}

export const dailyUsageTable = table<DailyUsage>(
  "daily_usage",
  ["userId", "date", "count"],
  { primaryKey: ["userId", "date"], defaults: { count: 0 } },
);

export interface EntitlementAudit extends Record<string, unknown> {
  id: string;
  userId: string;
  action: string;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export const entitlementAuditTable = table<EntitlementAudit>(
  "entitlement_audit",
  ["id", "userId", "action", "actorId", "metadata", "createdAt"],
  {
    primaryKey: ["id"],
    uuidField: "id",
    defaults: { actorId: null, metadata: null, createdAt: () => new Date() },
  },
);

export interface EveningReport extends Record<string, unknown> {
  id: number;
  userId: string;
  date: string;
  medicationEffectiveness: number;
  overallMood: string | null;
  wins: string | null;
  challenges: string | null;
  tomorrowIntent: string | null;
  createdAt: Date;
}

export const eveningReportsTable = table<EveningReport>(
  "evening_reports",
  [
    "id",
    "userId",
    "date",
    "medicationEffectiveness",
    "overallMood",
    "wins",
    "challenges",
    "tomorrowIntent",
    "createdAt",
  ],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: {
      overallMood: null,
      wins: null,
      challenges: null,
      tomorrowIntent: null,
      createdAt: () => new Date(),
    },
  },
);
export type InsertEveningReport = Omit<EveningReport, "id" | "createdAt">;

export interface Habit extends Record<string, unknown> {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  targetDays: number;
  startDate: string;
  createdAt: Date;
}

export const habitsTable = table<Habit>(
  "habits",
  [
    "id",
    "userId",
    "name",
    "description",
    "targetDays",
    "startDate",
    "createdAt",
  ],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: {
      description: null,
      targetDays: 90,
      createdAt: () => new Date(),
    },
  },
);
export type InsertHabit = Omit<Habit, "id" | "createdAt">;

export interface HabitEntry extends Record<string, unknown> {
  id: number;
  habitId: number;
  userId: string;
  date: string;
  completed: boolean;
  notes: string | null;
  createdAt: Date;
}

export const habitEntriesTable = table<HabitEntry>(
  "habit_entries",
  ["id", "habitId", "userId", "date", "completed", "notes", "createdAt"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { completed: false, notes: null, createdAt: () => new Date() },
  },
);
export type InsertHabitEntry = Omit<HabitEntry, "id" | "createdAt">;

export interface Medication extends Record<string, unknown> {
  id: number;
  userId: string;
  name: string;
  dosage: string;
  times: string[];
  notes: string | null;
  createdAt: Date;
}

export const medicationsTable = table<Medication>(
  "medications",
  ["id", "userId", "name", "dosage", "times", "notes", "createdAt"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { notes: null, createdAt: () => new Date() },
  },
);

export interface MedicationLog extends Record<string, unknown> {
  id: number;
  medicationId: number;
  userId: string;
  date: string;
  scheduledTime: string;
  takenAt: Date;
  effectiveness: number | null;
}

export const medicationLogsTable = table<MedicationLog>(
  "medication_logs",
  [
    "id",
    "medicationId",
    "userId",
    "date",
    "scheduledTime",
    "takenAt",
    "effectiveness",
  ],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { takenAt: () => new Date(), effectiveness: null },
  },
);

export interface MedicationScheduleEntry extends Record<string, unknown> {
  id: number;
  medicationId: number;
  userId: string;
  scheduledTime: string;
  startDate: string;
  endDate: string | null;
}

export const medicationScheduleEntriesTable = table<MedicationScheduleEntry>(
  "medication_schedule_entries",
  ["id", "medicationId", "userId", "scheduledTime", "startDate", "endDate"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { endDate: null },
  },
);

export interface Message extends Record<string, unknown> {
  id: number;
  conversationId: number;
  userId: string;
  role: string;
  content: string;
  createdAt: Date;
}

export const messages = table<Message>(
  "messages",
  ["id", "conversationId", "userId", "role", "content", "createdAt"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { createdAt: () => new Date() },
  },
);
export type InsertMessage = Omit<Message, "id" | "createdAt">;

export interface MorningLog extends Record<string, unknown> {
  id: number;
  userId: string;
  date: string;
  mentalLoadLevel: string;
  miniGoals: string[];
  notes: string | null;
  createdAt: Date;
}

export const morningLogsTable = table<MorningLog>(
  "morning_logs",
  [
    "id",
    "userId",
    "date",
    "mentalLoadLevel",
    "miniGoals",
    "notes",
    "createdAt",
  ],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { miniGoals: () => [], notes: null, createdAt: () => new Date() },
  },
);
export type InsertMorningLog = Omit<MorningLog, "id" | "createdAt">;

export interface ReminderSettings extends Record<string, unknown> {
  userId: string;
  morningEnabled: boolean;
  morningTime: string;
  medicationEnabled: boolean;
  eveningEnabled: boolean;
  eveningTime: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const reminderSettingsTable = table<ReminderSettings>(
  "reminder_settings",
  [
    "userId",
    "morningEnabled",
    "morningTime",
    "medicationEnabled",
    "eveningEnabled",
    "eveningTime",
    "smsEnabled",
    "emailEnabled",
    "createdAt",
    "updatedAt",
  ],
  {
    primaryKey: ["userId"],
    updatedAtField: "updatedAt",
    defaults: {
      morningEnabled: false,
      morningTime: "08:00",
      medicationEnabled: false,
      eveningEnabled: false,
      eveningTime: "21:00",
      smsEnabled: false,
      emailEnabled: true,
      createdAt: () => new Date(),
      updatedAt: () => new Date(),
    },
  },
);
export type UpsertReminderSettings = Partial<ReminderSettings> &
  Pick<ReminderSettings, "userId">;

export interface ReminderDelivery extends Record<string, unknown> {
  id: number;
  userId: string;
  type: string;
  doseTime: string;
  localDate: string;
  channel: string;
  sentAt: Date;
}

export const reminderDeliveriesTable = table<ReminderDelivery>(
  "reminder_deliveries",
  ["id", "userId", "type", "doseTime", "localDate", "channel", "sentAt"],
  {
    primaryKey: ["id"],
    autoIncrement: "id",
    defaults: { doseTime: "", sentAt: () => new Date() },
  },
);

export const subscriptionStatuses = [
  "pending",
  "active",
  "past_due",
  "cancel_at_period_end",
  "cancelled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export interface Subscription extends Record<string, unknown> {
  userId: string;
  email: string | null;
  status: SubscriptionStatus;
  paymentCustomerId: string | null;
  paymentSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  providerEventAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const subscriptionsTable = table<Subscription>(
  "subscriptions",
  [
    "userId",
    "email",
    "status",
    "paymentCustomerId",
    "paymentSubscriptionId",
    "currentPeriodEnd",
    "providerEventAt",
    "lastCheckedAt",
    "createdAt",
    "updatedAt",
  ],
  {
    primaryKey: ["userId"],
    updatedAtField: "updatedAt",
    defaults: {
      email: null,
      status: "pending",
      paymentCustomerId: null,
      paymentSubscriptionId: null,
      currentPeriodEnd: null,
      providerEventAt: null,
      lastCheckedAt: null,
      createdAt: () => new Date(),
      updatedAt: () => new Date(),
    },
  },
);
export type UpsertSubscription = Partial<Subscription> &
  Pick<Subscription, "userId">;

export interface ProcessedWebhook extends Record<string, unknown> {
  webhookId: string;
  eventType: string;
  processedAt: Date;
}

export const processedWebhooksTable = table<ProcessedWebhook>(
  "processed_webhooks",
  ["webhookId", "eventType", "processedAt"],
  {
    primaryKey: ["webhookId"],
    defaults: { processedAt: () => new Date() },
  },
);

export const allTables = [
  affirmationsTable,
  betaGrantsTable,
  bodyScansTable,
  calendarConnectionsTable,
  conversations,
  dailyUsageTable,
  entitlementAuditTable,
  eveningReportsTable,
  habitEntriesTable,
  habitsTable,
  medicationLogsTable,
  medicationScheduleEntriesTable,
  medicationsTable,
  messages,
  morningLogsTable,
  processedWebhooksTable,
  reminderDeliveriesTable,
  reminderSettingsTable,
  subscriptionsTable,
  usersTable,
] as const;
