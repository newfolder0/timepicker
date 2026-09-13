<script lang="ts">
  import type { Snippet } from 'svelte'
  import TelemetryNotice from './TelemetryNotice.svelte'
  import {
    cfg,
    getConsent,
    setConsent,
    TELEMETRY_ENABLED,
    trackAppOpen,
    type Consent,
  } from './telemetry'

  let { children }: { children: Snippet } = $props()

  let consent: Consent | null = $state(getConsent())

  // directory `git clone` creates - derived from the URL so it cannot drift
  const repoDir = cfg.selfHostUrl.replace(/\/+$/, '').split('/').pop() || 'timepicker'

  $effect(() => {
    if (TELEMETRY_ENABLED && consent === 'granted') trackAppOpen()
  })

  function choose(next: Consent) {
    setConsent(next)
    consent = next
  }
</script>

{#if !TELEMETRY_ENABLED || consent === 'granted'}
  {@render children()}
{:else}
  <div class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" tabindex="-1">
    <div class="gate-card">
      {#if consent === 'denied'}
        <h2 id="gate-title">No problem - run your own copy</h2>
        <p>
          The hosted version is available only with anonymous usage statistics enabled; that is what
          pays for the server. TimePicker is free, open-source software, and a copy you run yourself
          sends <strong>nothing</strong> to this server.
        </p>
        <p>
          Get the source and run it with Docker:
          <a href={cfg.selfHostUrl} target="_blank" rel="noopener noreferrer">{cfg.selfHostUrl}</a>
        </p>
        <pre class="selfhost-cmd">git clone {cfg.selfHostUrl}
cd {repoDir}
docker build -t timepicker .
docker run -d -p 127.0.0.1:3000:3000 -v timepicker-data:/app/server/data timepicker
# then open http://localhost:3000</pre>
        {#if cfg.contactEmail}
          <p class="small">
            Questions? <a href="mailto:{cfg.contactEmail}">{cfg.contactEmail}</a>
          </p>
        {/if}
        <div class="gate-actions">
          <button type="button" class="primary" onclick={() => choose('granted')}>
            Changed your mind? Agree and use the hosted tool
          </button>
        </div>
      {:else}
        <h2 id="gate-title">Before you use this tool</h2>
        <p>
          This tool was developed with the assistance of AI and has not been carefully vetted for
          security or correctness by a human. Your calendar and the time zone conversions are worked
          out entirely in your browser. It is provided as is, without warranty of any kind, express
          or implied.
        </p>
        <p>
          <strong>
            Check every time and time zone yourself before you send your availability to anyone. To
            the fullest extent permitted by law, the author accepts no liability for missed or
            mis-timed meetings, or any direct or consequential loss arising from use of this tool.
          </strong>
        </p>
        {#if cfg.contactEmail}
          <p>
            To report bugs or concerns: <a href="mailto:{cfg.contactEmail}">{cfg.contactEmail}</a>
          </p>
        {/if}

        <div class="telemetry-box">
          <h3>This free tool is funded by anonymous usage data</h3>
          <p>
            Running this server costs me money and I offer the hosted version for
            <strong>free</strong>. In return I collect a small amount of <strong>anonymous</strong>
            usage data; honestly, I am just curious how it is being used.
            <strong>That data is the price of using the free, hosted tool.</strong>
          </p>
          <p>
            If you do not consent, TimePicker is free, open-source software: run your own copy with
            Docker. It works the same and sends <strong>nothing</strong> to this server.
          </p>
          <TelemetryNotice />
        </div>

        <div class="gate-actions">
          <button type="button" class="primary" onclick={() => choose('granted')}>
            Agree and use the tool
          </button>
          <button type="button" class="link" onclick={() => choose('denied')}>
            Do not consent - run my own copy
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
