import mongoose from "mongoose";

const appMetaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
  },
  { collection: "app_meta" }
);

export const AppMeta = mongoose.model("AppMeta", appMetaSchema);

const LAST_CHECKED_KEY = "lastChecked";

export async function getLastChecked(): Promise<string | null> {
  const doc = await AppMeta.findOne({ key: LAST_CHECKED_KEY }).lean().exec();
  return (doc?.value as string) ?? null;
}

export async function updateLastChecked(): Promise<void> {
  await AppMeta.updateOne(
    { key: LAST_CHECKED_KEY },
    { $set: { value: new Date().toISOString() } },
    { upsert: true }
  ).exec();
}
