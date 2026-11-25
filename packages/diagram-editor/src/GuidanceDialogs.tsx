import { useRef } from 'react';
import { bundledSourceExamples028 } from './exampleSources028';
import { aboutLicences, HELP_SECTIONS, helpSections, ON_DEVICE_USE_PAGES, type GuidanceBlock, type ReleaseIdentity } from './guidanceContent';
import { ON_DEVICE_MODEL_AVAILABLE } from './releaseFeatures029';
import { CoralDialog } from './ui/CoralDialog';
import { OPEN_FILE_ACCEPT } from '@coral-viz/language';
import { describeOpenReason, type OpenFailure, type OpenFileInput } from './openFile';

type Theme = Record<string, string>;

export interface WelcomeDialogProps {
  isOpen: boolean;
  hasRecovery: boolean;
  linkedExample?: { id: string; name: string; description: string } | null;
  exampleLinkError?: string | null;
  announcement: string;
  onRecover: () => void;
  onDiscardRecovery: () => void;
  onBlank: (invoker: HTMLElement | null) => void;
  onExample: (id: string) => void;
  onOpenFile: (file: OpenFileInput) => boolean | Promise<boolean>;
  openFailure?: OpenFailure | null;
  onAnnouncement: (message: string) => void;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
  shouldRestoreFocus?: () => boolean;
  theme: Theme;
  themeName?: 'light' | 'dark';
}

/** Every reason a file did not open, visible rather than only announced. */
export function OpenFailureList({ failure, onDismiss }: { failure: OpenFailure; onDismiss?: () => void }) {
  return <div role="alert" className="coral-notice coral-notice--error" style={{ padding: '8px 16px' }}>
    <strong>Could not open {failure.fileName}. Your current work is unchanged.</strong>
    <ul style={{ margin: '4px 0 0', paddingLeft: '20px' }}>
      {failure.reasons.map((reason, index) => <li key={index}>{describeOpenReason(reason)}</li>)}
    </ul>
    {onDismiss && <button className="coral-button coral-button--quiet" type="button" onClick={onDismiss}>Dismiss</button>}
  </div>;
}

export function WelcomeDialog(props: WelcomeDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openFile = async (file?: File) => {
    if (!file) return;
    try {
      // The open pipeline announces every refusal with its own reason (an update
      // owner, a blocked file, or a cancelled replacement); overwriting it with
      // a generic line would hide why (TR94-C4-F4).
      await props.onOpenFile({ name: file.name, text: await file.text() });
    } catch {
      props.onAnnouncement('The selected file could not be read. Your current work is unchanged.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return <CoralDialog themeName={props.themeName} open={props.isOpen} title="Welcome to Coral" closeLabel="Close welcome" onClose={props.onClose} initialFocus="first" restoreFocusTo={props.restoreFocusTo} shouldRestoreFocus={props.shouldRestoreFocus}>
    <p>Choose how to begin. Documents stay local unless you explicitly use a network provider.</p>
    {props.hasRecovery && <section aria-label="Recovery available">
      <p>Unsaved recovery data is available. Recover it before starting something else.</p>
      <button data-primary className="coral-button coral-button--primary" type="button" onClick={props.onRecover}>Recover your work</button>{' '}
      <button className="coral-button coral-button--quiet" type="button" onClick={props.onDiscardRecovery}>Discard recovery</button>
    </section>}
    {props.exampleLinkError && <p role="alert">{props.exampleLinkError}</p>}
    {props.linkedExample && <section aria-label="Requested example">
      <h3>Requested example</h3>
      <p>{props.linkedExample.name} — {props.linkedExample.description}</p>
      <p>Open an editable local copy when you are ready.</p>
      <button className="coral-button coral-button--primary" type="button" onClick={() => props.onExample(props.linkedExample!.id)}>Open requested example</button>
    </section>}
    <section aria-label="Start a diagram">
      <h3>Start a diagram</h3>
      <button data-primary={!props.hasRecovery || undefined} className={`coral-button ${props.hasRecovery ? 'coral-button--secondary' : 'coral-button--primary'}`} type="button" onClick={(event) => props.onBlank(event.currentTarget)}>Blank diagram</button>{' '}
      <button className="coral-button coral-button--secondary" type="button" onClick={() => inputRef.current?.click()}>Open local file</button>
      <input ref={inputRef} hidden type="file" accept={OPEN_FILE_ACCEPT} aria-label="Choose a diagram file" onChange={(event) => void openFile(event.target.files?.[0])} />
    </section>
    <section aria-label="Bundled examples">
      <h3>Bundled examples</h3>
      {bundledSourceExamples028.map((example) => <button className="coral-button coral-button--quiet" key={example.id} type="button" aria-label={`Open ${example.name} example`} onClick={() => props.onExample(example.id)} style={{ display: 'block', margin: '6px 0' }}>
        {example.name} — {example.description}
      </button>)}
    </section>
    {props.openFailure && <OpenFailureList failure={props.openFailure} />}
    {props.announcement && <p>{props.announcement}</p>}
  </CoralDialog>;
}

function renderBlock(block: GuidanceBlock, index: number) {
  if (block.kind === 'paragraph') return <p key={index}>{block.text}</p>;
  if (block.kind === 'steps') return <ol key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ol>;
  if (block.kind === 'shortcutList') return <dl key={index}>{block.items.map(([label, chord]) => <div key={label}><dt>{label}</dt><dd><code>{chord}</code></dd></div>)}</dl>;
  if (block.kind === 'table') return <table key={index}><tbody>{block.rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>;
  if (block.kind === 'link') return <p key={index}><a href={block.href} target="_blank" rel="noreferrer">{block.text}</a></p>;
  return <p key={index} role={block.tone === 'danger' ? 'alert' : undefined}><strong>{block.tone}:</strong> {block.text}</p>;
}

export function HelpDialog({ isOpen, onClose, onOpenWelcome, restoreFocusTo, theme: _theme, themeName, onDevice = ON_DEVICE_MODEL_AVAILABLE }: { isOpen: boolean; onClose: () => void; onOpenWelcome?: () => void; restoreFocusTo?: HTMLElement | null; theme: Theme; themeName?: 'light' | 'dark'; onDevice?: boolean }) {
  return <CoralDialog themeName={themeName} open={isOpen} title="Help" closeLabel="Close help" onClose={onClose} restoreFocusTo={restoreFocusTo}>
    {onOpenWelcome && <p><button className="coral-button coral-button--secondary" type="button" onClick={onOpenWelcome}>Open Welcome and examples</button></p>}
    {(onDevice === ON_DEVICE_MODEL_AVAILABLE ? HELP_SECTIONS : helpSections(onDevice)).map((section) => <section key={section.id} aria-labelledby={`help-${section.id}`}>
      <h3 id={`help-${section.id}`}>{section.title}</h3>
      {section.blocks.map(renderBlock)}
    </section>)}
    <p><a href="https://github.com/coreyt/coral" target="_blank" rel="noreferrer">Coral source (requires a network)</a></p>
    <p><a href="https://github.com/coreyt/coral/issues" target="_blank" rel="noreferrer">Coral support (requires a network)</a></p>
  </CoralDialog>;
}

export function AboutDialog({ isOpen, identity, onClose, restoreFocusTo, theme: _theme, themeName, onDevice = ON_DEVICE_MODEL_AVAILABLE }: { isOpen: boolean; identity: ReleaseIdentity | null; onClose: () => void; restoreFocusTo?: HTMLElement | null; theme: Theme; themeName?: 'light' | 'dark'; onDevice?: boolean }) {
  return <CoralDialog themeName={themeName} open={isOpen} title="About Coral" closeLabel="Close about" onClose={onClose} restoreFocusTo={restoreFocusTo}>
    <p>{identity ? `Version ${identity.version}` : 'Version unavailable'}</p>
    <p>{identity ? `Commit ${identity.commit}` : 'Commit unavailable'}</p>
    <p>Coral is distributed with its license and bundled third-party notices, including:</p>
    <table aria-label="Third-party licenses"><tbody>{aboutLicences(onDevice).map(([name, licence]) => <tr key={name}><th>{name}</th><td>{licence}</td></tr>)}</tbody></table>
    {onDevice && <p><a href={ON_DEVICE_USE_PAGES.explain.href} target="_blank" rel="noreferrer">{ON_DEVICE_USE_PAGES.explain.text}</a></p>}
    <p><a href="https://github.com/coreyt/coral" target="_blank" rel="noreferrer">Source and license information (requires a network)</a></p>
    <p><a href="https://github.com/coreyt/coral/issues" target="_blank" rel="noreferrer">Support (requires a network)</a></p>
  </CoralDialog>;
}
