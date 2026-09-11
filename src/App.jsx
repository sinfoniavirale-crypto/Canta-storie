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

// Il motore vocale nativo di Android rifiuta i testi troppo lunghi.
// Spezziamo ogni capitolo in blocchi più piccoli, tagliando a fine frase,
// e li leggiamo in sequenza: l'utente sente un'unica narrazione fluida.
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
  } catch (e) {
    // se il salvataggio fallisce, l'app continua a funzionare comunque
  }
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

  // salva il progresso ogni volta che si cambia capitolo
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
            <div className="player-case-title">{selectedCase.title}</div>
            <div className="chapter-title">{chapter.title}</div>
            <div className="chapter-indicator">
              Capitolo {chapterIndex + 1} di {selectedCase.chapters.length}
            </div>
            {audioError && (
              <div style={{ color: '#ff6a52', fontSize: 13, marginTop: 10 }}>
                Errore audio: {audioError}
              </div>
            )}
          </div>

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
