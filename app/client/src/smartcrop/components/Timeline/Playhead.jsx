// Vertical line + handle at the current time (spec 05 §5). Purely visual —
// the timeline content handles all pointer input, so grabbing the handle and
// clicking anywhere else scrub the same way.
export default function Playhead({ x }) {
  return <div className="sc-playhead" style={{ transform: `translateX(${x}px)` }} aria-hidden />
}
