<script lang="ts">
  import { activeShareUrl, app, selectedZones } from './state.svelte'
  import { ATTRIBUTION_PREFIX, buildTextList, SHARE_PREFIX, SITE_URL } from './format'

  const lines = $derived(buildTextList(app.blocks, selectedZones()))
  const shareUrl = $derived(activeShareUrl())
</script>

<div class="textlist">
  <h2>Availability as text</h2>
  {#if lines.length === 0}
    <p class="empty">Drag on the calendar to add availability blocks - the list updates here in real time.</p>
  {:else}
    <ul>
      {#each lines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
    {#if shareUrl}
      <p class="credit">
        {SHARE_PREFIX} <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
      </p>
    {:else}
      <p class="credit">
        {ATTRIBUTION_PREFIX} <a href={SITE_URL} target="_blank" rel="noreferrer">{SITE_URL}</a>
      </p>
    {/if}
  {/if}
</div>

<style>
  .textlist {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    padding: 0.8rem 1rem;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-dim);
  }
  .empty {
    margin: 0;
    color: var(--text-dim);
    font-size: 0.9rem;
  }
  ul {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.92rem;
    line-height: 1.65;
    font-variant-numeric: tabular-nums;
  }
  .credit {
    margin: 0.7rem 0 0;
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .credit a {
    color: var(--accent);
  }
</style>
