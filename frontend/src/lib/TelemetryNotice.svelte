<script lang="ts">
  import { cfg } from './telemetry'
</script>

<div class="telemetry-notice">
  <p class="tn-head">The ONLY usage data collected:</p>
  <ul>
    <li>The date and time of the request (set by the server).</li>
    <li>The app version (currently {cfg.version}).</li>
    <li>
      Which action happened: page opened, calendar image downloaded, availability text copied, or
      image and text copied together.
    </li>
  </ul>

  <p class="tn-head">Your IP address is never stored</p>
  <p>
    Your IP address and browser identifier are used <strong>only</strong> to make a temporary daily
    code, so I can estimate how many different people use the tool each day. Neither they nor that
    code are <strong>ever stored</strong>; only the anonymous daily total is kept. No location lookup
    is done.
  </p>

  <p class="tn-head">Plain counters</p>
  <p>
    The server also counts, per day, how many times the page is loaded and share links are created
    or opened. These are bare numbers, with nothing recorded about who caused them.
  </p>

  <p class="tn-head">Share links</p>
  <p>
    Your availability only leaves this page when you press <strong>Save &amp; get link</strong>. The
    link stores the block times and zone names and nothing else, and is deleted automatically once
    its last block has ended.
  </p>

  <p class="tn-head">This is never collected:</p>
  <ul>
    <li>Your availability blocks or time zones, as usage data.</li>
    <li>Your location or country, your stored IP address, or your browser/device details.</li>
    <li>Cookies or any cross-site trackers.</li>
    <li>Anything that identifies you personally.</li>
  </ul>

  <p class="small">
    <!-- explicit spaces: Svelte trims whitespace at the edges of {#if} blocks -->
    The usage data is anonymous and aggregated.{#if cfg.dataController}{' '}Data controller:
      {cfg.dataController}.{/if}{#if cfg.contactEmail}{' '}Contact:
      <a href="mailto:{cfg.contactEmail}">{cfg.contactEmail}</a>.{/if}
    Raw events are deleted after {cfg.retentionDays} days; only aggregate counts are kept.
  </p>
</div>
