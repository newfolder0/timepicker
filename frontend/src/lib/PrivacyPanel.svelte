<script lang="ts">
  import TelemetryNotice from './TelemetryNotice.svelte'
  import { setConsent, TELEMETRY_ENABLED } from './telemetry'

  let { onclose }: { onclose: () => void } = $props()

  function withdraw() {
    setConsent('denied')
    location.reload()
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="gate" role="dialog" aria-modal="true" aria-labelledby="privacy-title" tabindex="-1">
  <div class="gate-card">
    <h2 id="privacy-title">Privacy &amp; data</h2>
    <p>
      The availability you draw is held in this page's memory and cleared on reload. Your time zone
      choices, and your answer about usage data, are remembered in this browser's local storage.
      There are no cookies.
    </p>
    {#if TELEMETRY_ENABLED}
      <p>
        The hosted tool collects the anonymous usage events listed below. You can withdraw at any
        time; because use of the hosted tool is conditioned on that data, withdrawing takes you back
        to the choice between agreeing and running your own copy.
      </p>
      <TelemetryNotice />
      <p>
        <button type="button" class="link" onclick={withdraw}>
          Withdraw consent (run your own copy)
        </button>
      </p>
    {:else}
      <p>
        This copy of TimePicker sends no usage events. A share link, if you save one, is stored on
        this copy's server until its last block has ended.
      </p>
    {/if}
    <div class="gate-actions">
      <button type="button" class="primary" onclick={onclose}>Close</button>
    </div>
  </div>
</div>
