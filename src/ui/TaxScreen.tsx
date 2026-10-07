import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
} from 'lucide-react';
import { db } from '../data/db';
import { kindOf, type Receipt } from '../data/types';
import { entertainmentAdjustment, gstReturn } from '../lib/gst';
import { formatNZD } from '../lib/money';
import { formatDate } from '../lib/dates';
import { periodAt, type GstFrequency } from '../lib/periods';
import { receiptChecks, type Check as ReceiptCheck } from '../lib/checks';
import { urgencyOf, type TaxTask } from '../lib/taxCalendar';
import { ackCheck, getAckedChecks, setTaskDone, updateTaxProfile } from '../lib/taxState';
import { GUIDES, GUIDE_FOR_TASK, loc, type GuideId } from '../lib/taxGuides';
import { buildIcs } from '../lib/ics';
import { useLocale, useT, type MsgKey } from '../lib/i18n';
import { ReceiptDetail } from './ReceiptDetail';
import { fill, taskSubtitle, taskTitle, useTaxAgenda, whenText } from './taxAgenda';

const URGENCY_COLOR = {
  overdue: 'var(--color-danger)',
  soon: 'var(--color-warning)',
  later: 'var(--color-ink-muted)',
} as const;

function Pill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="segmented-btn min-h-10 px-3 text-xs"
      style={
        active
          ? { background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }
          : { background: 'var(--color-surface-2)', color: 'var(--color-ink-muted)' }
      }
    >
      {label}
    </button>
  );
}

function Question({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t py-3 first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
      <p className="mt-1 text-xs muted">{hint}</p>
    </div>
  );
}

export function TaxScreen() {
  const { today, profile, all, done, pending } = useTaxAgenda();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [openGuide, setOpenGuide] = useState<GuideId | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    const sub = liveQuery(() => db.receipts.toArray()).subscribe({
      next: (rs) => setReceipts(rs.filter((r) => !r.deleted && r.space === 'company')),
    });
    return () => sub.unsubscribe();
  }, []);

  // 列表：逾期未办 + 今天以后（已完成的也留着打勾显示）
  const list = all.filter((x) => (x.due >= today ? true : !done.has(x.id)));
  const next = pending[0] ?? null;
  const visible = showAll ? list : list.slice(0, 6);

  // 检查范围：上一财年起（还没报完的年份）
  const checksFrom = periodAt(today, 'fy', profile.gstFreq, -1).from;
  const acked = getAckedChecks();
  const checks = receiptChecks(receipts, checksFrom).filter((c) => !acked.has(c.id));
  const byId = useMemo(() => new Map(receipts.map((r) => [r.id, r])), [receipts]);

  /** GST 待办的金额估算 + 财年最后一期的招待费调整 */
  function gstNotes(task: TaxTask): string[] {
    if (task.kind !== 'gst') return [];
    const inPeriod = receipts.filter((r) => r.date >= task.from && r.date <= task.to);
    const net = gstReturn(inPeriod).box15;
    const amount =
      net > 0
        ? fill(t('gstEstimatePay'), { a: formatNZD(net) })
        : net < 0
          ? fill(t('gstEstimateRefund'), { a: formatNZD(-net) })
          : t('gstEstimateNil');
    const note = locale === 'zh' ? `（${t('periodNotOver')}）` : ` (${t('periodNotOver')})`;
    const notes = [today <= task.to ? amount + note : amount];
    // 包含 3 月 31 日的那一期 = 财年最后一期
    const fyEnd = `${task.to.slice(0, 4)}-03-31`;
    if (task.from <= fyEnd && task.to >= fyEnd) {
      const fyFrom = `${Number(fyEnd.slice(0, 4)) - 1}-04-01`;
      const adj = entertainmentAdjustment(
        receipts.filter((r) => r.date >= fyFrom && r.date <= fyEnd),
      );
      if (adj > 0) notes.push(fill(t('entertainmentAdj'), { a: formatNZD(adj) }));
    }
    return notes;
  }

  function showGuide(task: TaxTask) {
    const id = GUIDE_FOR_TASK[task.kind];
    setOpenGuide(id);
    requestAnimationFrame(() =>
      document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth' }),
    );
  }

  function downloadCalendar() {
    const events = pending
      .filter((x) => x.due >= today)
      .map((x) => ({
        uid: x.id,
        date: x.due,
        title: taskTitle(x, locale, t),
        description: [taskSubtitle(x, locale, t), ...gstNotes(x), 'ReceiptHub']
          .filter(Boolean)
          .join('\n'),
      }));
    const blob = new Blob([buildIcs(events, today)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'receipthub-tax-deadlines.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function checkText(c: ReceiptCheck): string {
    const key: Record<ReceiptCheck['kind'], MsgKey> = {
      duplicate: 'checkDuplicate',
      noGst: 'checkNoGst',
      bigInvoice: 'checkBigInvoice',
    };
    return t(key[c.kind]);
  }

  if (openId) return <ReceiptDetail id={openId} onClose={() => setOpenId(null)} />;

  const setupNeeded = profile.provisional === 'unsure' || profile.annualReturnMonth === null;
  const freqTwo = profile.gstFreq === 'two-odd' || profile.gstFreq === 'two-even';
  const setFreq = (f: GstFrequency) => updateTaxProfile({ gstFreq: f });

  return (
    <div className="screen-wrap flex max-w-3xl flex-col gap-3 py-2">
      {/* 下一件事 */}
      <section className="panel panel-pad">
        <h3 className="section-title">{t('nextUp')}</h3>
        {next ? (
          <>
            <p
              className="mt-1 text-sm font-semibold"
              style={{ color: URGENCY_COLOR[urgencyOf(next.due, today)] }}
            >
              {formatDate(next.due, locale)} · {whenText(next.due, today, t)}
            </p>
            <p className="mt-1 text-lg font-bold leading-snug">{taskTitle(next, locale, t)}</p>
            {[taskSubtitle(next, locale, t), ...gstNotes(next)].filter(Boolean).map((line) => (
              <p key={line} className="mt-1 text-sm muted">
                {line}
              </p>
            ))}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setTaskDone(next.id, true)}
                className="btn-primary flex-1 text-sm"
              >
                <Check className="icon" aria-hidden="true" />
                {t('markDone')}
              </button>
              <button onClick={() => showGuide(next)} className="btn-secondary min-h-[52px] flex-1">
                {t('howTo')}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm muted">{t('allDone')}</p>
        )}
        {setupNeeded && (
          <p className="mt-3 flex gap-1.5 text-xs" style={{ color: 'var(--color-warning)' }}>
            <CircleAlert className="icon mt-px" aria-hidden="true" />
            {t('setupNeeded')}
          </p>
        )}
      </section>

      {/* 需要核对的票据（规则检查） */}
      {checks.length > 0 && (
        <section className="panel panel-pad">
          <h3 className="section-title mb-1">
            {t('checksTitle')} · {checks.length}
          </h3>
          <ul className="flex flex-col">
            {checks.map((c) => (
              <li
                key={c.id}
                className="border-t py-2 first:border-t-0"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--color-warning)' }}>
                  {checkText(c)}
                </p>
                {c.receiptIds.map((rid) => {
                  const r = byId.get(rid);
                  if (!r) return null;
                  return (
                    <button
                      key={rid}
                      onClick={() => setOpenId(rid)}
                      className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {r.merchant}{' '}
                        <span className="text-xs muted">{formatDate(r.date, locale)}</span>
                      </span>
                      <span className="amount flex shrink-0 items-center gap-1">
                        {kindOf(r) === 'income' ? '+' : '-'}
                        {formatNZD(r.totalCents)}
                        <ChevronRight className="icon muted" aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => ackCheck(c.id)}
                  className="btn-secondary mt-1 min-h-9 px-3 py-1 text-xs"
                >
                  <Check className="icon" aria-hidden="true" />
                  {t('looksFine')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 接下来：截止日列表，可打勾 */}
      <section className="panel panel-pad">
        <h3 className="section-title mb-1">{t('comingUp')}</h3>
        <ul className="flex flex-col">
          {visible.map((x) => {
            const isDone = done.has(x.id);
            const urgency = urgencyOf(x.due, today);
            return (
              <li
                key={x.id}
                className="flex items-start gap-3 border-t py-2.5 first:border-t-0"
                style={{ borderColor: 'var(--color-border)', opacity: isDone ? 0.5 : 1 }}
              >
                <button
                  onClick={() => setTaskDone(x.id, !isDone)}
                  aria-pressed={isDone}
                  aria-label={isDone ? t('markUndone') : t('markDone')}
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                  style={
                    isDone
                      ? {
                          background: 'var(--color-accent)',
                          borderColor: 'var(--color-accent)',
                          color: 'var(--color-accent-ink)',
                        }
                      : { borderColor: 'var(--color-ink-muted)' }
                  }
                >
                  {isDone && <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button onClick={() => showGuide(x)} className="min-w-0 flex-1 text-left">
                  <span
                    className="block text-xs font-semibold"
                    style={{ color: isDone ? 'var(--color-ink-muted)' : URGENCY_COLOR[urgency] }}
                  >
                    {formatDate(x.due, locale)} ·{' '}
                    {isDone ? t('doneLabel') : whenText(x.due, today, t)}
                  </span>
                  <span
                    className="block text-sm font-semibold"
                    style={{ textDecoration: isDone ? 'line-through' : undefined }}
                  >
                    {taskTitle(x, locale, t)}
                  </span>
                  {!isDone &&
                    [taskSubtitle(x, locale, t), ...gstNotes(x)].filter(Boolean).map((line) => (
                      <span key={line} className="block text-xs muted">
                        {line}
                      </span>
                    ))}
                </button>
              </li>
            );
          })}
        </ul>
        {list.length > 6 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="btn-secondary mt-1 w-full text-xs"
            aria-expanded={showAll}
          >
            {showAll ? t('showFewer') : t('showAll')}
          </button>
        )}
        <button onClick={downloadCalendar} className="btn-secondary mt-2 w-full">
          <CalendarPlus className="icon" aria-hidden="true" />
          {t('addToCalendar')}
        </button>
        <p className="mt-1 text-center text-xs muted">{t('calendarHint')}</p>
      </section>

      {/* 流程指南 */}
      <section className="panel panel-pad">
        <h3 className="section-title mb-1">{t('guidesTitle')}</h3>
        {GUIDES.map((g) => {
          const open = openGuide === g.id;
          return (
            <div
              key={g.id}
              id={`guide-${g.id}`}
              className="border-t first:border-t-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                onClick={() => setOpenGuide(open ? null : g.id)}
                aria-expanded={open}
                className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">{loc(g.title, locale)}</span>
                  <span className="block text-xs muted">{loc(g.summary, locale)}</span>
                </span>
                <ChevronDown
                  className="icon shrink-0 muted"
                  style={{
                    transform: open ? 'rotate(180deg)' : undefined,
                    transition: 'transform .2s cubic-bezier(.32,.72,0,1)',
                  }}
                  aria-hidden="true"
                />
              </button>
              {open && (
                <div className="screen-in pb-3">
                  <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                    {g.steps.map((s, i) => (
                      <li key={i}>{loc(s, locale)}</li>
                    ))}
                  </ol>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {g.links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary min-h-9 px-3 py-1 text-xs"
                      >
                        {loc(l.label, locale)}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 你的情况：决定出现哪些截止日 */}
      <section className="panel panel-pad">
        <h3 className="section-title">{t('profileTitle')}</h3>
        <p className="text-xs muted">{t('profileHint')}</p>
        <div className="mt-1">
          <Question label={t('gstFiling')} hint={t('gstFilingHint')}>
            <Pill
              active={profile.gstFreq === 'monthly'}
              label={t('freqMonthly')}
              onClick={() => setFreq('monthly')}
            />
            <Pill
              active={freqTwo}
              label={t('freqTwo')}
              onClick={() => !freqTwo && setFreq('two-odd')}
            />
            <Pill
              active={profile.gstFreq === 'six'}
              label={t('freqSix')}
              onClick={() => setFreq('six')}
            />
          </Question>
          {freqTwo && (
            <Question label={t('periodEnds')} hint="">
              <Pill
                active={profile.gstFreq === 'two-odd'}
                label={t('oddMonths')}
                onClick={() => setFreq('two-odd')}
              />
              <Pill
                active={profile.gstFreq === 'two-even'}
                label={t('evenMonths')}
                onClick={() => setFreq('two-even')}
              />
            </Question>
          )}
          <Question label={t('taxAgentQ')} hint={t('taxAgentHint')}>
            <Pill
              active={profile.hasAgent}
              label={t('optYes')}
              onClick={() => updateTaxProfile({ hasAgent: true })}
            />
            <Pill
              active={!profile.hasAgent}
              label={t('optNo')}
              onClick={() => updateTaxProfile({ hasAgent: false })}
            />
          </Question>
          <Question label={t('provisionalQ')} hint={t('provisionalHint')}>
            {(
              [
                ['no', 'provNo'],
                ['standard', 'provStandard'],
                ['unsure', 'provUnsure'],
              ] as const
            ).map(([v, k]) => (
              <Pill
                key={v}
                active={profile.provisional === v}
                label={t(k)}
                onClick={() => updateTaxProfile({ provisional: v })}
              />
            ))}
          </Question>
          <Question label={t('payeQ')} hint={t('payeHint')}>
            <Pill
              active={profile.payeEmployer}
              label={t('optYes')}
              onClick={() => updateTaxProfile({ payeEmployer: true })}
            />
            <Pill
              active={!profile.payeEmployer}
              label={t('optNo')}
              onClick={() => updateTaxProfile({ payeEmployer: false })}
            />
          </Question>
          <Question label={t('annualReturnQ')} hint={t('annualReturnHint')}>
            <select
              value={profile.annualReturnMonth ?? ''}
              onChange={(e) =>
                updateTaxProfile({
                  annualReturnMonth: e.target.value ? Number(e.target.value) : null,
                })
              }
              aria-label={t('annualReturnQ')}
              className="field"
              // .field 不在 @layer 里，尺寸工具类会被盖掉——内联
              style={{ minHeight: 40, width: 'auto', paddingTop: 4, paddingBottom: 4 }}
            >
              <option value="">{t('monthUnknown')}</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-NZ', {
                    month: 'long',
                  }).format(new Date(2026, i, 1))}
                </option>
              ))}
            </select>
          </Question>
        </div>
      </section>

      <p className="px-1 pb-4 text-xs muted">{t('taxDisclaimer')}</p>
    </div>
  );
}
