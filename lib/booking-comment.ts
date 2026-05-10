const TIME_LABEL_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ParsedBookingComment = {
  placeLabel: string;
  slotLabel?: string;
  note?: string;
  telegram?: string;
  tableId?: string;
  roomName?: string;
};

export function parseBookingComment(comment?: string | null): ParsedBookingComment {
  const parts = (comment || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const placeLabel = parts[0] || "Без точки";
  const slotLabel = parts[1] && TIME_LABEL_PATTERN.test(parts[1]) ? parts[1] : undefined;
  const extras = parts.slice(slotLabel ? 2 : 1);

  const parsed: ParsedBookingComment = {
    placeLabel,
    slotLabel
  };
  const noteParts: string[] = [];

  for (const item of extras) {
    if (item.startsWith("TG:")) {
      parsed.telegram = item.replace("TG:", "").trim() || undefined;
      continue;
    }

    if (item.startsWith("TABLE_ID:")) {
      parsed.tableId = item.replace("TABLE_ID:", "").trim() || undefined;
      continue;
    }

    if (item.startsWith("ROOM:")) {
      parsed.roomName = item.replace("ROOM:", "").trim() || undefined;
      continue;
    }

    noteParts.push(item);
  }

  if (noteParts.length > 0) {
    parsed.note = noteParts.join(" | ");
  }

  return parsed;
}

export function buildBookingComment(input: {
  placeLabel: string;
  slotLabel?: string | null;
  note?: string | null;
  telegram?: string | null;
  tableId?: string | null;
  roomName?: string | null;
}) {
  return [
    input.placeLabel,
    input.slotLabel || "",
    input.note || "",
    input.telegram ? `TG: ${input.telegram}` : "",
    input.roomName ? `ROOM: ${input.roomName}` : "",
    input.tableId ? `TABLE_ID: ${input.tableId}` : ""
  ]
    .filter(Boolean)
    .join(" | ");
}
