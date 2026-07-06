"use client";

import { useRef, useState } from "react";
import type { TableShape } from "@menu/schemas";

// Virtual canvas + tile geometry (#15). Positions are stored in canvas units and
// rendered as percentages so the plan scales with its container for free.
export const CANVAS_W = 1000;
export const CANVAS_H = 700;
const SNAP = 25;
const SUBMITTED_RED_MIN = 15; // amber < 15min, red >= 15min

export type FloorTile = {
  id: string;
  name: string;
  x: number;
  y: number;
  shape: TableShape;
  active?: boolean; // admin: dim inactive tables
  sessionId?: string | null; // staff: open session state
  oldestSubmittedAt?: number | null; // staff: oldest submitted order timestamp
  totalLabel?: string | null;
  checkLabel?: string | null;
};

type Visual = { color: "gray" | "green" | "amber" | "red"; minutes: number | null };

/** Staff tile colour + elapsed-minutes label from the open-session state. */
export function tileVisual(t: FloorTile, now: number): Visual {
  if (!t.sessionId) return { color: "gray", minutes: null };
  if (t.oldestSubmittedAt == null) return { color: "green", minutes: null };
  const minutes = Math.floor((now - t.oldestSubmittedAt) / 60000);
  return { color: minutes >= SUBMITTED_RED_MIN ? "red" : "amber", minutes };
}

const COLOR_CLASS: Record<Visual["color"], string> = {
  gray: "bg-gray-200 border-gray-300 text-gray-600",
  green: "bg-green-100 border-green-400 text-green-900",
  amber: "bg-amber-100 border-amber-400 text-amber-900",
  red: "bg-red-100 border-red-400 text-red-900",
};

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

type Props = {
  tiles: FloorTile[];
  editable: boolean;
  now?: number; // staff: current time for the minutes label
  busyId?: string | null; // staff: tile whose session is opening
  pannable?: boolean; // admin: keep the plan at real size on small screens
  onTap?: (tile: FloorTile) => void; // staff: open session; admin: open action panel
  onMove?: (id: string, x: number, y: number) => void; // admin: drag end
};

const TAP_PX = 5; // pointer travel under this (client px) is a tap, not a drag

/** Shared floor plan (#15): read-only for staff, pointer-drag editable for admin. */
export function FloorCanvas({ tiles, editable, now = Date.now(), busyId, pannable = false, onTap, onMove }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; startCX: number; startCY: number } | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * CANVAS_W, CANVAS_W),
      y: clamp(((clientY - rect.top) / rect.height) * CANVAS_H, CANVAS_H),
    };
  };

  const onPointerDown = (e: React.PointerEvent, tile: FloorTile) => {
    if (!editable || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toCanvas(e.clientX, e.clientY);
    setDrag({ id: tile.id, x: p.x, y: p.y, startCX: e.clientX, startCY: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toCanvas(e.clientX, e.clientY);
    setDrag({ ...drag, x: p.x, y: p.y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.startCX, e.clientY - drag.startCY);
    if (moved < TAP_PX) {
      onTap?.(tiles.find((t) => t.id === drag.id)!);
    } else {
      onMove?.(drag.id, clamp(snap(drag.x), CANVAS_W), clamp(snap(drag.y), CANVAS_H));
    }
    setDrag(null);
  };

  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pannable || e.button !== 1) return;
    e.preventDefault();
    const el = wrapperRef.current!;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPan({ x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop });
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pan) return;
    const el = wrapperRef.current!;
    el.scrollLeft = pan.left - (e.clientX - pan.x);
    el.scrollTop = pan.top - (e.clientY - pan.y);
  };
  const stopPan = () => setPan(null);
  const canvas = (
    <div
      ref={canvasRef}
      data-testid="floor-canvas"
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? onPointerUp : undefined}
      className="relative w-full rounded-2xl border border-gray-200 bg-white overflow-hidden select-none"
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, minWidth: pannable ? CANVAS_W : undefined }}
    >
      {tiles.map((tile) => {
        const pos = drag && drag.id === tile.id ? drag : tile;
        const isCircle = tile.shape === "circle";
        // Colour-code by session state in both views. Inactive admin tiles are dimmed gray regardless.
        const dimmed = editable && tile.active === false;
        const visual = dimmed ? { color: "gray" as const, minutes: null } : tileVisual(tile, now);
        const colorClass = COLOR_CLASS[visual.color];
        const common = "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center border font-bold text-sm shadow-sm";
        return (
          <button
            key={tile.id}
            type="button"
            data-testid={`table-${tile.id}`}
            disabled={busyId === tile.id}
            onPointerDown={editable ? (e) => onPointerDown(e, tile) : undefined}
            onClick={editable ? undefined : () => onTap?.(tile)}
            className={`${common} ${colorClass} ${isCircle ? "rounded-full" : "rounded-lg"} ${dimmed ? "opacity-40" : ""} ${editable ? "cursor-grab active:cursor-grabbing touch-none" : "disabled:opacity-50"}`}
            style={{
              left: `${(pos.x / CANVAS_W) * 100}%`,
              top: `${(pos.y / CANVAS_H) * 100}%`,
              width: isCircle ? "7%" : "9%",
              aspectRatio: isCircle ? "1" : `${90 / 60}`,
            }}
          >
            <span>{tile.name}</span>
            {visual?.minutes != null && (
              <span data-testid={`table-mins-${tile.id}`} className="text-xs font-semibold">{visual.minutes}m</span>
            )}
            {tile.totalLabel && <span data-testid={`table-total-${tile.id}`} className="text-[11px] font-semibold">{tile.totalLabel}</span>}
            {tile.checkLabel && <span data-testid={`table-check-${tile.id}`} className="text-[10px] rounded-full bg-white/70 px-1.5 font-semibold">{tile.checkLabel}</span>}
          </button>
        );
      })}
    </div>
  );

  if (!pannable) return canvas;

  return (
    <div
      ref={wrapperRef}
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
      className="w-full overflow-auto rounded-2xl touch-pan-x touch-pan-y"
      style={{ cursor: pan ? "grabbing" : undefined }}
    >
      {canvas}
    </div>
  );
}
