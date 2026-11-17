import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Captions, Film, Scissors, Image as ImageIcon, Download, ArrowRight, Loader2, VideoOff } from 'lucide-react'
import ProjectBar from '../shell/ProjectBar'
import { PROVIDERS } from '../config/providers'
import { getVideoOrNull } from '../api/videos'
import { getSavedClips } from '../api/clips'
import { getThumbnails } from '../api/thumbnails'
import { subtitleDownloadUrl } from '../api/transcription'
import { fmtSize, fmtDate } from '../lib/format'
import { formatMs } from '../smartcrop/core/time.js'

// `/v/:videoId` — one video and everything made from it so far: transcripts,
// the captioned video, saved clips and thumbnails, each with a download and a
// way into the tool that made it. Empty outputs say which tool makes them.
export default function OverviewPage() {
  const { videoId } = useParams()
  const [video, setVideo] = useState(undefined) // undefined = loading, null = not found
  const [clips, setClips] = useState(null)
  const [thumbs, setThumbs] = useState(null)
  const [durationMs, setDurationMs] = useState(null)

  useEffect(() => {
    let cancel = false
    setVideo(undefined)
    getVideoOrNull(videoId).then(v => { if (!cancel) setVideo(v) }).catch(() => { if (!cancel) setVideo(null) })
    getSavedClips(videoId).then(d => { if (!cancel) setClips(d?.clips || []) }).catch(() => { if (!cancel) setClips([]) })
    getThumbnails(videoId).then(s => { if (!cancel) setThumbs(s?.candidates || []) }).catch(() => { if (!cancel) setThumbs([]) })
    return () => { cancel = true }
  }, [videoId])

  if (video === null) {
    return (
      <div className="ov-page">
        <ProjectBar videoId={videoId} video={null} />
        <div className="lib-empty">
          <VideoOff size={24} />
          <strong>Video not found</strong>
          <span>It may have been deleted. Pick another video in the Library.</span>
          <Link to="/" className="btn btn-primary">Back to Library</Link>
        </div>
      </div>
    )
  }

  const providers = video?.providers || []
  const exported = (clips || []).filter(c => c.exported && c.clipUrl)
  const thumbImages = (thumbs || []).flatMap(c => [
    c.originalUrl && { key: `${c.idx}-o`, url: c.originalUrl, label: 'Original frame' },
    ...Object.entries(c.polished || {})
      .filter(([, p]) => p.status === 'ok' && p.url)
      .map(([prov, p]) => ({ key: `${c.idx}-${prov}`, url: p.url, label: `${prov === 'openai' ? 'OpenAI' : 'Gemini'} polish` })),
  ].filter(Boolean))

  const facts = [
    durationMs != null && formatMs(durationMs),
    Number.isFinite(video?.size) && fmtSize(video.size),
    video?.uploadedAt && `Uploaded ${fmtDate(video.uploadedAt)}`,
  ].filter(Boolean)

  return (
    <div className="ov-page">
      <ProjectBar videoId={videoId} video={video ?? null} />

      <div className="ov-body">
        <section className="ov-media" aria-label="Video">
          <div className="ov-stage">
            <video
              src={`/api/video/${videoId}`}
              controls
              preload="metadata"
              poster={video?.thumbnail}
              onLoadedMetadata={e => setDurationMs(e.currentTarget.duration * 1000)}
            />
          </div>
          <h1 className="ov-title" title={video?.filename}>{video?.filename || 'Loading…'}</h1>
          {facts.length > 0 && <p className="ov-facts">{facts.join(' · ')}</p>}
        </section>

        <section className="ov-shelf" aria-label="Outputs">
          <h2 className="ov-shelf-title">Made from this video</h2>

          <article className="ov-out">
            <header className="ov-out-head">
              <span className="ov-out-icon"><Captions size={16} /></span>
              <h3>Transcripts</h3>
              {providers.length > 0 && <span className="ov-count">{providers.length}</span>}
            </header>
            {video === undefined ? <ShelfLoading /> : providers.length === 0 ? (
              <ShelfEmpty text="Transcribe the video to edit captions, burn them in and find clips." to={`/v/${videoId}/captions`} action="Transcribe in Captions" />
            ) : (
              <ul className="ov-rows">
                {providers.map(id => (
                  <li key={id} className="ov-row">
                    <span className="ov-row-name">{PROVIDERS.find(p => p.id === id)?.label || id}</span>
                    <a className="btn btn-quiet btn-sm" href={subtitleDownloadUrl(videoId, id, 'srt')} download>
                      <Download size={13} /> SRT
                    </a>
                    <Link className="btn btn-secondary btn-sm" to={`/v/${videoId}/captions?provider=${id}`}>Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="ov-out">
            <header className="ov-out-head">
              <span className="ov-out-icon"><Film size={16} /></span>
              <h3>Captioned video</h3>
            </header>
            {video === undefined ? <ShelfLoading /> : !video.hasBurned ? (
              <ShelfEmpty text="Style the captions, then burn them into a copy of the video." to={`/v/${videoId}/captions`} action="Style captions" />
            ) : (
              <ul className="ov-rows">
                <li className="ov-row">
                  <span className="ov-row-name">Latest burn</span>
                  <a className="btn btn-quiet btn-sm" href={`/api/video/${videoId}/burned`} download>
                    <Download size={13} /> Download
                  </a>
                  <Link className="btn btn-secondary btn-sm" to={`/v/${videoId}/captions`}>Open</Link>
                </li>
              </ul>
            )}
          </article>

          <article className="ov-out">
            <header className="ov-out-head">
              <span className="ov-out-icon"><Scissors size={16} /></span>
              <h3>Saved clips</h3>
              {clips?.length > 0 && <span className="ov-count">{clips.length}</span>}
            </header>
            {clips === null ? <ShelfLoading /> : clips.length === 0 ? (
              video?.hasClips
                ? <ShelfEmpty text="Suggested clips are waiting. Save the ones you want to keep." to={`/v/${videoId}/clips`} action="Review clips" />
                : <ShelfEmpty text="Let AI pick the strongest moments, then save the ones you want." to={`/v/${videoId}/clips`} action="Find clips" />
            ) : (
              <ul className="ov-rows">
                {clips.map(c => (
                  <li key={c.id} className="ov-row">
                    <span className="ov-row-name" title={c.title}>{c.title || 'Untitled clip'}</span>
                    <span className="ov-row-meta tc">{formatMs((c.start || 0) * 1000)}–{formatMs((c.end || 0) * 1000)}</span>
                    {c.exported && c.clipUrl ? (
                      <a className="btn btn-quiet btn-sm" href={c.clipUrl} download><Download size={13} /> MP4</a>
                    ) : <span className="ov-row-meta">Not exported</span>}
                  </li>
                ))}
                <li className="ov-row-more">
                  <Link to={`/v/${videoId}/clips`}>
                    {exported.length < clips.length ? 'Export the rest in Clips' : 'Open Clips'} <ArrowRight size={13} />
                  </Link>
                </li>
              </ul>
            )}
          </article>

          <article className="ov-out">
            <header className="ov-out-head">
              <span className="ov-out-icon"><ImageIcon size={16} /></span>
              <h3>Thumbnails</h3>
              {thumbImages.length > 0 && <span className="ov-count">{thumbImages.length}</span>}
            </header>
            {thumbs === null ? <ShelfLoading /> : thumbImages.length === 0 ? (
              <ShelfEmpty text="Pick the best frames and polish them into thumbnails." to={`/v/${videoId}/thumbnails`} action="Generate thumbnails" />
            ) : (
              <>
                <div className="ov-thumbs">
                  {thumbImages.map(t => (
                    <a key={t.key} href={t.url.replace('/file/', '/download/')} download className="ov-thumb" title={`Download · ${t.label}`}>
                      <img src={t.url} alt={t.label} loading="lazy" />
                    </a>
                  ))}
                </div>
                <Link className="ov-row-more" to={`/v/${videoId}/thumbnails`}>Open Thumbnails <ArrowRight size={13} /></Link>
              </>
            )}
          </article>
        </section>
      </div>
    </div>
  )
}

function ShelfEmpty({ text, to, action }) {
  return (
    <div className="ov-empty">
      <span>{text}</span>
      <Link to={to} className="btn btn-secondary btn-sm">{action}</Link>
    </div>
  )
}

function ShelfLoading() {
  return <div className="ov-empty"><Loader2 size={14} className="spin" /></div>
}
