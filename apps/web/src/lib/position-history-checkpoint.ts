export type PositionHistoryCheckpointDraft = Readonly<{ date: string; time: string }>;

const kyivCivilPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/;
const editorDatePattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const editorTimePattern = /^\d{2}:\d{2}$/;

export function positionHistoryCheckpointDraft(value: string | null): PositionHistoryCheckpointDraft {
  const match = value?.match(kyivCivilPattern);
  return match ? Object.freeze({ date: `${match[3]}.${match[2]}.${match[1]}`, time: match[4] }) : Object.freeze({ date: "", time: "" });
}

export function positionHistoryCheckpointCivil(draft: PositionHistoryCheckpointDraft): string | null {
  const date = draft.date.match(editorDatePattern);
  if (!date || !editorTimePattern.test(draft.time)) return null;
  return `${date[3]}-${date[2]}-${date[1]}T${draft.time}`;
}
