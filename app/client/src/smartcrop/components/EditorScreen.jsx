import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudCheck, LoaderCircle } from 'lucide-react'
import EditorFrame, { StatusChip, TimelinePlaceholder } from './EditorFrame.jsx'
import PreviewCanvas from './PreviewCanvas.jsx'
import TransportBar from './TransportBar.jsx'
import Timeline from './Timeline/Timeline.jsx'
import RenderStatus from './RenderStatus.jsx'
import RenderResult from './RenderResult.jsx'
import AspectPicker from './AspectPicker.jsx'
import LayoutPicker from './LayoutPicker.jsx'
import FailedPanel from './FailedPanel.jsx'
import VideoBox from './VideoBox.jsx'
import { useEditorSession } from '../hooks/useEditorSession.js'
import { usePreviewPlan } from '../hooks/usePreviewPlan.js'
import { usePlayer } from '../hooks/usePlayer.js'
import { useRender } from '../hooks/useRender.js'
import { withAspect, withLayout } from '../core/editList.js'
import { isBusy } from '../core/renderTracker.js'

// READY screen (spec 05 §2): preview + transport + aspect/layout pickers +
// timeline, all driven by one player.
// Changing aspect/layout follows 05 §3: new identity edit → buttons update at
// once → debounced preview plan swaps in while the video keeps playing, and
// the edit is autosaved in the background.

function useFullscreen(ref) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else ref.current?.requestFullscreen?.()
  }, [ref])

  return { isFullscreen, toggle }
}

function SaveStatus({ saving }) {
  return saving
    ? <StatusChip icon={<LoaderCircle size={13} className="sc-spinner" />}>Saving…</StatusChip>
    : <StatusChip icon={<CloudCheck size={13} />}>Saved</StatusChip>
}

// Save (05 §3): flush autosave first so the render is exactly the saved
// version, then start it. The result opens by itself once a render succeeds.
function useSaveAndResult({ editor, render, player }) {
  const [flushing, setFlushing] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const openedForRef = useRef(null)

  async function save() {
    setFlushing(true)
    try {
      render.start(await editor.flushEdits())
    } finally {
      setFlushing(false)
    }
  }

  const renderId = render.render?.renderId
  const { pause } = player
  useEffect(() => {
    if (render.phase !== 'succeeded' || openedForRef.current === renderId) return
    openedForRef.current = renderId
    pause()
    setResultOpen(true)
  }, [render.phase, renderId, pause])

  // Reopening later re-fetches the render: its signed URLs may have expired.
  async function viewResult() {
    await render.refresh()
    pause()
    setResultOpen(true)
  }

  return {
    save,
    saveDisabled: flushing || isBusy(render.phase),
    resultOpen,
    viewResult,
    closeResult: useCallback(() => setResultOpen(false), []),
  }
}

// Rendered once GET /editor has answered, so every hook has its data.
function Workspace({ project, editor }) {
  const { session, document: doc, changeDocument, saving } = editor
  const { media, timing, capabilities } = session
  const layoutsByAspect = capabilities.layoutsByAspect

  const player = usePlayer({ src: media.video.url, durationMs: timing.durationMs })
  const { preview, plan, pending } = usePreviewPlan(project.projectId, doc, session.preview)
  const render = useRender(project.projectId, project.activeRenderId)
  const result = useSaveAndResult({ editor, render, player })
  const previewRef = useRef(null)
  const fullscreen = useFullscreen(previewRef)

  function changeAspect(aspect) {
    if (aspect !== doc.aspect) changeDocument(withAspect(doc, aspect, timing.durationMs, layoutsByAspect))
  }

  function changeLayout(layout) {
    if (layout !== doc.defaultLayout) changeDocument(withLayout(doc, layout, timing.durationMs, layoutsByAspect))
  }

  const warnings = preview?.warnings ?? []

  return (
    <>
      <EditorFrame
        title={project.title}
        status={(
          <>
            <RenderStatus {...render} onCancel={render.cancel} onView={result.viewResult} />
            <SaveStatus saving={saving} />
          </>
        )}
        actions={(
          <button type="button" className="sc-pill-btn" onClick={result.save} disabled={result.saveDisabled}>
            Save
          </button>
        )}
        stage={<PreviewCanvas player={player} plan={plan} aspect={doc.aspect} pending={pending} containerRef={previewRef} />}
        transport={(
          <TransportBar player={player} isFullscreen={fullscreen.isFullscreen} onToggleFullscreen={fullscreen.toggle} />
        )}
        controls={(
          <>
            <AspectPicker value={doc.aspect} aspects={capabilities.aspects} onChange={changeAspect} />
            <LayoutPicker aspect={doc.aspect} value={doc.defaultLayout} layoutsByAspect={layoutsByAspect} onChange={changeLayout} />
            {warnings.map((w) => <p key={`${w.code}-${w.layout}`} className="sc-note">{w.message}</p>)}
          </>
        )}
        timeline={(
          <Timeline player={player} durationMs={timing.durationMs} media={media} keyboardEnabled={!result.resultOpen} />
        )}
      />
      {result.resultOpen && render.render?.output && (
        <RenderResult render={render.render} onClose={result.closeResult} />
      )}
    </>
  )
}

export default function EditorScreen({ project }) {
  const editor = useEditorSession(project.projectId)

  if (editor.error) {
    return (
      <EditorFrame
        title={project.title}
        stage={<FailedPanel aspect={project.initial?.aspect} title="Couldn't open the editor" message={editor.error.message} />}
        timeline={<TimelinePlaceholder />}
      />
    )
  }

  if (!editor.session || !editor.document) {
    return (
      <EditorFrame
        title={project.title}
        stage={<VideoBox aspect={project.initial?.aspect}><LoaderCircle size={30} className="sc-spinner" /></VideoBox>}
        timeline={<TimelinePlaceholder />}
      />
    )
  }

  return <Workspace project={project} editor={editor} />
}
