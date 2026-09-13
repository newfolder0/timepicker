<script lang="ts">
  import { DateTime } from 'luxon'
  import {
    app,
    weekStart,
    selectedZones,
    shiftWeek,
    addBlock,
    updateBlock,
    removeBlock,
    type Block,
  } from './state.svelte'
  import { zoneShort } from './timezones'

  const HOUR_PX = 48
  const ROW_MIN = 30 // minutes per snap row
  const ROWS = 48
  const AXIS_COL_PX = 56

  let scrollEl: HTMLDivElement
  let bodyEl: HTMLDivElement

  const zones = $derived(selectedZones())
  const axisWidth = $derived(zones.length * AXIS_COL_PX)
  const start = $derived(weekStart())
  const days = $derived(Array.from({ length: 7 }, (_, i) => start.plus({ days: i })))
  const todayISO = $derived(DateTime.now().setZone(app.baseZone).toISODate())

  // ---- axis labels -------------------------------------------------------

  function axisLabel(hour: number, zone: string): { text: string; shift: number } {
    const t = start.plus({ hours: hour })
    const conv = t.setZone(zone)
    // day shift relative to the base-zone date at this instant
    const d =
      (DateTime.fromISO(conv.toISODate()!).toMillis() -
        DateTime.fromISO(t.toISODate()!).toMillis()) /
      86400000
    return { text: conv.toFormat('HH:mm'), shift: Math.round(d) }
  }

  // ---- geometry ----------------------------------------------------------

  function dayStartMs(d: number): number {
    return days[d].toMillis()
  }
  function dayEndMs(d: number): number {
    return days[d].plus({ days: 1 }).toMillis()
  }

  /** minutes from base-zone midnight of day d, for an instant */
  function minutesIntoDay(ms: number, d: number): number {
    return DateTime.fromMillis(ms).diff(days[d], 'minutes').minutes
  }

  interface Segment {
    block: Block
    day: number
    topPx: number
    heightPx: number
    isStart: boolean
    isEnd: boolean
  }

  const segments = $derived.by((): Segment[] => {
    const out: Segment[] = []
    for (const b of app.blocks) {
      for (let d = 0; d < 7; d++) {
        const ds = dayStartMs(d)
        const de = dayEndMs(d)
        const s = Math.max(b.start, ds)
        const e = Math.min(b.end, de)
        if (e <= s) continue
        const topMin = minutesIntoDay(s, d)
        const botMin = minutesIntoDay(e, d)
        out.push({
          block: b,
          day: d,
          topPx: (topMin / 60) * HOUR_PX,
          heightPx: ((botMin - topMin) / 60) * HOUR_PX,
          isStart: b.start >= ds,
          isEnd: b.end <= de,
        })
      }
    }
    return out
  })

  function blockLabelLines(b: Block): string[] {
    const baseDay = DateTime.fromMillis(b.start, { zone: app.baseZone }).startOf('day')
    return zones.map((z) => {
      const s = DateTime.fromMillis(b.start, { zone: z })
      const e = DateTime.fromMillis(b.end, { zone: z })
      const shift = Math.round(s.startOf('day').diff(baseDay.setZone(z, { keepLocalTime: true }), 'days').days)
      const mark = shift === 0 ? '' : shift > 0 ? ` +${shift}d` : ` ${shift}d`
      return `${s.toFormat('HH:mm')}–${e.toFormat('HH:mm')} ${zoneShort(z)}${mark}`
    })
  }

  // ---- drag interactions -------------------------------------------------

  type DragMode = 'create' | 'move' | 'resize-top' | 'resize-bottom'
  interface DragState {
    mode: DragMode
    blockId: string | null
    anchorDay: number
    anchorRow: number
    anchorX: number
    anchorY: number
    grabRowOffset: number
    durRows: number
    moved: boolean
    preview: { day: number; startRow: number; endRow: number } | null
  }
  let drag: DragState | null = $state(null)
  const MOVE_THRESHOLD_PX = 4

  function isMousePointer(ev: PointerEvent): boolean {
    // touch pointers are left to native scrolling
    return ev.pointerType === 'mouse' || ev.pointerType === 'pen' || ev.pointerType === ''
  }

  function cellFromEvent(ev: PointerEvent): { day: number; row: number } {
    const rect = bodyEl.getBoundingClientRect()
    const dayWidth = (rect.width - axisWidth) / 7
    const day = Math.min(6, Math.max(0, Math.floor((ev.clientX - rect.left - axisWidth) / dayWidth)))
    const row = Math.min(
      ROWS - 1,
      Math.max(0, Math.floor((ev.clientY - rect.top) / (HOUR_PX / 2))),
    )
    return { day, row }
  }

  function rowToMs(day: number, row: number): number {
    return days[day].plus({ minutes: row * ROW_MIN }).toMillis()
  }

  function msToRow(ms: number, day: number): number {
    return Math.round(minutesIntoDay(ms, day) / ROW_MIN)
  }

  function onGridPointerDown(ev: PointerEvent) {
    if (app.readOnly || ev.button !== 0 || !isMousePointer(ev)) return
    const target = ev.target as HTMLElement
    if (target.closest('.block')) return // handled by block handlers
    const { day, row } = cellFromEvent(ev)
    drag = {
      mode: 'create',
      blockId: null,
      anchorDay: day,
      anchorRow: row,
      anchorX: ev.clientX,
      anchorY: ev.clientY,
      grabRowOffset: 0,
      durRows: 1,
      moved: false,
      preview: null, // appears once the pointer actually moves
    }
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
  }

  function onBlockPointerDown(ev: PointerEvent, seg: Segment, mode: DragMode) {
    if (app.readOnly || ev.button !== 0 || !isMousePointer(ev)) return
    ev.stopPropagation()
    const target = ev.target as HTMLElement
    if (target.closest('.block-delete')) return
    const b = seg.block
    const day = seg.day
    const startRow = msToRow(Math.max(b.start, dayStartMs(day)), day)
    const endRow = msToRow(Math.min(b.end, dayEndMs(day)), day)
    const { row } = cellFromEvent(ev)
    drag = {
      mode,
      blockId: b.id,
      anchorDay: day,
      anchorRow: row,
      anchorX: ev.clientX,
      anchorY: ev.clientY,
      grabRowOffset: row - startRow,
      durRows: endRow - startRow,
      moved: false,
      preview: { day, startRow, endRow },
    }
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
  }

  function onWindowPointerMove(ev: PointerEvent) {
    if (!drag) return
    if (
      !drag.moved &&
      Math.abs(ev.clientY - drag.anchorY) < MOVE_THRESHOLD_PX &&
      Math.abs(ev.clientX - drag.anchorX) < MOVE_THRESHOLD_PX
    )
      return
    const { day, row } = cellFromEvent(ev)
    drag.moved = true
    if (drag.mode === 'create') {
      const a = drag.anchorRow
      drag.preview = {
        day: drag.anchorDay,
        startRow: Math.min(a, row),
        endRow: Math.max(a, row) + 1,
      }
    } else if (drag.mode === 'move') {
      let startRow = row - drag.grabRowOffset
      startRow = Math.min(ROWS - drag.durRows, Math.max(0, startRow))
      drag.preview = { day, startRow, endRow: startRow + drag.durRows }
    } else if (drag.mode === 'resize-top') {
      const endRow = drag.preview!.endRow
      drag.preview = { day: drag.preview!.day, startRow: Math.min(row, endRow - 1), endRow }
    } else if (drag.mode === 'resize-bottom') {
      const startRow = drag.preview!.startRow
      drag.preview = {
        day: drag.preview!.day,
        startRow,
        endRow: Math.max(row + 1, startRow + 1),
      }
    }
  }

  function onWindowPointerUp() {
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    if (!drag) return
    const p = drag.preview
    if (p) {
      const startMs = rowToMs(p.day, p.startRow)
      const endMs = rowToMs(p.day, p.endRow)
      if (drag.mode === 'create') {
        addBlock(startMs, endMs)
      } else if (drag.blockId && drag.moved) {
        updateBlock(drag.blockId, startMs, endMs)
      }
    }
    drag = null
  }

  // hide the block being dragged; show preview instead
  const draggedId = $derived.by(() => (drag && drag.mode !== 'create' ? drag.blockId : null))

  const previewLabel = $derived.by(() => {
    if (!drag?.preview) return ''
    const s = rowToMs(drag.preview.day, drag.preview.startRow)
    const e = rowToMs(drag.preview.day, drag.preview.endRow)
    return `${DateTime.fromMillis(s, { zone: app.baseZone }).toFormat('HH:mm')}–${DateTime.fromMillis(e, { zone: app.baseZone }).toFormat('HH:mm')}`
  })

  // ---- now indicator -----------------------------------------------------

  const nowLine = $derived.by(() => {
    const now = DateTime.now().setZone(app.baseZone)
    for (let d = 0; d < 7; d++) {
      if (days[d].toISODate() === now.toISODate()) {
        return { day: d, topPx: (now.diff(days[d], 'minutes').minutes / 60) * HOUR_PX }
      }
    }
    return null
  })

  export function getExportNode(): HTMLElement {
    return scrollEl.parentElement as HTMLElement
  }

  $effect(() => {
    // scroll to 07:00 on mount
    if (scrollEl) scrollEl.scrollTop = 7 * HOUR_PX - 8
  })

  // ---- horizontal swipe pages weeks --------------------------------------

  let wheelAccum = 0
  let wheelCooldownUntil = 0

  function onWheel(ev: WheelEvent) {
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return // vertical: let it scroll
    ev.preventDefault()
    const now = performance.now()
    if (now < wheelCooldownUntil) return
    wheelAccum += ev.deltaX
    if (Math.abs(wheelAccum) > 120) {
      shiftWeek(wheelAccum > 0 ? 1 : -1)
      wheelAccum = 0
      wheelCooldownUntil = now + 500
    }
  }

  $effect(() => {
    if (!scrollEl) return
    // manual listener: needs passive:false so preventDefault stops horizontal scroll
    scrollEl.addEventListener('wheel', onWheel, { passive: false })
    return () => scrollEl.removeEventListener('wheel', onWheel)
  })
</script>

<div class="cal-root" data-export-root>
  <div class="cal-header" style="padding-left: {axisWidth}px">
    <div class="axis-heads" style="width: {axisWidth}px">
      {#each zones as z, i (z)}
        <span class="axis-head" class:base={i === 0} style="width: {AXIS_COL_PX}px">{zoneShort(z)}</span>
      {/each}
    </div>
    {#each days as day (day.toISODate())}
      <div class="day-head" class:today={day.toISODate() === todayISO}>
        <span class="day-name">{day.toFormat('ccc')}</span>
        <span class="day-num">{day.day}</span>
      </div>
    {/each}
  </div>
  <div class="cal-scroll" bind:this={scrollEl}>
    <div
      class="cal-body"
      bind:this={bodyEl}
      style="height: {24 * HOUR_PX}px"
      onpointerdown={onGridPointerDown}
    >
      <div class="axis" style="width: {axisWidth}px">
        {#each { length: 24 } as _, h}
          {#if h > 0}
            <div class="axis-row" style="top: {h * HOUR_PX}px">
              {#each zones as z, i (z)}
                {@const lbl = axisLabel(h, z)}
                <span class="axis-label" class:base={i === 0} style="width: {AXIS_COL_PX}px">
                  {lbl.text}{#if lbl.shift !== 0}<sup>{lbl.shift > 0 ? `+${lbl.shift}` : lbl.shift}</sup>{/if}
                </span>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
      {#each days as day, d (day.toISODate())}
        <div class="day-col" class:today={day.toISODate() === todayISO}>
          {#each segments.filter((s) => s.day === d && s.block.id !== draggedId) as seg (seg.block.id + '-' + seg.day)}
            <div
              class="block"
              class:no-top={!seg.isStart}
              class:no-bottom={!seg.isEnd}
              style="top: {seg.topPx}px; height: {seg.heightPx}px"
              onpointerdown={(ev) => onBlockPointerDown(ev, seg, 'move')}
            >
              {#if seg.isStart && !app.readOnly}
                <div
                  class="resize-handle top"
                  onpointerdown={(ev) => onBlockPointerDown(ev, seg, 'resize-top')}
                ></div>
              {/if}
              <div class="block-label">
                {#each blockLabelLines(seg.block) as line, i}
                  <div class="label-line" class:base={i === 0}>{line}</div>
                {/each}
              </div>
              {#if !app.readOnly}
                <button
                  class="block-delete"
                  title="Delete this block"
                  aria-label="Delete this block"
                  onpointerdown={(ev) => ev.stopPropagation()}
                  onclick={() => removeBlock(seg.block.id)}>×</button
                >
              {/if}
              {#if seg.isEnd && !app.readOnly}
                <div
                  class="resize-handle bottom"
                  onpointerdown={(ev) => onBlockPointerDown(ev, seg, 'resize-bottom')}
                ></div>
              {/if}
            </div>
          {/each}
          {#if drag?.preview && drag.preview.day === d}
            <div
              class="block preview"
              style="top: {(drag.preview.startRow * HOUR_PX) / 2}px; height: {((drag.preview.endRow -
                drag.preview.startRow) *
                HOUR_PX) /
                2}px"
            >
              <div class="block-label"><div class="label-line base">{previewLabel}</div></div>
            </div>
          {/if}
          {#if nowLine && nowLine.day === d}
            <div class="now-line" style="top: {nowLine.topPx}px"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .cal-root {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
    user-select: none;
    -webkit-user-select: none;
  }
  .cal-header {
    display: flex;
    position: relative;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .axis-heads {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
  }
  .axis-head {
    text-align: center;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .axis-head.base {
    color: var(--accent);
  }
  .day-head {
    flex: 1;
    text-align: center;
    padding: 0.35rem 0;
    font-size: 0.8rem;
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .day-head .day-num {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text);
  }
  .day-head.today .day-num {
    background: var(--accent);
    color: #fff;
    border-radius: 999px;
    width: 1.7rem;
    margin: 0 auto;
  }
  .cal-scroll {
    height: 620px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .cal-body {
    display: flex;
    position: relative;
    cursor: crosshair;
  }
  .axis {
    position: relative;
    flex: none;
    border-right: 1px solid var(--border);
    background: var(--surface);
    cursor: default;
  }
  .axis-row {
    position: absolute;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    display: flex;
  }
  .axis-label {
    text-align: center;
    font-size: 0.68rem;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .axis-label.base {
    color: var(--text);
    font-weight: 500;
  }
  .axis-label sup {
    font-size: 0.55em;
    color: var(--accent);
  }
  .day-col {
    flex: 1;
    position: relative;
    border-right: 1px solid var(--border);
    background-image: repeating-linear-gradient(
      to bottom,
      var(--line-hour) 0 1px,
      transparent 1px 24px,
      var(--line-half) 24px 25px,
      transparent 25px 48px
    );
  }
  .day-col:last-child {
    border-right: none;
  }
  .day-col.today {
    background-color: var(--today-tint);
  }
  .block {
    position: absolute;
    left: 2px;
    right: 3px;
    background: var(--block-bg);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    overflow: hidden;
    cursor: grab;
    box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
    z-index: 2;
  }
  .block.no-top {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
  .block.no-bottom {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .block.preview {
    background: var(--block-preview-bg);
    pointer-events: none;
    z-index: 3;
  }
  .block-label {
    padding: 2px 4px;
    font-size: 0.62rem;
    line-height: 1.3;
    color: var(--block-text);
    pointer-events: none;
  }
  .label-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .label-line.base {
    font-weight: 600;
  }
  .block-delete {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--block-text);
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .block:hover .block-delete {
    display: flex;
  }
  .block-delete:hover {
    background: rgb(0 0 0 / 12%);
  }
  .resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
    z-index: 4;
  }
  .resize-handle.top {
    top: 0;
  }
  .resize-handle.bottom {
    bottom: 0;
  }
  .now-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 2px solid var(--now);
    z-index: 5;
    pointer-events: none;
  }
  .now-line::before {
    content: '';
    position: absolute;
    left: -3px;
    top: -5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--now);
  }
</style>
