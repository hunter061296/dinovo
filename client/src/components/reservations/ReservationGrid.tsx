import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { api, apiErrorMessage } from "../../lib/api";
import type { Reservation, ReservationFormValues, Shift } from "../../lib/reservations";
import { STATUS_LABELS, STATUS_STYLES, reservationTableIds } from "../../lib/reservations";
import type { RestaurantTable, Section, TableBlock } from "../../lib/tables";
import { dayOfWeekFor } from "../../lib/pacing";
import { assignLanes, formatClock, formatHourLabel, gridRange, isoAtMinutes, minutesFromDayStart, snap, type Span } from "../../lib/grid";
import { todayLocalISODate } from "../DateSwitcher";
import { BlockTableModal } from "./BlockTableModal";

const PX_PER_MIN = 2; // 30 minutes = 60px
const LANE_H = 40;
const SECTION_H = 26;
const HEADER_H = 32;
const LABEL_W = 112;
const DRAG_THRESHOLD_PX = 4;

// Cancelled and no-show parties never held a table, so they'd only clutter the grid.
const HIDDEN_STATUSES = new Set(["CANCELLED", "NO_SHOW"]);

type RowKind = "unassigned" | "section" | "table";

interface Row {
  key: string;
  kind: RowKind;
  label: string;
  table?: RestaurantTable;
  top: number;
  height: number;
  bars: { span: Span; lane: number; reservation?: Reservation; block?: TableBlock }[];
}

interface Drag {
  reservation: Reservation;
  mode: "move" | "resize";
  originRowKey: string;
  originX: number;
  originY: number;
  start: number;
  duration: number;
  moved: boolean;
  // Live preview while dragging.
  previewStart: number;
  previewDuration: number;
  previewRowKey: string;
}

function spanOf(r: Reservation, date: string): Span {
  const start = minutesFromDayStart(r.dateTime, date);
  return { start, end: start + r.effectiveDurationMinutes };
}

interface Props {
  date: string;
  reservations: Reservation[];
  shifts: Shift[];
  onOpenReservation: (r: Reservation) => void;
}

// Tables down the side, time across the top: each party is a bar as long as it holds its table(s).
// Drag a bar to move it to another time or table, drag its right edge to change how long it holds
// the table, tap it to open it. Tap empty space on a table's row to block that table.
export function ReservationGrid({ date, reservations, shifts, onOpenReservation }: Props) {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Holds a dropped bar at its new position until the server answers, so it doesn't snap back.
  const [pending, setPending] = useState<Pick<Drag, "reservation" | "previewStart" | "previewDuration" | "previewRowKey"> | null>(null);
  const [blockModal, setBlockModal] = useState<{ block?: TableBlock; tableId?: string; startMinutes?: number } | null>(null);

  const { data: tables } = useQuery<RestaurantTable[]>({
    queryKey: ["tables"],
    queryFn: () => api.get("/tables").then((res) => res.data),
  });
  const { data: sections } = useQuery<Section[]>({
    queryKey: ["sections"],
    queryFn: () => api.get("/sections").then((res) => res.data),
  });
  const { data: blocks } = useQuery<TableBlock[]>({
    queryKey: ["table-blocks", date],
    queryFn: () => api.get("/table-blocks", { params: { date } }).then((res) => res.data),
  });

  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<ReservationFormValues> }) => api.patch(`/reservations/${id}`, values),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservations", date] });
      setPending(null);
    },
  });

  const visible = useMemo(() => reservations.filter((r) => !HIDDEN_STATUSES.has(r.status)), [reservations]);

  const range = useMemo(() => {
    const dow = dayOfWeekFor(date);
    const shiftSpans = shifts.filter((s) => s.dayOfWeek === dow).map((s) => ({ start: s.startMinutes, end: s.endMinutes }));
    const itemSpans = [
      ...visible.map((r) => spanOf(r, date)),
      ...(blocks ?? []).map((b) => ({ start: Math.max(0, minutesFromDayStart(b.startsAt, date)), end: minutesFromDayStart(b.endsAt, date) })),
    ];
    return gridRange(shiftSpans, itemSpans);
  }, [date, shifts, visible, blocks]);

  const width = (range.end - range.start) * PX_PER_MIN;
  const x = (minutes: number) => (minutes - range.start) * PX_PER_MIN;

  // Row layout, top to bottom: Unassigned lane, then tables grouped by section.
  const rows = useMemo(() => {
    const result: Row[] = [];
    let top = 0;
    const push = (row: Omit<Row, "top" | "height">, laneCount: number, height?: number) => {
      const h = height ?? Math.max(1, laneCount) * LANE_H;
      result.push({ ...row, top, height: h });
      top += h;
    };

    const unassigned = visible.filter((r) => reservationTableIds(r).length === 0);
    const unassignedBars = assignLanes(unassigned.map((r) => ({ ...spanOf(r, date), r }))).map(({ item, lane }) => ({
      span: item,
      lane,
      reservation: item.r,
    }));
    push({ key: "unassigned", kind: "unassigned", label: "Unassigned", bars: unassignedBars }, Math.max(...unassignedBars.map((b) => b.lane + 1), 1));

    const sortedTables = [...(tables ?? [])].sort((a, b) => a.number - b.number);
    const groups = [
      ...(sections ?? []).map((s) => ({ key: s.id, name: s.name, tables: sortedTables.filter((t) => t.sectionId === s.id) })),
      { key: "none", name: "No section", tables: sortedTables.filter((t) => !t.sectionId || !sections?.some((s) => s.id === t.sectionId)) },
    ].filter((g) => g.tables.length > 0);

    for (const group of groups) {
      if (groups.length > 1 || group.key !== "none") push({ key: `section:${group.key}`, kind: "section", label: group.name, bars: [] }, 0, SECTION_H);
      for (const table of group.tables) {
        const items = [
          ...visible.filter((r) => reservationTableIds(r).includes(table.id)).map((r) => ({ ...spanOf(r, date), r, b: undefined as TableBlock | undefined })),
          ...(blocks ?? [])
            .filter((b) => b.tableId === table.id)
            .map((b) => ({ start: minutesFromDayStart(b.startsAt, date), end: minutesFromDayStart(b.endsAt, date), r: undefined, b })),
        ];
        const bars = assignLanes(items).map(({ item, lane }) => ({ span: item, lane, reservation: item.r, block: item.b }));
        push({ key: table.id, kind: "table", label: `T${table.number}`, table, bars }, Math.max(...bars.map((b) => b.lane + 1), 1));
      }
    }
    return { list: result, height: top };
  }, [visible, tables, sections, blocks, date]);

  function rowAt(clientY: number): Row | undefined {
    const body = bodyRef.current;
    if (!body) return undefined;
    const y = clientY - body.getBoundingClientRect().top;
    return rows.list.find((row) => y >= row.top && y < row.top + row.height);
  }

  function startDrag(e: ReactPointerEvent, r: Reservation, rowKey: string, mode: Drag["mode"]) {
    e.stopPropagation();
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const span = spanOf(r, date);
    setDrag({
      reservation: r,
      mode,
      originRowKey: rowKey,
      originX: e.clientX,
      originY: e.clientY,
      start: span.start,
      duration: r.effectiveDurationMinutes,
      moved: false,
      previewStart: span.start,
      previewDuration: r.effectiveDurationMinutes,
      previewRowKey: rowKey,
    });
  }

  function moveDrag(e: ReactPointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.originX;
    const dy = e.clientY - drag.originY;
    const moved = drag.moved || Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX;
    if (!moved) return;
    const deltaMinutes = dx / PX_PER_MIN;
    if (drag.mode === "resize") {
      setDrag({ ...drag, moved, previewDuration: Math.max(15, snap(drag.duration + deltaMinutes)) });
    } else {
      const target = rowAt(e.clientY);
      const droppable = target && target.kind !== "section";
      setDrag({ ...drag, moved, previewStart: snap(drag.start + deltaMinutes), previewRowKey: droppable ? target.key : drag.previewRowKey });
    }
  }

  function endDrag() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      onOpenReservation(d.reservation);
      return;
    }

    const values: Partial<ReservationFormValues> = {};
    if (d.mode === "resize") {
      if (d.previewDuration !== d.duration) values.durationMinutes = d.previewDuration;
    } else {
      if (d.previewStart !== d.start) values.dateTime = isoAtMinutes(date, d.previewStart);
      if (d.previewRowKey !== d.originRowKey) {
        const target = rows.list.find((row) => row.key === d.previewRowKey);
        if (target?.kind === "unassigned") {
          Object.assign(values, { tableId: null, combinationId: null });
        } else if (target?.table) {
          if (
            target.table.capacity < d.reservation.partySize &&
            !confirm(`Table ${target.table.number} seats ${target.table.capacity}. Move this party of ${d.reservation.partySize} there anyway?`)
          ) {
            return;
          }
          // Moving onto a single table takes the party off any combination.
          Object.assign(values, { tableId: target.table.id, combinationId: null });
        }
      }
    }
    if (Object.keys(values).length === 0) return;

    setPending({ reservation: d.reservation, previewStart: d.previewStart, previewDuration: d.previewDuration, previewRowKey: d.previewRowKey });
    update.mutate({ id: d.reservation.id, values });
  }

  function handleRowClick(e: ReactMouseEvent, row: Row) {
    if (row.kind !== "table" || !row.table || !bodyRef.current) return;
    const left = e.clientX - bodyRef.current.getBoundingClientRect().left;
    setBlockModal({ tableId: row.table.id, startMinutes: snap(range.start + left / PX_PER_MIN, 30) });
  }

  const ghost = drag?.moved ? drag : pending;
  const ghostRow = ghost ? rows.list.find((row) => row.key === ghost.previewRowKey) : undefined;

  const hours: number[] = [];
  for (let m = range.start; m < range.end; m += 60) hours.push(m);

  const isToday = date === todayLocalISODate();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const errorMessage = apiErrorMessage(update.error, "Couldn't move that reservation");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Drag a party to change its time or table · drag its right edge to change its table time · tap empty space to block a table.
        </p>
        <button
          onClick={() => setBlockModal({})}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Block a table
        </button>
      </div>

      {errorMessage && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {errorMessage}
          <button onClick={() => update.reset()} className="text-xs font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div style={{ width: LABEL_W + width }} className="relative">
          {/* Time header */}
          <div className="sticky top-0 z-20 flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900" style={{ width: LABEL_W }} />
            <div className="relative" style={{ width }}>
              {hours.map((m) => (
                <div key={m} className="absolute top-0 flex h-full items-center pl-1.5 text-xs font-medium text-gray-500 dark:text-gray-400" style={{ left: x(m) }}>
                  {formatHourLabel(m)}
                </div>
              ))}
            </div>
          </div>

          <div className="flex">
            {/* Row labels */}
            <div className="sticky left-0 z-10 shrink-0 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" style={{ width: LABEL_W }}>
              {rows.list.map((row) => (
                <div
                  key={row.key}
                  style={{ height: row.height }}
                  className={
                    row.kind === "section"
                      ? "flex items-end bg-gray-50 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400"
                      : "flex items-center border-b border-gray-100 px-3 text-sm dark:border-gray-700"
                  }
                >
                  {row.kind === "table" && row.table ? (
                    <span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{row.label}</span>{" "}
                      <span className="text-xs text-gray-400 dark:text-gray-500">· {row.table.capacity}</span>
                    </span>
                  ) : row.kind === "unassigned" ? (
                    <span className="font-medium text-gray-500 dark:text-gray-400">{row.label}</span>
                  ) : (
                    row.label
                  )}
                </div>
              ))}
            </div>

            {/* Timeline body */}
            <div
              ref={bodyRef}
              className="relative"
              style={{
                width,
                height: rows.height,
                // Quarter-hour lines, darker on the hour.
                backgroundImage: `repeating-linear-gradient(to right, var(--grid-hour) 0 1px, transparent 1px ${60 * PX_PER_MIN}px), repeating-linear-gradient(to right, var(--grid-quarter) 0 1px, transparent 1px ${15 * PX_PER_MIN}px)`,
                backgroundPositionX: `${-(range.start % 60) * PX_PER_MIN}px`,
              }}
            >
              {rows.list.map((row) => (
                <div
                  key={row.key}
                  onClick={(e) => handleRowClick(e, row)}
                  className={`absolute left-0 right-0 ${
                    row.kind === "section"
                      ? "bg-gray-50/80 dark:bg-gray-900/80"
                      : `border-b border-gray-100 dark:border-gray-700 ${row.kind === "table" ? "cursor-cell" : ""} ${
                          drag?.moved && drag.mode === "move" && drag.previewRowKey === row.key ? "bg-accent-50/60 dark:bg-accent-800/20" : ""
                        }`
                  }`}
                  style={{ top: row.top, height: row.height }}
                >
                  {row.bars.map(({ span, lane, reservation: r, block }) => {
                    const left = x(span.start);
                    const barWidth = Math.max(8, (span.end - span.start) * PX_PER_MIN - 2);
                    const style = { left, width: barWidth, top: lane * LANE_H + 3, height: LANE_H - 6 };

                    if (block) {
                      return (
                        <button
                          key={`block-${block.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBlockModal({ block });
                          }}
                          title={`Blocked ${formatClock(span.start)} – ${formatClock(span.end)}${block.reason ? ` · ${block.reason}` : ""}`}
                          className="absolute overflow-hidden rounded-md border border-dashed border-gray-400 px-2 text-left text-xs font-medium text-gray-600 dark:border-gray-500 dark:text-gray-300"
                          style={{
                            ...style,
                            backgroundImage: "repeating-linear-gradient(135deg, var(--grid-block) 0 6px, transparent 6px 12px)",
                          }}
                        >
                          <span className="truncate">Blocked{block.reason ? ` · ${block.reason}` : ""}</span>
                        </button>
                      );
                    }

                    if (!r) return null;
                    const isDragging = (drag?.moved && drag.reservation.id === r.id) || pending?.reservation.id === r.id;
                    // Bars for a party that's finished are read-only; a seated party can't be moved
                    // to a new time, only given more or less table time.
                    const canMove = r.status === "BOOKED";
                    const canResize = r.status === "BOOKED" || r.status === "SEATED";
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => (canMove ? startDrag(e, r, row.key, "move") : e.stopPropagation())}
                        onPointerMove={moveDrag}
                        onPointerUp={canMove ? endDrag : undefined}
                        onPointerCancel={() => setDrag(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canMove) onOpenReservation(r);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") onOpenReservation(r);
                        }}
                        title={`${r.guest.firstName} ${r.guest.lastName} · party of ${r.partySize} · ${formatClock(span.start)} – ${formatClock(span.end)} · ${STATUS_LABELS[r.status]}`}
                        className={`absolute flex select-none items-center overflow-hidden rounded-md border px-2 text-xs shadow-sm ${STATUS_STYLES[r.status]} ${
                          canMove ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"
                        } ${r.status === "COMPLETED" ? "opacity-60" : ""} ${isDragging ? "opacity-30" : ""}`}
                        style={style}
                      >
                        <span className="truncate">
                          <span className="font-semibold">
                            {r.guest.firstName} {r.guest.lastName}
                          </span>{" "}
                          · {r.partySize}
                          {r.combination && <span className="opacity-70"> · ⛓ {r.combination.tables.map((t) => t.number).join("+")}</span>}
                        </span>
                        {canResize && (
                          <span
                            aria-label="Change table time"
                            onPointerDown={(e) => startDrag(e, r, row.key, "resize")}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={() => setDrag(null)}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize touch-none bg-current opacity-0 hover:opacity-20"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Drag preview / pending-save ghost */}
              {ghost && ghostRow && (
                <div
                  className={`pointer-events-none absolute z-10 flex items-center overflow-hidden rounded-md border-2 border-accent-500 px-2 text-xs font-semibold shadow-md ${STATUS_STYLES[ghost.reservation.status]}`}
                  style={{
                    top: ghostRow.top + 3,
                    height: LANE_H - 6,
                    left: x(ghost.previewStart),
                    width: Math.max(8, ghost.previewDuration * PX_PER_MIN - 2),
                  }}
                >
                  <span className="truncate">
                    {formatClock(ghost.previewStart)} – {formatClock(ghost.previewStart + ghost.previewDuration)} · {ghost.reservation.guest.firstName}{" "}
                    {ghost.reservation.guest.lastName}
                  </span>
                </div>
              )}

              {isToday && nowMinutes >= range.start && nowMinutes <= range.end && (
                <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-red-500/80" style={{ left: x(nowMinutes) }} aria-hidden />
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {blockModal && (
          <BlockTableModal
            key="block-modal"
            date={date}
            block={blockModal.block}
            initialTableId={blockModal.tableId}
            initialStartMinutes={blockModal.startMinutes}
            onClose={() => setBlockModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
