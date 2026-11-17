import { useEffect, useRef, useState } from 'react';
import { monthLabel, plural } from '../lib/format';
import * as gp from '../lib/googlePhotos';
import { filesToSources, fromDrop, fromFileInput, groupIntoDrafts, importAlbum, MAX_ITEMS, mediaKind, sample, type Draft } from '../lib/importer';
import { go } from '../lib/router';
import { sampleDrafts } from '../lib/sample';
import type { Album, ImportSource, SourceKind } from '../lib/types';
import { posterUrl } from '../lib/urls';
import { useLibrary } from '../state/library';
import { Icon } from './Icons';

interface Job {
  id: string;
  title: string;
  source: SourceKind;
  entries: ImportSource[];
}
interface JobState {
  done: number;
  total: number;
  status: 'waiting' | 'frames' | 'poster' | 'ready' | 'failed';
  album?: Album;
  skipped?: number;
  error?: string;
}

type Step =
  | { name: 'source' }
  | { name: 'select'; drafts: Draft[] }
  | { name: 'google' }
  | { name: 'working'; jobs: Job[] };

// ---------- Step 2: choose which folders become films ----------

function DraftRow({ draft, checked, name, onToggle, onName }: { draft: Draft; checked: boolean; name: string; onToggle: () => void; onName: (n: string) => void }) {
  // Peek at a few frames so each folder is recognisable.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = sample(draft.files.filter((f) => mediaKind(f.name, f.type) === 'photo'), 4).map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [draft]);

  return (
    <li className={`draft${checked ? ' on' : ''}`}>
      <button className="draft-check" role="checkbox" aria-checked={checked} onClick={onToggle} aria-label={`Include ${name}`}>
        {checked && <Icon name="check" size={16} />}
      </button>
      <div className="draft-strip" onClick={onToggle}>
        {previews.map((u) => (
          <img key={u} src={u} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        ))}
      </div>
      <div className="draft-info">
        <input value={name} maxLength={60} onChange={(e) => onName(e.target.value)} aria-label="Film title" />
        <span className="muted">
          {draft.found > draft.files.length ? `${draft.files.length} of ${draft.found.toLocaleString()} items, sampled evenly` : plural(draft.found, 'item')}
        </span>
      </div>
    </li>
  );
}

function SelectStep({ drafts, onBack, onStart }: { drafts: Draft[]; onBack: () => void; onStart: (jobs: Job[]) => void }) {
  const [checked, setChecked] = useState(() => new Set(drafts.length <= 6 ? drafts.map((d) => d.id) : []));
  const [names, setNames] = useState(() => Object.fromEntries(drafts.map((d) => [d.id, d.name])));
  const chosen = drafts.filter((d) => checked.has(d.id));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <header className="flow-head">
        <h2>{drafts.length === 1 ? 'Name your film' : 'Which albums get a premiere?'}</h2>
        <p>
          {drafts.length === 1
            ? 'You can rename it any time.'
            : `Found ${plural(drafts.length, 'album')}. Each one you tick becomes its own film.`}
          {drafts.some((d) => d.found > MAX_ITEMS) && ` Very large albums are trimmed to ${MAX_ITEMS} moments.`}
        </p>
      </header>
      {drafts.length > 1 && (
        <div className="flow-tools">
          <button className="link" onClick={() => setChecked(new Set(drafts.map((d) => d.id)))}>
            Select all
          </button>
          <button className="link" onClick={() => setChecked(new Set())}>
            Clear
          </button>
        </div>
      )}
      <ul className="drafts">
        {drafts.map((d) => (
          <DraftRow key={d.id} draft={d} checked={checked.has(d.id)} name={names[d.id]} onToggle={() => toggle(d.id)} onName={(n) => setNames((p) => ({ ...p, [d.id]: n }))} />
        ))}
      </ul>
      <footer className="flow-foot">
        <button className="btn glass" onClick={onBack}>
          Back
        </button>
        <button
          className="btn primary"
          disabled={!chosen.length}
          onClick={() => onStart(chosen.map((d) => ({ id: d.id, title: names[d.id].trim() || d.name, source: 'device', entries: filesToSources(d.files) })))}
        >
          <Icon name="sparkle" /> {chosen.length > 1 ? `Create ${chosen.length} films` : 'Create film'}
        </button>
      </footer>
    </>
  );
}

// ---------- Google Photos ----------

type GoogleState =
  | { name: 'setup' }
  | { name: 'idle' }
  | { name: 'signing' }
  | { name: 'picker'; token: string; session: gp.PickerSession }
  | { name: 'loading' }
  | { name: 'picked'; entries: ImportSource[] };

function GoogleStep({ onBack, onStart }: { onBack: () => void; onStart: (jobs: Job[]) => void }) {
  const [clientId, setClientId] = useState(gp.getClientId);
  const [state, setState] = useState<GoogleState>(() => (gp.getClientId() ? { name: 'idle' } : { name: 'setup' }));
  const [error, setError] = useState('');
  const [title, setTitle] = useState(`Google Photos · ${monthLabel(Date.now())}`);
  const abort = useRef<AbortController>(undefined);

  // Load Google's sign-in script up front so the click can open its popup directly.
  useEffect(() => {
    gp.loadGis().catch((e: Error) => setError(e.message));
    return () => abort.current?.abort();
  }, []);

  const fail = (e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    setError(e instanceof Error ? e.message : 'Something went wrong.');
    setState({ name: 'idle' });
  };

  const connect = async () => {
    setError('');
    setState({ name: 'signing' });
    try {
      const token = await gp.requestToken(clientId);
      const session = await gp.createSession(token);
      setState({ name: 'picker', token, session });
      abort.current = new AbortController();
      await gp.waitForPick(token, session, abort.current.signal);
      setState({ name: 'loading' });
      const picked = await gp.listPicked(token, session.id);
      gp.endSession(token, session.id);
      if (!picked.length) throw new Error('No photos were selected.');
      setState({ name: 'picked', entries: sample(gp.pickedToSources(token, picked), MAX_ITEMS) });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <header className="flow-head">
        <h2>Google Photos</h2>
        <p>
          Google opens its own picker where you browse your albums and choose what to share. Photflix only ever receives the
          photos you select there.
        </p>
      </header>

      {state.name === 'setup' && (
        <div className="setup">
          <p>One-time setup. Google requires every app to identify itself with a client ID:</p>
          <ol>
            <li>
              In <a href="https://console.cloud.google.com/apis/library/photospicker.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a>, enable the <strong>Photos Picker API</strong>.
            </li>
            <li>
              Under <em>Credentials</em>, create an <strong>OAuth client ID</strong> of type “Web application”.
            </li>
            <li>
              Add <code>{location.origin}</code> as an authorised JavaScript origin.
            </li>
            <li>Paste the client ID here.</li>
          </ol>
          <div className="setup-field">
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc…apps.googleusercontent.com" spellCheck={false} />
            <button
              className="btn primary"
              disabled={!/\.apps\.googleusercontent\.com$/.test(clientId.trim())}
              onClick={() => {
                gp.saveClientId(clientId);
                setClientId(clientId.trim());
                setState({ name: 'idle' });
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {(state.name === 'idle' || state.name === 'signing') && (
        <div className="google-box">
          <button className="btn primary large" onClick={connect} disabled={state.name === 'signing'}>
            <Icon name="cloud" /> {state.name === 'signing' ? 'Waiting for Google…' : 'Connect Google Photos'}
          </button>
          <button className="link" onClick={() => setState({ name: 'setup' })}>
            Change client ID
          </button>
        </div>
      )}

      {state.name === 'picker' && (
        <div className="google-box">
          <a className="btn primary large" href={`${state.session.pickerUri}/autoclose`} target="_blank" rel="noreferrer">
            <Icon name="images" /> Open the Google Photos picker
          </a>
          <p className="muted pulse">Choose your photos there, press Done, then come back. This page will pick up from here.</p>
        </div>
      )}

      {state.name === 'loading' && <p className="muted pulse google-box">Fetching your selection…</p>}

      {state.name === 'picked' && (
        <div className="google-box">
          <p>{plural(state.entries.length, 'item')} ready. Give the film a title:</p>
          <input className="title-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <footer className="flow-foot">
        <button className="btn glass" onClick={onBack}>
          Back
        </button>
        {state.name === 'picked' && (
          <button className="btn primary" onClick={() => onStart([{ id: crypto.randomUUID(), title: title.trim() || 'Google Photos', source: 'google', entries: state.entries }])}>
            <Icon name="sparkle" /> Create film
          </button>
        )}
      </footer>
    </>
  );
}

// ---------- Step 3: cutting the films ----------

function WorkingStep({ jobs }: { jobs: Job[] }) {
  const { refresh } = useLibrary();
  const [states, setStates] = useState<Record<string, JobState>>(() =>
    Object.fromEntries(jobs.map((j) => [j.id, { done: 0, total: j.entries.length, status: 'waiting' }])),
  );
  const started = useRef(false);
  const patch = (id: string, s: Partial<JobState>) => setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...s } }));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      navigator.storage?.persist?.().catch(() => {});
      for (const job of jobs) {
        patch(job.id, { status: 'frames' });
        try {
          const { album, skipped } = await importAlbum({
            title: job.title,
            source: job.source,
            entries: job.entries,
            onProgress: (p) => patch(job.id, { done: p.done, total: p.total, status: p.stage }),
          });
          patch(job.id, { status: 'ready', album, skipped });
        } catch (e) {
          const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
          patch(job.id, { status: 'failed', error: quota ? 'This browser is out of storage space.' : e instanceof Error ? e.message : 'Import failed.' });
        }
        await refresh();
      }
    })();
  }, [jobs, refresh]);

  const list = jobs.map((j) => ({ job: j, s: states[j.id] }));
  const finished = list.every(({ s }) => s.status === 'ready' || s.status === 'failed');
  const made = list.filter(({ s }) => s.album).map(({ s }) => s.album!);

  return (
    <>
      <header className="flow-head">
        <h2>{finished ? (made.length ? 'Ready for the big screen' : 'That did not work') : 'Cutting your film…'}</h2>
        <p>{finished ? (made.length ? 'Posters printed, chapters set.' : 'Nothing could be imported.') : 'Sorting frames, choosing a cover, printing the poster. Keep this tab open.'}</p>
      </header>
      <ul className="jobs">
        {list.map(({ job, s }) => (
          <li key={job.id} className={`job ${s.status}`}>
            <div className="job-poster">{s.album ? <img src={posterUrl(s.album)} alt="" /> : <span className="job-spin" />}</div>
            <div className="job-info">
              <strong>{s.album?.title ?? job.title}</strong>
              <span className="muted">
                {s.status === 'waiting' && 'In the queue'}
                {s.status === 'frames' && `Developing frame ${Math.min(s.done + 1, s.total)} of ${s.total}`}
                {s.status === 'poster' && 'Printing the poster…'}
                {s.status === 'ready' && `${plural(s.album!.itemCount, 'moment')}${s.skipped ? ` · ${s.skipped} skipped (unsupported format)` : ''}`}
                {s.status === 'failed' && s.error}
              </span>
              <div className="job-bar">
                <i style={{ width: `${s.status === 'ready' ? 100 : (s.done / Math.max(1, s.total)) * 100}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <footer className="flow-foot">
        <span className="spacer" />
        <button className="btn primary" disabled={!finished} onClick={() => go(made.length === 1 ? `/title/${made[0].id}` : '/')}>
          {finished ? (made.length ? 'Go to the library' : 'Close') : 'Working…'}
        </button>
      </footer>
    </>
  );
}

// ---------- Shell ----------

export function ImportFlow() {
  const [step, setStep] = useState<Step>({ name: 'source' });
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState('');
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const working = step.name === 'working';
  const close = () => !working && go('/');

  useEffect(() => {
    document.body.classList.add('locked');
    // The directory attribute is not part of React's typed input props.
    folderInput.current?.setAttribute('webkitdirectory', '');
    return () => document.body.classList.remove('locked');
  }, []);

  const offer = (files: { file: File; path: string }[]) => {
    const drafts = groupIntoDrafts(files, `Moments · ${monthLabel(Date.now())}`);
    if (!drafts.length) return setNote('No photos or videos found there. Try another folder.');
    setNote('');
    setStep({ name: 'select', drafts });
  };

  const toSource = () => setStep({ name: 'source' });
  const start = (jobs: Job[]) => setStep({ name: 'working', jobs });

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet flow" role="dialog" aria-modal="true" aria-label="New film">
        {!working && (
          <button className="round sheet-close" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        )}

        {step.name === 'source' && (
          <>
            <header className="flow-head">
              <h2>Where are the photos?</h2>
              <p>Pick an album and Photflix turns it into a film. Photos are stored in this browser only and never uploaded.</p>
            </header>
            <div
              className={`sources${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => (e.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragging(false);
                offer(await fromDrop(e.dataTransfer));
              }}
            >
              <button className="source" onClick={() => folderInput.current?.click()}>
                <Icon name="folder" size={30} />
                <strong>Folder on this device</strong>
                <span>Choose a folder. Every sub-folder with photos shows up as an album to pick from.</span>
              </button>
              <button className="source" onClick={() => filesInput.current?.click()}>
                <Icon name="images" size={30} />
                <strong>Individual photos</strong>
                <span>Hand-pick photos and videos for a single film.</span>
              </button>
              <button className="source" onClick={() => setStep({ name: 'google' })}>
                <Icon name="cloud" size={30} />
                <strong>Google Photos</strong>
                <span>Select from your Google Photos albums with Google’s own picker.</span>
              </button>
              <div className="drop-hint">{dragging ? 'Drop to import' : 'or drag folders and photos anywhere onto this panel'}</div>
            </div>
            {note && <p className="error">{note}</p>}
            <footer className="flow-foot">
              <button className="link" onClick={() => start(sampleDrafts().map((d) => ({ id: crypto.randomUUID(), title: d.title, source: 'sample', entries: d.entries })))}>
                <Icon name="sparkle" size={18} /> No photos handy? Load a sample library
              </button>
            </footer>
            <input ref={folderInput} type="file" multiple hidden onChange={(e) => (e.target.files && offer(fromFileInput(e.target.files)), (e.target.value = ''))} />
            <input ref={filesInput} type="file" multiple hidden accept="image/*,video/*" onChange={(e) => (e.target.files && offer(fromFileInput(e.target.files)), (e.target.value = ''))} />
          </>
        )}

        {step.name === 'select' && <SelectStep drafts={step.drafts} onBack={toSource} onStart={start} />}
        {step.name === 'google' && <GoogleStep onBack={toSource} onStart={start} />}
        {step.name === 'working' && <WorkingStep jobs={step.jobs} />}
      </div>
    </div>
  );
}
