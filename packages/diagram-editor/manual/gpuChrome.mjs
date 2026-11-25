// Chrome launch settings for the on-device model harnesses on the
// workstation, where model compute must run on an RTX 3090 and never on the
// Quadro K620 display adapter.
//
// Chrome's built-in AI service (liboptimization_guide_internal.so with
// LiteRT) benchmarks the GPU about three minutes after launch and, on this
// host, selects the Quadro over Vulkan. Supplying the performance class skips
// that benchmark. With it, an idle Chrome selected no adapter in four
// minutes; without it, Chrome logged "Selected adapter: Quadro K620" at three
// minutes with no Coral page open.
export const GPU_CHROME_ARGS = ['--ozone-platform=wayland', '--enable-gpu',
  '--optimization-guide-performance-class=1', '--optimization-guide-disable-installer'];

export const IGNORED_DEFAULT_ARGS = ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

// Playwright passes Chrome's stderr only to its pw:browser debug stream,
// which it reads when it loads, so this module must be imported before
// Playwright is required.
process.env.DEBUG = [process.env.DEBUG, 'pw:browser'].filter(Boolean).join(',');

/**
 * Ends the process at once if any Chrome component logs an adapter other
 * than an RTX 3090. `onStop` runs first, to record what was observed.
 */
export function stopUnlessRtx3090(onStop = () => {}) {
  const write = process.stderr.write.bind(process.stderr);
  const chrome = new Set();
  process.stderr.write = (chunk, ...rest) => {
    const text = String(chunk);
    const launched = text.match(/<launched> pid=(\d+)/)?.[1];
    if (launched) chrome.add(Number(launched));
    const selected = text.match(/Selected adapter: ([^,]+)/)?.[1];
    if (selected && !/RTX 3090/.test(selected)) {
      // Playwright starts Chrome as a process-group leader: end the group.
      for (const pid of chrome) try { process.kill(-pid, 'SIGKILL'); } catch {}
      onStop(`Chrome selected adapter ${selected}`);
      write(`Stopped: Chrome selected adapter ${selected}\n`);
      process.exit(3);
    }
    return write(chunk, ...rest);
  };
}
