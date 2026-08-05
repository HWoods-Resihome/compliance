import {
  listRows,
  sheetMeta,
  sheetByKey,
  PAY_OPTIONS,
  HubSpotNotConfiguredError,
  type TrackerRow,
} from "@/lib/utilityTracker";
import { Tracker } from "./tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_SHEET = "drc";

export default async function UtilityGuidePage() {
  const sheets = sheetMeta();
  let initialRows: TrackerRow[] = [];
  let error: string | null = null;
  let configured = true;

  try {
    const sheet = sheetByKey(DEFAULT_SHEET)!;
    initialRows = await listRows(sheet);
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) configured = false;
    else error = (err as Error).message;
  }

  return (
    <Tracker
      sheets={sheets}
      defaultSheet={DEFAULT_SHEET}
      initialRows={initialRows}
      payOptions={PAY_OPTIONS}
      error={error}
      configured={configured}
    />
  );
}
