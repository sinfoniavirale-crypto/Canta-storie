import { useState, useEffect, useMemo, useRef } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import casi from './data/casi/index.js'

const WORDS_PER_MINUTE = 190
const PROGRESS_KEY = 'cantastorie-progress'
const MAX_CHUNK_CHARS = 1500

const estimateSeconds = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return (words / WORDS_PER_MINUTE) * 60
}

const formatTime = (seconds) => {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const splitTextIntoChunks = (text, maxChars = MAX_CHUNK_CHARS) => {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const candidate = current ? current + ' ' + sentence : sentence
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = candidate
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text]
}

const loadProgress = () => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

const saveProgress = (caseId, chapterIndex) => {
  try {
    const current = loadProgress()
    current[caseId] = chapterIndex
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(current))
  } catch (e) {}
}

// Genera le "razze" (raggi) di una bobina della cassetta, come un mulino a vento
const ReelSpokes = ({ cx, cy, r }) => {
  const spokeCount = 6
  const spokes = []
  for (let i = 0; i < spokeCount; i++) {
    const angle = (360 / spokeCount) * i
    spokes.push(
      <rect
        key={i}
        x={cx - 2.5}
        y={cy - r}
        width="5"
        height={r}
        fill="#4a4550"
        transform={`rotate(${angle} ${cx} ${cy})`}
      />
    )
  }
  return <>{spokes}</>
}

const Cassette = ({ isPlaying, caseTitle, chapterTitle }) => {
  return (
    <div className="cassette-wrap">
      <svg className="cassette" viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="292" height="182" rx="14" fill="#1c1920" stroke="#3a3540" strokeWidth="2" />
        <rect x="18" y="16" width="264" height="62" rx="4" fill="#ece4d3" />
        <text x="150" y="36" textAnchor="middle" fontFamily="'Special Elite', monospace" fontSize="13" fill="#1c1920">
          {(caseTitle || 'CANTA STORIE').toUpperCase()}
        </text>
        <text x="150" y="54" textAnchor="middle" fontFamily="'Crimson Text', serif" fontSize="11" fill="#5a5548">
          {chapterTitle || 'lato A'}
        </text>
        <line x1="30" y1="65" x2="270" y2="65" stroke="#c9412f" strokeWidth="1.5" />

        <rect x="34" y="90" width="232" height="80" rx="6" fill="#0d0b10" />

        <circle cx="90" cy="130" r="38" fill="#141119" stroke="#3a3540" strokeWidth="2" />
        <g className={isPlaying ? 'reel spinning' : 'reel'} style={{ transformOrigin: '90px 130px' }}>
          <ReelSpokes cx={90} cy={130} r={26} />
          <circle cx="90" cy="130" r="9" fill="#0d0b10" stroke="#5a5548" strokeWidth="1.5" />
        </g>

        <circle cx="210" cy="130" r="38" fill="#141119" stroke="#3a3540" strokeWidth="2" />
        <g className={isPlaying ? 'reel spinning' : 'reel'} style={{ transformOrigin: '210px 130px' }}>
          <ReelSpokes cx={210} cy={130} r={26} />
          <circle cx="210" cy="130" r="9" fill="#0d0b10" stroke="#5a5548" strokeWidth="1.5" />
        </g>

        <rect x="140" y="150" width="20" height="10" rx="2" fill="#0d0b10" stroke="#3a3540" />
        <circle cx="60" cy="176" r="3" fill="#3a3540" />
        <circle cx="240" cy="176" r="3" fill="#3a3540" />
      </svg>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState('home')
  const [selectedCase, setSelectedCase] = useState(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [chapterElapsed, setChapterElapsed] = useState(0)
  const [progress, setProgress] = useState({})
  const [audioError, setAudioError] = useState('')

  const playingRef = useRef(false)

  useEffect(() => {
    setProgress(loadProgress())
  }, [])

  useEffect(() => {
    setChapterElapsed(0)
  }, [chapterIndex, selectedCase])

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setChapterElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [isPlaying, chapterIndex])

  useEffect(() => {
    if (selectedCase) {
      saveProgress(selectedCase.id, chapterIndex)
      setProgress((prev) => ({ ...prev, [selectedCase.id]: chapterIndex }))
    }
  }, [selectedCase, chapterIndex])

  const totalCaseSeconds = useMemo(() => {
    if (!selectedCase) return 0
    return selectedCase.chapters.reduce((sum, ch) => sum + estimateSeconds(ch.text), 0)
  }, [selectedCase])

  const elapsedBaseSeconds = useMemo(() => {
    if (!selectedCase) return 0
    return selectedCase.chapters
      .slice(0, chapterIndex)
      .reduce((sum, ch) => sum + estimateSeconds(ch.text), 0)
  }, [selectedCase, chapterIndex])

  const totalElapsed = Math.min(elapsedBaseSeconds + chapterElapsed, totalCaseSeconds)

  const openCase = (caso) => {
    const savedChapter = loadProgress()[caso.id] ?? 0
    const startChapter = savedChapter < caso.chapters.length ? savedChapter : 0
    setSelectedCase(caso)
    setChapterIndex(startChapter)
    setIsPlaying(false)
    setAudioError('')
    setView('player')
  }

  const restartCase = () => {
    playingRef.current = false
    setChapterIndex(0)
    setIsPlaying(false)
    TextToSpeech.stop()
  }

  const backToHome = async () => {
    playingRef.current = false
    setIsPlaying(false)
    try { await TextToSpeech.stop() } catch (e) {}
    setView('home')
  }

  const speakChapter = async (caso, index) => {
    if (!caso || index >= caso.chapters.length) {
      setIsPlaying(false)
      return
    }
    const chunks = splitTextIntoChunks(caso.chapters[index].text)
    for (const chunk of chunks) {
      if (!playingRef.current) return
      try {
        await TextToSpeech.speak({
          text: chunk,
          lang: 'it-IT',
          rate: 0.88,
          pitch: 0.92,
          volume: 1.0,
        })
      } catch (e) {
        setAudioError(String(e?.message || e))
        setIsPlaying(false)
        playingRef.current = false
        return
      }
    }
    if (playingRef.current) {
      const next = index + 1
      if (next < caso.chapters.length) {
        setChapterIndex(next)
        speakChapter(caso, next)
      } else {
        setIsPlaying(false)
        playingRef.current = false
      }
    }
  }

  const togglePlay = () => {
    if (isPlaying) {
      playingRef.current = false
      setIsPlaying(false)
      TextToSpeech.stop()
    } else {
      setAudioError('')
      playingRef.current = true
      setIsPlaying(true)
      speakChapter(selectedCase, chapterIndex)
    }
  }

  const skip = async (direction) => {
    playingRef.current = false
    await TextToSpeech.stop()
    const next = chapterIndex + direction
    if (next < 0 || next >= selectedCase.chapters.length) return
    setChapterIndex(next)
    if (isPlaying) {
      playingRef.current = true
      speakChapter(selectedCase, next)
    }
  }

  if (view === 'player' && selectedCase) {
    const chapter = selectedCase.chapters[chapterIndex]
    return (
      <div className="app">
        <div className="player">
          <div className="player-top">
            <button className="back-btn" onClick={backToHome}>&larr; Elenco casi</button>
            <div className="chapter-indicator">
              Capitolo {chapterIndex + 1} di {selectedCase.chapters.length}
            </div>
            {audioError && (
              <div style={{ color: '#ff6a52', fontSize: 13, marginTop: 10 }}>
                Errore audio: {audioError}
              </div>
            )}
          </div>

          <Cassette
            isPlaying={isPlaying}
            caseTitle={selectedCase.title}
            chapterTitle={chapter.title}
          />

          <div>
            <div className="time-readout">
              {formatTime(totalElapsed)} / {formatTime(totalCaseSeconds)}
            </div>
            <div className="controls">
              <button className="skip-btn" onClick={() => skip(-1)}>&laquo;</button>
              <button className="play-btn" onClick={togglePlay}>
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <button className="skip-btn" onClick={() => skip(1)}>&raquo;</button>
            </div>
            <div className="progress-dots">
              {selectedCase.chapters.map((_, i) => (
                <span key={i} className={i === chapterIndex ? 'active' : ''} />
              ))}
            </div>
            {chapterIndex > 0 && (
              <button className="restart-btn" onClick={restartCase}>
                Ricomincia dall'inizio
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <h1>CANTA STORIE</h1>
        <p>cronache dell'ignoto</p>
      </div>
      <div className="list">
        {casi.length === 0 && (
          <div className="empty-state">Nessun caso disponibile ancora.</div>
        )}
        {casi.map((caso) => {
          const savedChapter = progress[caso.id]
          const hasProgress = savedChapter > 0 && savedChapter < caso.chapters.length
          return (
            <div className="case-card" key={caso.id} onClick={() => openCase(caso)}>
              <h2>{caso.title}</h2>
              <p>{caso.teaser}</p>
              <span className="chapters-count">
                {hasProgress
                  ? `Ripreso dal capitolo ${savedChapter + 1} di ${caso.chapters.length}`
                  : `${caso.chapters.length} capitoli`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
