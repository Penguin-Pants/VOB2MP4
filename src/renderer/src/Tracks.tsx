import type { MediaStreamInfo } from '../../shared/types'

function describe(s: MediaStreamInfo): string {
  const parts: string[] = [s.codec]
  if (s.type === 'video' && s.width && s.height) parts.push(`${s.width}×${s.height}`)
  if (s.type === 'audio') {
    if (s.channelLayout) parts.push(s.channelLayout)
    else if (s.channels) parts.push(`${s.channels}ch`)
  }
  if (s.language) parts.push(s.language)
  if (s.title) parts.push(`“${s.title}”`)
  return parts.join(' · ')
}

export function Tracks({ streams }: { streams: MediaStreamInfo[] }): JSX.Element {
  const groups: Array<{ label: string; type: MediaStreamInfo['type'] }> = [
    { label: 'Video', type: 'video' },
    { label: 'Audio', type: 'audio' },
    { label: 'Subtitles', type: 'subtitle' }
  ]
  return (
    <div className="tracks">
      {groups.map(({ label, type }) => {
        const items = streams.filter((s) => s.type === type)
        if (items.length === 0) return null
        return (
          <div className="tracks__group" key={type}>
            <span className="tracks__label">{label}</span>
            <ul>
              {items.map((s) => (
                <li key={s.index}>
                  <code>#{s.index}</code> {describe(s)}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
