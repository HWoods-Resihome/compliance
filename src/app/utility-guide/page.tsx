import {
  listRows,
  getTableId,
  COLUMNS,
  PAY_OPTIONS,
  HubSpotNotConfiguredError,
  type TrackerRow,
} from "@/lib/utilityTracker";
import { Tracker } from "./tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function UtilityGuidePage() {
  let rows: TrackerRow[] = [];
  let error: string | null = null;
  let configured = true;
  let hasTable = true;

  try {
    hasTable = !!(await getTableId());
    if (hasTable) rows = await listRows();
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) configured = false;
    else error = (err as Error).message;
  }

  return (
    <Tracker
      initialRows={rows}
      columns={COLUMNS}
      payOptions={PAY_OPTIONS}
      error={error}
      configured={configured}
      hasTable={hasTable}
    />
  );
}
