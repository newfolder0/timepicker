<script lang="ts">
  import { app, persist } from './state.svelte'
  import { QUICK_ZONES, ALL_ZONES } from './timezones'

  type RowKey = 'base' | 'second' | 'third'

  const rows: { key: RowKey; label: string; optional: boolean }[] = [
    { key: 'base', label: 'Base', optional: false },
    { key: 'second', label: 'Second', optional: true },
    { key: 'third', label: 'Third', optional: true },
  ]

  function get(key: RowKey): string | null {
    if (key === 'base') return app.baseZone
    if (key === 'second') return app.secondZone
    return app.thirdZone
  }

  function set(key: RowKey, value: string | null) {
    if (key === 'base') {
      if (!value) return
      app.baseZone = value
    } else if (key === 'second') {
      app.secondZone = value
    } else {
      app.thirdZone = value
    }
    persist()
  }

  function usedElsewhere(iana: string, key: RowKey): boolean {
    return rows.some((r) => r.key !== key && get(r.key) === iana)
  }

  function isQuick(iana: string | null): boolean {
    return iana != null && QUICK_ZONES.some((q) => q.iana === iana)
  }
</script>

<div class="tz-selector">
  {#each rows as row (row.key)}
    {@const value = get(row.key)}
    <div class="tz-row">
      <span class="tz-role">{row.label}</span>
      <div class="tz-options">
        {#if row.optional}
          <label class="tz-opt">
            <input
              type="radio"
              name="tz-{row.key}"
              checked={value === null}
              disabled={app.readOnly}
              onchange={() => set(row.key, null)}
            />
            <span>None</span>
          </label>
        {/if}
        {#each QUICK_ZONES as q (q.iana)}
          <label class="tz-opt" class:unavailable={usedElsewhere(q.iana, row.key)}>
            <input
              type="radio"
              name="tz-{row.key}"
              checked={value === q.iana}
              disabled={app.readOnly || usedElsewhere(q.iana, row.key)}
              onchange={() => set(row.key, q.iana)}
            />
            <span>{q.label}</span>
          </label>
        {/each}
        <select
          class="tz-other"
          disabled={app.readOnly}
          value={value !== null && !isQuick(value) ? value : ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value
            if (v) set(row.key, v)
          }}
        >
          <option value="" disabled>Other…</option>
          {#each ALL_ZONES as z (z)}
            {#if !usedElsewhere(z, row.key)}
              <option value={z}>{z.replace(/_/g, ' ')}</option>
            {/if}
          {/each}
        </select>
      </div>
    </div>
  {/each}
</div>

<style>
  .tz-selector {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .tz-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .tz-role {
    width: 4.6rem;
    flex: none;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tz-options {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-wrap: wrap;
  }
  .tz-opt {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    font-size: 0.85rem;
    padding: 0.18rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .tz-opt:hover {
    background: var(--surface-hover);
  }
  .tz-opt.unavailable {
    opacity: 0.4;
    cursor: default;
  }
  .tz-opt input {
    accent-color: var(--accent);
    margin: 0;
  }
  .tz-other {
    font-size: 0.8rem;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    max-width: 10rem;
  }
</style>
