<script lang="ts">
  import { onMount } from 'svelte'
  import { DateTime } from 'luxon'
  import { app } from './lib/state.svelte'
  import { cfg } from './lib/telemetry'
  import ConsentGate from './lib/ConsentGate.svelte'
  import PrivacyPanel from './lib/PrivacyPanel.svelte'
  import WeekNav from './lib/WeekNav.svelte'
  import TzSelector from './lib/TzSelector.svelte'
  import CalendarGrid from './lib/CalendarGrid.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import TextList from './lib/TextList.svelte'

  let grid: CalendarGrid | null = $state(null)
  let loadingShare = $state(false)
  let shareLoadError: string | null = $state(null)
  let privacyOpen = $state(false)

  const slugMatch = location.pathname.match(/^\/([a-z2-9]{5})$/)
  const licenceUrl = `${cfg.selfHostUrl.replace(/\/+$/, '')}/blob/main/LICENSE`

  onMount(async () => {
    if (!slugMatch) return
    loadingShare = true
    try {
      const res = await fetch(`/api/share/${slugMatch[1]}`)
      if (res.status === 404) throw new Error('This link does not exist.')
      if (res.status === 410) throw new Error('This availability has expired and was deleted.')
      if (!res.ok) throw new Error('Could not load this link.')
      const data = await res.json()
      app.readOnly = true
      app.baseZone = data.zones.base
      app.secondZone = data.zones.second ?? null
      app.thirdZone = data.zones.third ?? null
      app.blocks = data.blocks.map((b: { start: number; end: number }, i: number) => ({
        id: `s${i}`,
        start: b.start,
        end: b.end,
      }))
      if (app.blocks.length > 0) {
        app.weekStartISO = DateTime.fromMillis(app.blocks[0].start, { zone: app.baseZone })
          .startOf('week')
          .toISODate()!
      }
    } catch (e) {
      shareLoadError = e instanceof Error ? e.message : 'Could not load this link.'
    } finally {
      loadingShare = false
    }
  })
</script>

<ConsentGate>
  <main>
    <header class="top">
      <h1>TimePicker</h1>
      {#if app.readOnly}
        <span class="ro-badge">Shared availability - read only</span>
      {/if}
      <WeekNav />
    </header>

    {#if shareLoadError}
      <div class="load-error">
        <p>{shareLoadError}</p>
        <a href="/">Create your own availability →</a>
      </div>
    {:else if loadingShare}
      <p class="loading">Loading shared availability…</p>
    {:else}
      {#if !app.readOnly}
        <section class="tz-panel">
          <TzSelector />
        </section>
      {/if}

      <CalendarGrid bind:this={grid} />

      <section class="actions">
        <Toolbar exportNode={() => grid?.getExportNode() ?? null} />
      </section>

      <TextList />
    {/if}

    <footer class="disclaimer" role="note">
      <p>
        <strong>⚠ AI-built tool.</strong> This web app was developed using AI and has not been
        carefully vetted for security or correctness by a human. Check every time and time zone
        before you send your availability to anyone; the author accepts no liability for missed or
        mis-timed meetings.
        {#if cfg.contactEmail}
          Report bugs: <a href="mailto:{cfg.contactEmail}">{cfg.contactEmail}</a> ·
        {/if}
        <button type="button" class="link" onclick={() => (privacyOpen = true)}>
          Privacy &amp; data
        </button>
      </p>
      <p class="local-note">
        Your availability stays in this page and is cleared on reload, unless you press Save &amp;
        get link. No cookies; your time zone choices are remembered in this browser only.
      </p>
      <p class="copyright">
        TimePicker {cfg.version === 'dev' ? '' : `${cfg.version} `}© 2026 Peter Bell Electronics Ltd ·
        free software under the
        <a href={licenceUrl} target="_blank" rel="noopener noreferrer">MIT Licence</a>, with no
        warranty.
      </p>
    </footer>
  </main>

  {#if privacyOpen}
    <PrivacyPanel onclose={() => (privacyOpen = false)} />
  {/if}
</ConsentGate>

<style>
  main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 1rem 1.2rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
    letter-spacing: -0.01em;
  }
  .ro-badge {
    background: var(--accent);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
  }
  .tz-panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    padding: 0.6rem 0.9rem;
  }
  .actions {
    display: flex;
  }
  .load-error {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    padding: 1.2rem;
    text-align: center;
  }
  .loading {
    color: var(--text-dim);
  }
  .disclaimer {
    margin-top: 1rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--border);
    font-size: 0.76rem;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .disclaimer p {
    margin: 0 0 0.35rem;
  }
  .disclaimer strong {
    color: var(--text);
  }
  .disclaimer a {
    color: var(--accent);
  }
  .disclaimer .local-note {
    color: var(--ok);
  }
  @media print {
    .disclaimer {
      display: none;
    }
  }
</style>
