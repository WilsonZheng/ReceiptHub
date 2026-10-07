// 生成 iCalendar（.ics）：把截止日导入手机日历，App 关着也会按时提醒（零后端的提醒方案）
export interface CalEvent {
  uid: string;
  date: string; // YYYY-MM-DD，全天事件
  title: string;
  description: string;
}

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const compact = (iso: string) => iso.replace(/-/g, '');

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// 提醒：提前 7 天和前一天的上午 9 点（全天事件从当天 0 点算起）
const ALARMS = ['-P6DT15H', '-PT15H'];

export function buildIcs(events: CalEvent[], stampIso: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ReceiptHub//Tax deadlines//EN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@receipthub`,
      `DTSTAMP:${compact(stampIso)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description)}`,
    );
    for (const trigger of ALARMS)
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(e.title)}`,
        `TRIGGER:${trigger}`,
        'END:VALARM',
      );
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
