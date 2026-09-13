<script lang="ts">
  import { app, weekStart, shiftWeek, goToday } from './state.svelte'

  const start = $derived(weekStart())
  const end = $derived(start.plus({ days: 6 }))
  const range = $derived(
    start.month === end.month
      ? `${start.day}–${end.day} ${end.toFormat('MMM yyyy')}`
      : start.year === end.year
        ? `${start.toFormat('d MMM')} – ${end.toFormat('d MMM yyyy')}`
        : `${start.toFormat('d MMM yyyy')} – ${end.toFormat('d MMM yyyy')}`,
  )
</script>

<div class="weeknav">
  <button class="nav-btn" onclick={() => shiftWeek(-1)} title="Previous week" aria-label="Previous week">&#8249;</button>
  <button class="nav-btn today-btn" onclick={goToday} title="Jump to current week">Today</button>
  <button class="nav-btn" onclick={() => shiftWeek(1)} title="Next week" aria-label="Next week">&#8250;</button>
  <span class="week-label">
    <strong>Week {start.weekNumber}</strong>
    <span class="week-range">{range}</span>
  </span>
</div>

<style>
  .weeknav {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .nav-btn {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    font-size: 1rem;
    line-height: 1.2;
    cursor: pointer;
  }
  .nav-btn:hover {
    background: var(--surface-hover);
  }
  .today-btn {
    font-size: 0.85rem;
  }
  .week-label {
    margin-left: 0.6rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    white-space: nowrap;
  }
  .week-range {
    color: var(--text-dim);
    font-size: 0.9rem;
  }
</style>
