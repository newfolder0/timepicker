<script lang="ts">
  import { toBlob } from 'html-to-image'
  import { activeShareUrl, app, clearBlocks, selectedZones, shareSignature } from './state.svelte'
  import { buildCopyText } from './format'
  import { track } from './telemetry'

  interface Props {
    exportNode: () => HTMLElement | null
  }
  let { exportNode }: Props = $props()

  let flash: Record<string, string> = $state({})
  let shareError: string | null = $state(null)
  let sharing = $state(false)

  // null again as soon as the calendar is edited, so a stale link is never advertised
  const shareUrl = $derived(activeShareUrl())

  function showFlash(key: string, msg: string) {
    flash[key] = msg
    setTimeout(() => {
      delete flash[key]
    }, 2200)
  }

  async function renderPng(): Promise<Blob> {
    const node = exportNode()
    if (!node) throw new Error('calendar not ready')
    // crop to the hours visible on screen: html-to-image clones the DOM without
    // scroll offsets, so bake the offset in as a transform for the capture
    const scroller = node.querySelector('.cal-scroll') as HTMLElement | null
    const body = scroller?.querySelector('.cal-body') as HTMLElement | null
    const prevScroll = scroller?.scrollTop ?? 0
    const prevTransform = body?.style.transform ?? ''
    const prevOverflow = scroller?.style.overflowY ?? ''
    if (scroller && body) {
      body.style.transform = `translateY(-${prevScroll}px)`
      scroller.style.overflowY = 'hidden'
      scroller.scrollTop = 0
    }
    try {
      const blob = await toBlob(node, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      })
      if (!blob) throw new Error('render failed')
      return blob
    } finally {
      if (scroller && body) {
        body.style.transform = prevTransform
        scroller.style.overflowY = prevOverflow
        scroller.scrollTop = prevScroll
      }
    }
  }

  async function downloadImage() {
    try {
      const blob = await renderPng()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `availability-week.png`
      a.click()
      URL.revokeObjectURL(url)
      showFlash('img', 'Downloaded ✓')
      track('png_download')
    } catch (e) {
      console.error(e)
      showFlash('img', 'Failed')
    }
  }

  function copyText() {
    const text = buildCopyText(app.blocks, selectedZones(), shareUrl)
    if (!text) {
      showFlash('txt', 'Nothing to copy')
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showFlash('txt', 'Copied ✓')
        track('text_copy')
      })
      .catch(() => showFlash('txt', 'Failed'))
  }

  async function copyBoth() {
    const text = buildCopyText(app.blocks, selectedZones(), shareUrl)
    if (!text) {
      showFlash('both', 'Nothing to copy')
      return
    }
    try {
      const item = new ClipboardItem({
        'image/png': renderPng(),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      showFlash('both', 'Copied ✓')
      track('image_copy')
    } catch (e) {
      // some browsers refuse multi-format items - fall back to image only
      console.warn('multi-format copy failed, trying image only', e)
      try {
        const item = new ClipboardItem({ 'image/png': renderPng() })
        await navigator.clipboard.write([item])
        showFlash('both', 'Image copied - use text button for text')
        track('image_copy')
      } catch (e2) {
        console.error(e2)
        showFlash('both', 'Failed')
      }
    }
  }

  function clearSelection() {
    if (app.blocks.length === 0) {
      showFlash('clear', 'Nothing to clear')
      return
    }
    clearBlocks()
    shareError = null
    showFlash('clear', 'Cleared ✓')
  }

  async function saveShare() {
    if (app.blocks.length === 0) {
      shareError = 'Add at least one availability block first.'
      return
    }
    sharing = true
    shareError = null
    app.share = null
    // capture what is being saved, so a later edit invalidates the link
    const sig = shareSignature()
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: app.blocks.map((b) => ({ start: b.start, end: b.end })),
          zones: {
            base: app.baseZone,
            second: app.secondZone,
            third: app.thirdZone,
          },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `server returned ${res.status}`)
      }
      const { slug } = await res.json()
      const url = `${location.origin}/${slug}`
      app.share = { url, sig }
      navigator.clipboard.writeText(url).catch(() => {})
    } catch (e) {
      shareError = e instanceof Error ? e.message : 'save failed'
    } finally {
      sharing = false
    }
  }
</script>

<div class="toolbar">
  <div class="btn-group">
    <button class="icon-btn" onclick={downloadImage} aria-label="Download calendar as image">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span class="tooltip">Download the calendar as a PNG image</span>
      {#if flash['img']}<span class="flash">{flash['img']}</span>{/if}
    </button>
    <button class="icon-btn" onclick={copyText} aria-label="Copy availability text">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <span class="tooltip">Copy the availability list as text</span>
      {#if flash['txt']}<span class="flash">{flash['txt']}</span>{/if}
    </button>
    <button class="icon-btn" onclick={copyBoth} aria-label="Copy image and text together">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="14" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 13-3.5-3.5L11 16" /><line x1="7" y1="21" x2="17" y2="21" />
      </svg>
      <span class="tooltip">Copy calendar image + text list together to the clipboard</span>
      {#if flash['both']}<span class="flash">{flash['both']}</span>{/if}
    </button>
    {#if !app.readOnly}
      <button class="icon-btn danger" onclick={clearSelection} aria-label="Clear selection">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
        </svg>
        <span class="tooltip">Clear every selected block</span>
        {#if flash['clear']}<span class="flash">{flash['clear']}</span>{/if}
      </button>
    {/if}
  </div>

  {#if !app.readOnly}
    <div class="share-group">
      <button class="share-btn" onclick={saveShare} disabled={sharing}>
        {sharing ? 'Saving…' : 'Save & get link'}
      </button>
      {#if shareUrl}
        <a class="share-url" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
        <span class="share-note">copied to clipboard - expires after your last block ends</span>
      {/if}
      {#if shareError}
        <span class="share-error">{shareError}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .btn-group {
    display: flex;
    gap: 0.3rem;
  }
  .icon-btn {
    position: relative;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 8px;
    padding: 0.45rem 0.55rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .icon-btn:hover {
    background: var(--surface-hover);
  }
  .icon-btn.danger:hover {
    color: var(--now);
    border-color: var(--now);
  }
  .tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--tooltip-bg);
    color: var(--tooltip-text);
    font-size: 0.72rem;
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
    z-index: 20;
  }
  .icon-btn:hover .tooltip {
    opacity: 1;
  }
  .flash {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--accent);
    color: #fff;
    font-size: 0.72rem;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    white-space: nowrap;
    z-index: 20;
  }
  .share-group {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .share-btn {
    border: none;
    background: var(--accent);
    color: #fff;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .share-btn:hover {
    filter: brightness(1.08);
  }
  .share-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .share-url {
    font-size: 0.88rem;
    color: var(--accent);
  }
  .share-note {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .share-error {
    font-size: 0.8rem;
    color: var(--now);
  }
</style>
